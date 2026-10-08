import { EventStatus, Prisma, type AuditAction, type EventType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import {
  assertCoordinatePairComplete,
  assertValidCoordinatePair,
  validateCoordinatePair,
} from '../../shared/utils/coordinates';
import { normalizeForMatch } from '../../shared/utils/canonicalText';
import { auditService } from '../audit/audit.service';
import {
  buildEventSlug,
  EVENT_INCLUDE,
  isEventPubliclyVisible,
  mapEventRow,
  MODERATION_TRANSITIONS,
  type EventWithRelations,
} from './events.helpers';
import { publicEventWhere, startOfTodayUtc } from './events-public-visibility';
import { parseEventTypeFilter } from './events.geo.service';
import type {
  AdminListEventsQueryInput,
  CancelEventInput,
  CreateEventInput,
  EventListQueryInput,
  RejectEventInput,
  AdminEventReportsQueryInput,
  ReportEventInput,
  UnpublishEventInput,
  UpdateEventInput,
} from './events.validation';
import { parseEventDate, normalizeEventTime } from './events.validation';
import {
  buildEventLifecycleCountsWhere,
  buildEventLifecycleWhere,
  isAdminEventDeletable,
  type EventLifecycle,
} from './events.lifecycle';

/**
 * Where the moderation rules live.
 *
 * Invariants this service is responsible for:
 *   - a new submission is ALWAYS PENDING; the client cannot set `status`
 *   - only an admin may leave PENDING; a user editing an APPROVED event sends it
 *     back to PENDING for a material change
 *   - owner-or-admin on every single-row mutation (no IDOR)
 *   - coordinates are validated, never defaulted
 */
export { EVENT_INCLUDE, type EventWithRelations } from './events.helpers';

/**
 * One row of `GET /admin/events/:id/duplicates`. Carries the similarity score
 * and the distance alongside the dates so the reviewer can see *why* it matched
 * rather than being told only that it matched.
 */
export type AdminDuplicateCandidate = {
  id: string;
  title: string;
  slug: string;
  status: EventStatus;
  eventType: EventType;
  city: string;
  state: string;
  startDate: Date;
  endDate: Date | null;
  coverImage: string | null;
  distanceMeters: number;
  titleSimilarity: number;
  dateOverlapDays: number;
};

export interface EventViewer {
  id: string;
  isAdmin: boolean;
  /**
   * Set only by the legacy vendor adapters, and only after
   * `verifyVendorAccess` proved the caller manages that exact Place. Grants
   * manage-scoped access to the events attached to it.
   */
  managesPlaceId?: string;
}

/**
 * The subset of a stored row `isMaterialChange` compares against. Typed
 * explicitly so adding a moderated column forces a decision here instead of
 * silently becoming a non-material edit.
 */
type MaterialEventSnapshot = {
  title: string;
  description: string | null;
  eventType: EventType;
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  city: string;
  state: string;
  coverImage: string | null;
  images: string[];
  /// The card teaser and the price — both are public claims about the event.
  shortDescription: string | null;
  entryFee: number | null;
};

/**
 * A description edit shorter than this is treated as a typo fix. Anything
 * longer is assumed to be new copy and re-reviewed.
 */
const DESCRIPTION_TYPO_TOLERANCE = 120;

/**
 * How similar two texts must be before a description change counts as a typo
 * rather than a rewrite. Deliberately high: the cost of a false "typo" is an
 * unmoderated change to a public listing, and the cost of a false "rewrite" is
 * a re-review, which is cheap.
 */
const DESCRIPTION_TYPO_SIMILARITY = 0.82;

/**
 * Dice coefficient over character bigrams, 0..1.
 *
 * O(n), no dependency, and tolerant of word order and inserted words, which is
 * what both duplicate *titles* and typo-level *description* edits need. Shared
 * by duplicate detection and the material-change guard so "similar" means the
 * same thing in both places.
 */
export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return a === b ? 1 : 0;
  let overlap = 0;
  for (const [g, count] of ba) {
    const other = bb.get(g);
    if (other) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/**
 * `auditService.log` is positional: (action, entityType, entityId, actorId,
 * placeId?, previous?, newValues?). Every event audit goes through here so the
 * call shape stays in one place instead of at 10 call sites.
 */
async function auditEvent(
  action: AuditAction,
  entityId: string,
  actorId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await auditService.log(action, 'Event', entityId, actorId, null, null, metadata);
}

/** How far to look for duplicate candidates, and how tight the match must be. */
const DUPLICATE_WINDOW_DEGREES = 0.01; // ≈ 1.1 km
const DUPLICATE_WINDOW_DAYS = 3;
const DUPLICATE_TITLE_SIMILARITY = 0.82;

export const eventsService = {
  // ── Public reads ───────────────────────────────────────────────────────────

  /**
   * `GET /events/:idOrSlug` — public.
   *
   * Access is decided here rather than by a WHERE clause alone because "visible"
   * spans two axes: moderation status AND parent-Place visibility. A non-admin
   * who is not the owner gets the public gate; the owner always gets their own
   * submission so they can watch it move through moderation; an admin sees all.
   */
  async getEvent(idOrSlug: string, viewer: EventViewer | null) {
    const event = await this.findRaw(idOrSlug);
    if (!event) {
      // Do not distinguish "does not exist" from "is not visible to you" for
      // non-privileged callers: a 404 vs 403 difference is an enumeration oracle.
      throw new ApiError(404, 'Event not found.');
    }

    const isOwner = viewer?.id != null && event.createdById === viewer.id;
    if (!viewer?.isAdmin && !isOwner && !isEventPubliclyVisible(event)) {
      throw new ApiError(404, 'Event not found.');
    }

    return mapEventRow(event, viewer, { includeModerationFields: isOwner || viewer?.isAdmin === true });
  },

  /**
   * Approved reels linked to an event, newest first.
   *
   * Reuses `getEvent` so the visibility rules are identical: a reel must never
   * be reachable for an event the caller cannot see, which would otherwise be a
   * way to probe unapproved or parent-hidden listings through the Reels feed.
   *
   * Drafts and pending reels are excluded regardless of caller, so this is not
   * a moderation backdoor.
   */
  async listReels(idOrSlug: string, viewer: EventViewer | null, limit = 20) {
    await this.getEvent(idOrSlug, viewer);
    const event = await prisma.event.findFirst({
      where: { deletedAt: null, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!event) throw new ApiError(404, 'Event not found.');

    const capped = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return prisma.reel.findMany({
      where: { eventId: event.id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: capped,
      // Explicit projection rather than a bare row: the detail screen renders a
      // card per reel, which needs the creator's public handle and a poster
      // frame. Keeps the `videoUrl` off a list endpoint that never plays it.
      select: {
        id: true,
        title: true,
        thumbnail: true,
        likes: true,
        views: true,
        createdAt: true,
        creator: { select: { id: true, username: true, avatar: true, verified: true } },
      },
    });
  },

  /** Resolve by primary key or slug. */
  async findRaw(idOrSlug: string): Promise<EventWithRelations | null> {
    return prisma.event.findFirst({
      where: { deletedAt: null, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: EVENT_INCLUDE,
    });
  },

  /**
   * `GET /events` — public list.
   *
   * `mine=true` switches to the caller's own submissions across all statuses.
   * Everything else is gated by the public predicate, so no `status` parameter
   * exists on this route by design: there is no way to ask for PENDING events
   * from the public API.
   */
  async listEvents(query: EventListQueryInput, viewer: EventViewer | null) {
    const pagination = getPaginationParams({ page: query.page, limit: query.limit });
    const types = parseEventTypeFilter(query.types);
    const mine = query.mine === 'true' || query.mine === '1';

    // `mine=true` is an owner-only view. Without a viewer this used to reach
    // `viewer!.id`, which throws a TypeError (500) instead of telling the
    // caller they must sign in first (401).
    if (mine && !viewer) {
      throw new ApiError(401, 'Sign in to see your own events.');
    }

    const where: Prisma.EventWhereInput = {
      ...(mine ? { createdById: viewer!.id, deletedAt: null } : publicEventWhere()),
      ...(types.length ? { eventType: { in: types } } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.state ? { state: { equals: query.state, mode: 'insensitive' } } : {}),
      ...(query.featuredOnly === 'true' || query.featuredOnly === '1' ? { isFeatured: true } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { city: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      // `from`/`to` filter on the OVERLAP of [startDate, endDate] with the
      // requested window, not on startDate alone, so a 3-day fair that begins
      // before `from` still appears.
      ...(query.from || query.to
        ? {
            AND: [
              ...(query.from ? [{ endDate: { gte: query.from } }] : []),
              ...(query.to ? [{ startDate: { lte: query.to } }] : []),
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: [{ isFeatured: 'desc' }, { startDate: 'asc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.event.count({ where }),
    ]);

    return paginatedResponse(
      rows.map((r) => mapEventRow(r, viewer)),
      total,
      pagination,
    );
  },

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * `POST /events` — any authenticated user, free, no vendor/admin requirement.
   *
   * Note what is NOT here: there is no `status` in the input type, so a client
   * cannot submit itself straight to APPROVED. Coordinates are mandatory and
   * validated; a linked Place is optional and independent of them.
   */
  async createEvent(input: CreateEventInput, userId: string) {
    const coord = assertValidCoordinatePair(input.latitude, input.longitude, { label: 'Event location' });

    if (input.linkedPlaceId) await this.assertPlaceLinkable(input.linkedPlaceId);
    if (input.linkedVendorId) await this.assertVendorLinkable(input.linkedVendorId);

    const startDate = parseEventDate(input.startDate);
    if (!startDate) throw new ApiError(400, 'Enter a valid start date.');
    const parsedEnd = input.endDate ? parseEventDate(input.endDate) : null;
    if (input.endDate && !parsedEnd) throw new ApiError(400, 'Enter a valid end date.');
    // endDate is ALWAYS stored, never NULL: a one-day event gets endDate ===
    // startDate, which makes "is this finished?" a single comparison against
    // today on every read path with no heuristic and no cron job. Leaving it
    // NULL would force a rule like "assume events last N days", which the brief
    // explicitly forbids.
    const endDate = parsedEnd ?? startDate;
    if (endDate.getTime() < startDate.getTime()) {
      throw new ApiError(400, 'End date cannot be before the start date.');
    }

    // Run the duplicate scan BEFORE the insert so the create response can tell
    // the submitter about a likely existing event, and so an admin can find the
    // pair later. It never blocks submission; only approval is gated.
    const duplicateOf = await this.findDuplicateCandidates({
      title: input.title,
      latitude: coord.latitude,
      longitude: coord.longitude,
      startDate,
      excludeId: undefined,
    });

    // Derive the id and slug BEFORE writing. The previous implementation
    // inserted `slug: ''` and patched it in a second statement, which is two
    // races at once: two concurrent submissions both try to persist the empty
    // slug and the loser dies on the unique index, and a crash between the two
    // statements leaves a permanently slugless row that breaks /events/:slug.
    const id = randomUUID();
    const slug = buildEventSlug(input.title, id);

    const created = await prisma.event.create({
      data: {
        id,
        slug,
        title: input.title,
        description: input.description ?? null,
        eventType: input.eventType,
        // Fixed by policy, not by input.
        status: EventStatus.PENDING,
        startDate,
        endDate,
        startTime: normalizeEventTime(input.startTime) ?? null,
        endTime: normalizeEventTime(input.endTime) ?? null,
        latitude: coord.latitude,
        longitude: coord.longitude,
        address: input.address ?? null,
        city: input.city ?? '',
        state: input.state ?? '',
        country: 'India',
        coverImage: input.coverImage ?? null,
        images: input.images ?? [],
        shortDescription: input.shortDescription ?? null,
        organizerName: input.organizerName ?? null,
        organizerContact: input.organizerContact ?? null,
        websiteUrl: input.websiteUrl ?? null,
        entryFee: input.entryFee ?? null,
        createdById: userId,
        linkedPlaceId: input.linkedPlaceId ?? null,
        linkedVendorId: input.linkedVendorId ?? null,
      },
      include: EVENT_INCLUDE,
    });

    await auditEvent('EVENT_CREATED', created.id, userId, {
      title: created.title,
      eventType: created.eventType,
      status: created.status,
      duplicateCandidateCount: duplicateOf.length,
    });

    return {
      ...mapEventRow(created, { id: userId, isAdmin: false }, { includeModerationFields: true }),
      // Surfaced to the creator so the UI can explain why the map looks empty.
      pendingNotice: 'Your event has been submitted and is awaiting review.',
      duplicateCandidates: duplicateOf.map((d) => ({ id: d.id, title: d.title, startDate: d.startDate })),
    };
  },

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * `PATCH /events/:id` — owner or admin only.
   *
   * Material-change moderation reset: once APPROVED, any change to the fields
   * that define *where* and *when* the event is sends it back to PENDING. The
   * audit called out that the legacy vendor flow let a rejected or approved
   * listing be edited freely, which defeats moderation.
   */
  async updateEvent(id: string, input: UpdateEventInput, viewer: EventViewer) {
    const existing = await prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'Event not found.');
    this.assertCanManage(existing, viewer, 'edit');

    // A half-supplied pair would corrupt the position.
    assertCoordinatePairComplete(input.latitude, input.longitude, 'Event location');
    const moving = input.latitude !== undefined && input.longitude !== undefined;
    const coord = moving
      ? assertValidCoordinatePair(input.latitude, input.longitude, { label: 'Event location' })
      : null;

    if (input.linkedPlaceId !== undefined && input.linkedPlaceId) {
      await this.assertPlaceLinkable(input.linkedPlaceId);
    }
    if (input.linkedVendorId !== undefined && input.linkedVendorId) {
      await this.assertVendorLinkable(input.linkedVendorId);
    }

    // Merge the patch against the stored row, then re-check the date invariant once
    // on the FINAL pair. A partial patch cannot see its counterpart, so checking
    // "start changed" alone would miss "end unchanged and now in the past".
    const nextStart = input.startDate !== undefined ? parseEventDate(input.startDate) : existing.startDate;
    if (!nextStart) throw new ApiError(400, 'Enter a valid start date.');
    const nextEnd =
      input.endDate === undefined
        ? existing.endDate
        : input.endDate === null
          ? nextStart // clearing endDate means a one-day event, not "no end"
          : parseEventDate(input.endDate);
    if (!nextEnd) throw new ApiError(400, 'Enter a valid end date.');
    if (nextEnd.getTime() < nextStart.getTime()) {
      throw new ApiError(400, 'End date cannot be before the start date.');
    }

    const changes: Prisma.EventUpdateInput = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.description !== undefined) changes.description = input.description ?? null;
    if (input.eventType !== undefined) changes.eventType = input.eventType;
    if (input.startDate !== undefined) changes.startDate = nextStart;
    if (input.endDate !== undefined) changes.endDate = nextEnd;
    if (input.startTime !== undefined) changes.startTime = normalizeEventTime(input.startTime) ?? null;
    if (input.endTime !== undefined) changes.endTime = normalizeEventTime(input.endTime) ?? null;
    if (input.address !== undefined) changes.address = input.address ?? null;
    if (input.city !== undefined) changes.city = input.city ?? '';
    if (input.state !== undefined) changes.state = input.state ?? '';
    if (input.coverImage !== undefined) changes.coverImage = input.coverImage ?? null;
    if (input.images !== undefined) {
      // Clear then set: `images` is a scalar list, which Prisma cannot push to.
      changes.images = { set: input.images ?? [] };
    }
    if (input.shortDescription !== undefined) changes.shortDescription = input.shortDescription ?? null;
    if (input.organizerName !== undefined) changes.organizerName = input.organizerName ?? null;
    if (input.organizerContact !== undefined) changes.organizerContact = input.organizerContact ?? null;
    if (input.websiteUrl !== undefined) changes.websiteUrl = input.websiteUrl ?? null;
    if (input.entryFee !== undefined) changes.entryFee = input.entryFee ?? null;
    if (coord) {
      changes.latitude = coord.latitude;
      changes.longitude = coord.longitude;
    }
    if (input.linkedPlaceId !== undefined) {
      changes.place = input.linkedPlaceId ? { connect: { id: input.linkedPlaceId } } : { disconnect: true };
    }
    if (input.linkedVendorId !== undefined) {
      changes.vendor = input.linkedVendorId ? { connect: { id: input.linkedVendorId } } : { disconnect: true };
    }

    const material = this.isMaterialChange(existing, input, Boolean(coord));
    const wasApproved = existing.status === EventStatus.APPROVED;

    if (material && wasApproved && !viewer.isAdmin) {
      changes.status = EventStatus.PENDING;
      changes.approvedAt = null;
      changes.approvedBy = { disconnect: true };
      changes.publishedAt = null;
    }
    // Slug is cosmetic (ids are the real key); keep it in sync for clean URLs.
    changes.slug = buildEventSlug(input.title ?? existing.title, existing.id);

    const updated = await prisma.event.update({
      where: { id },
      data: changes,
      include: EVENT_INCLUDE,
    });

    await auditEvent('EVENT_UPDATED', id, viewer.id, {
      changedFields: Object.keys(changes).filter((k) => k !== 'slug'),
      materialChange: material,
      resetToPending: material && wasApproved && !viewer.isAdmin,
    });

    return {
      ...mapEventRow(updated, viewer, { includeModerationFields: true }),
      reviewReset: Boolean(changes.status === EventStatus.PENDING),
    };
  },

  /**
   * Which edits force re-review.
   *
   * The rule is deliberately conservative: any change that could make an
   * APPROVED public claim false, or that moves the pin or reschedules the
   * event, sends the row back to PENDING. That covers where, when, what it is,
   * how it looks and what the copy says.
   *
   * The one intentional escape hatch is a small description typo. Rewriting a
   * long description is a material edit; nudging a character or two is not.
   * Trimming this to a pure "field was supplied" check would mean every typo fix
   * silently unpublishes a live event, which trains submitters to never touch
   * their own listings.
   */
  isMaterialChange(
    existing: MaterialEventSnapshot,
    input: UpdateEventInput,
    moved: boolean,
  ): boolean {
    if (moved) return true;
    if (input.title !== undefined && input.title !== existing.title) return true;
    if (input.eventType !== undefined && input.eventType !== existing.eventType) return true;

    const nextStart = input.startDate !== undefined ? parseEventDate(input.startDate) : existing.startDate;
    if (nextStart && nextStart.getTime() !== existing.startDate.getTime()) return true;
    const nextEnd =
      input.endDate === undefined
        ? existing.endDate
        : input.endDate === null
          ? nextStart ?? existing.startDate
          : parseEventDate(input.endDate);
    if (nextEnd && nextEnd.getTime() !== existing.endDate.getTime()) return true;

    if (input.startTime !== undefined) {
      if (normalizeEventTime(input.startTime) ?? null !== existing.startTime) return true;
    }
    if (input.endTime !== undefined) {
      if (normalizeEventTime(input.endTime) ?? null !== existing.endTime) return true;
    }

    if (input.coverImage !== undefined && (input.coverImage ?? null) !== existing.coverImage) return true;
    if (input.images !== undefined) {
      const next = [...(input.images ?? [])];
      const prev = existing.images ?? [];
      if (next.length !== prev.length || next.some((v, i) => v !== prev[i])) return true;
    }
    if (input.address !== undefined && (input.address ?? null) !== existing.address) return true;
    if (input.city !== undefined && (input.city ?? '') !== existing.city) return true;
    if (input.state !== undefined && (input.state ?? '') !== existing.state) return true;

    if (input.description !== undefined) {
      const next = (input.description ?? '').trim();
      const prev = (existing.description ?? '').trim();
      if (next !== prev) {
        // A short, near-identical rewrite is a typo fix; anything longer or
        // more different is new copy and re-enters moderation.
        const withinLength =
          next.length <= DESCRIPTION_TYPO_TOLERANCE && prev.length <= DESCRIPTION_TYPO_TOLERANCE;
        if (!withinLength) return true;
        if (diceSimilarity(normalizeForMatch(next), normalizeForMatch(prev)) < DESCRIPTION_TYPO_SIMILARITY) {
          return true;
        }
      }
    }

    // A price on an APPROVED listing is a public claim: silently changing
    // ₹0 to ₹200 (or back) after approval is exactly the bait-and-switch the
    // moderation reset exists to prevent. Unlike `description` there is no
    // typo tolerance — a fee is a number, so every change to it is deliberate.
    if (input.entryFee !== undefined && (input.entryFee ?? null) !== existing.entryFee) return true;

    // The teaser is copy, so it gets the same near-identical-rewrite exemption
    // as `description`: fixing a spelling mistake must not unpublish a live
    // event. `organizerName` / `organizerContact` / `websiteUrl` are
    // deliberately NOT material — they are frequently-corrected contact
    // details that say nothing about what the event is, when it runs or where
    // it is, and resetting on every digit typo would train submitters to stop
    // editing their listings entirely.
    if (input.shortDescription !== undefined) {
      const next = (input.shortDescription ?? '').trim();
      const prev = (existing.shortDescription ?? '').trim();
      if (next !== prev) {
        const withinLength =
          next.length <= DESCRIPTION_TYPO_TOLERANCE && prev.length <= DESCRIPTION_TYPO_TOLERANCE;
        if (!withinLength) return true;
        if (diceSimilarity(normalizeForMatch(next), normalizeForMatch(prev)) < DESCRIPTION_TYPO_SIMILARITY) {
          return true;
        }
      }
    }
    return false;
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * `DELETE /events/:id` — owner or admin.
   *
   * Deleting is restricted to non-published events by default: an APPROVED
   * event that already has Reels attached is a real record of something that
   * happened, and only an admin may remove it. The owner can always delete
   * their own PENDING/REJECTED submission.
   */
  async deleteEvent(id: string, viewer: EventViewer) {
    const existing = await prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { reels: true } } },
    });
    if (!existing) throw new ApiError(404, 'Event not found.');
    this.assertCanManage(existing, viewer, 'delete');

    if (viewer.isAdmin && !isAdminEventDeletable(existing)) {
      throw new ApiError(409, 'Only rejected, cancelled, expired, or ended events can be removed.');
    }
    const isLivePublicly =
      existing.status === EventStatus.APPROVED && existing.endDate.getTime() >= startOfTodayUtc().getTime();
    if (isLivePublicly && !viewer.isAdmin) {
      throw new ApiError(
        403,
        'This event is published and has been seen by others. Contact support to remove it.',
      );
    }

    const deletedAt = new Date();
    const updated = await prisma.event.updateMany({
      where: { id, deletedAt: null, updatedAt: existing.updatedAt },
      data: { deletedAt, deletedById: viewer.id, isFeatured: false },
    });
    if (updated.count !== 1) throw new ApiError(409, 'The event changed before it could be removed. Refresh and try again.');

    await auditEvent('EVENT_DELETED', id, viewer.id, {
      title: existing.title,
      status: existing.status,
      reelCount: existing._count.reels,
    });

    return { success: true };
  },

  async adminDeleteEvent(id: string, adminId: string) {
    const existing = await prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { reels: true } } },
    });
    if (!existing) throw new ApiError(404, 'Event not found.');
    if (!isAdminEventDeletable(existing)) {
      throw new ApiError(409, 'Only rejected, cancelled, expired, or ended events can be removed.');
    }

    const deletedAt = new Date();
    const updated = await prisma.event.updateMany({
      where: { id, deletedAt: null, updatedAt: existing.updatedAt },
      data: { deletedAt, deletedById: adminId, isFeatured: false },
    });
    if (updated.count !== 1) throw new ApiError(409, 'The event changed before it could be removed. Refresh and try again.');

    await auditEvent('EVENT_DELETED', id, adminId, {
      title: existing.title,
      status: existing.status,
      reelCount: existing._count.reels,
    });

    return { success: true };
  },

  // ── Moderation (admin) ─────────────────────────────────────────────────────

  async adminListEvents(query: AdminListEventsQueryInput) {
    const pagination = getPaginationParams({ page: query.page, limit: query.limit });
    const types = parseEventTypeFilter(query.types);
    const now = new Date();

    const filters: Prisma.EventWhereInput[] = [];
    if (query.lifecycle) filters.push(buildEventLifecycleWhere(query.lifecycle, now));
    if (query.status && !query.lifecycle) filters.push({ status: query.status });
    if (types.length) filters.push({ eventType: { in: types } });
    if (query.city) filters.push({ city: { contains: query.city, mode: 'insensitive' } });
    if (query.state) filters.push({ state: { contains: query.state, mode: 'insensitive' } });
    if (query.createdById) filters.push({ createdById: query.createdById });
    if (query.linkedVendorId) filters.push({ linkedVendorId: query.linkedVendorId });
    if (query.linkedPlaceId) filters.push({ linkedPlaceId: query.linkedPlaceId });
    if (query.q) {
      filters.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.from || query.to) {
      filters.push({
        AND: [
          ...(query.from ? [{ endDate: { gte: query.from } }] : []),
          ...(query.to ? [{ startDate: { lte: query.to } }] : []),
        ],
      });
    }
    if (query.hasReports === 'true' || query.hasReports === '1') {
      filters.push({ reports: { some: { status: 'PENDING' } } });
    }
    const where: Prisma.EventWhereInput = { deletedAt: null, ...(filters.length ? { AND: filters } : {}) };

    const lifecycleWheres = buildEventLifecycleCountsWhere(now);
    const [rows, total, counts, live, upcoming, ended] = await Promise.all([
      prisma.event.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.event.count({ where }),
      this.statusCounts(),
      prisma.event.count({ where: lifecycleWheres.LIVE }),
      prisma.event.count({ where: lifecycleWheres.UPCOMING }),
      prisma.event.count({ where: lifecycleWheres.ENDED }),
    ]);

    return {
      ...paginatedResponse(
        rows.map((r) => mapEventRow(r, null, { includeModerationFields: true })),
        total,
        pagination,
      ),
      statusCounts: counts,
      lifecycleCounts: { LIVE: live, UPCOMING: upcoming, ENDED: ended } satisfies Record<EventLifecycle, number>,
    };
  },

  async statusCounts() {
    const grouped = await prisma.event.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } });
    const out: Record<string, number> = Object.fromEntries(Object.values(EventStatus).map((s) => [s, 0]));
    for (const g of grouped) out[g.status] = g._count._all;
    return out;
  },

  /**
   * `PATCH /events/:id/approve` — admin only.
   *
   * Refuses to approve a row that duplicates an existing event unless
   * `force=true`, and refuses outright when the event has no usable position:
   * an APPROVED event cannot be plotted, so approving it would create another
   * invisible-but-public record.
   */
  async approveEvent(id: string, adminId: string, options: { force?: boolean; isFeatured?: boolean } = {}) {
    const existing = await prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'Event not found.');
    if (existing.status !== EventStatus.PENDING) {
      throw new ApiError(409, `Event is already ${existing.status.toLowerCase()}.`);
    }
    this.assertTransition(existing.status, EventStatus.APPROVED);

    const coord = validateCoordinatePair(existing.latitude, existing.longitude);
    if (!coord) {
      throw new ApiError(
        422,
        'This event has no valid coordinates, so it cannot be published. Ask the submitter to set the location.',
      );
    }

    const duplicates = await this.findDuplicateCandidates({
      title: existing.title,
      latitude: coord.latitude,
      longitude: coord.longitude,
      startDate: existing.startDate,
      excludeId: id,
    });
    if (duplicates.length > 0 && !options.force) {
      // `details` is the 5th ApiError arg; passing an object as the 3rd
      // (`isOperational`) would compile but silently disable the details field.
      throw new ApiError(
        409,
        'A similar event already exists nearby. Review the duplicates or approve with force.',
        true,
        undefined,
        {
          duplicates: duplicates.map((d) => ({
            id: d.id,
            title: d.title,
            status: d.status,
            startDate: d.startDate,
            distanceMeters: Math.round(d._distance),
          })),
        },
      );
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: { connect: { id: adminId } },
        publishedAt: existing.publishedAt ?? new Date(),
        rejectedAt: null,
        rejectionReason: null,
        ...(options.isFeatured !== undefined ? { isFeatured: options.isFeatured } : {}),
      },
      include: EVENT_INCLUDE,
    });

    await auditEvent('EVENT_APPROVED', id, adminId, {
      forced: duplicates.length > 0,
      duplicateCount: duplicates.length,
    });

    return mapEventRow(updated, null, { includeModerationFields: true });
  },

  async rejectEvent(id: string, adminId: string, input: RejectEventInput) {
    return this.transition(id, EventStatus.REJECTED, adminId, {
      rejectedAt: new Date(),
      approvedAt: null,
      approvedBy: { disconnect: true },
      publishedAt: null,
      rejectionReason: input.reason,
      isFeatured: false,
    }, 'EVENT_REJECTED');
  },

  /** Take a live event off the map without deleting it. */
  async unpublishEvent(id: string, adminId: string, input: UnpublishEventInput) {
    return this.transition(
      id,
      EventStatus.PENDING,
      adminId,
      { publishedAt: null, approvedAt: null, approvedBy: { disconnect: true }, rejectionReason: input.reason, isFeatured: false },
      'EVENT_UNPUBLISHED',
    );
  },

  async cancelEvent(id: string, actorId: string, input: CancelEventInput, isAdmin: boolean) {
    return this.transition(
      id,
      EventStatus.CANCELLED,
      actorId,
      { cancelledAt: new Date(), cancellationReason: input.reason, isFeatured: false },
      'EVENT_CANCELLED',
      !isAdmin,
    );
  },

  async setFeatured(id: string, adminId: string, isFeatured: boolean) {
    const existing = await prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'Event not found.');
    if (isFeatured && existing.status !== EventStatus.APPROVED) {
      throw new ApiError(422, 'Only a published event can be featured.');
    }
    const updated = await prisma.event.update({
      where: { id },
      data: { isFeatured },
      include: EVENT_INCLUDE,
    });
    await auditEvent(isFeatured ? 'EVENT_FEATURED' : 'EVENT_UPDATED', id, adminId, {
      isFeatured,
    });
    return mapEventRow(updated, null, { includeModerationFields: true });
  },

  async transition(
    id: string,
    to: EventStatus,
    actorId: string,
    data: Prisma.EventUpdateInput,
    auditAction: 'EVENT_REJECTED' | 'EVENT_UNPUBLISHED' | 'EVENT_CANCELLED',
    ownerAllowed = false,
  ) {
    const existing = await prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, 'Event not found.');
    this.assertTransition(existing.status, to);
    if (ownerAllowed && existing.createdById !== actorId) {
      throw new ApiError(403, 'You can only cancel your own event.');
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { ...data, status: to },
      include: EVENT_INCLUDE,
    });

    await auditEvent(auditAction, id, actorId, {
      from: existing.status,
      to,
      reason: (data as Record<string, unknown>).rejectionReason,
    });

    return mapEventRow(updated, null, { includeModerationFields: true });
  },

  assertTransition(from: EventStatus, to: EventStatus) {
    if (!MODERATION_TRANSITIONS[from]?.includes(to)) {
      throw new ApiError(409, `Cannot change an event from ${from} to ${to}.`);
    }
  },

  // ── Reporting ─────────────────────────────────────────────────────────────

  /**
   * `POST /events/:id/report` — any authenticated user.
   *
   * The composite unique `(eventId, userId, reason)` makes a repeat report a
   * conflict rather than a duplicate row, so a user cannot spam the queue with
   * one complaint. Reporting never mutates the Event itself.
   */
  async reportEvent(id: string, userId: string, input: ReportEventInput) {
    const event = await prisma.event.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, title: true, status: true },
    });
    if (!event) throw new ApiError(404, 'Event not found.');

    const existing = await prisma.eventReport.findUnique({
      where: { eventId_userId_reason: { eventId: id, userId, reason: input.reason } },
    });
    if (existing) {
      throw new ApiError(409, 'You have already reported this event for that reason.');
    }

    const report = await prisma.eventReport.create({
      data: { eventId: id, userId, reason: input.reason, details: input.details ?? null },
    });

    await auditService.log('EVENT_REPORTED', 'EventReport', report.id, userId, null, null, {
      eventId: id,
      reason: input.reason,
    });

    return { id: report.id, status: report.status, createdAt: report.createdAt };
  },

  async listReports(query: AdminEventReportsQueryInput) {
    const pagination = getPaginationParams({ page: query.page, limit: query.limit });
    const where = query.status ? { status: query.status } : {};
    const [reports, total] = await Promise.all([
      prisma.eventReport.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            city: true,
            state: true,
            startDate: true,
            endDate: true,
            coverImage: true,
          },
        },
        user: { select: { id: true, name: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      }),
      prisma.eventReport.count({ where }),
    ]);
    return paginatedResponse(reports, total, pagination);
  },

  async resolveReport(reportId: string, adminId: string, resolutionNote?: string) {
    const report = await prisma.eventReport.findUnique({ where: { id: reportId } });
    if (!report) throw new ApiError(404, 'Report not found.');
    const updated = await prisma.eventReport.update({
      where: { id: reportId },
      data: {
        status: 'RESOLVED',
        resolutionNote: resolutionNote ?? null,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
    await auditService.log('EVENT_REPORT_RESOLVED', 'EventReport', reportId, adminId, null, null, {
      eventId: report.eventId,
      reason: report.reason,
    });
    return updated;
  },

  // ── Duplicates ────────────────────────────────────────────────────────────

  /**
   * Near-identical events within ~1.1 km and ±3 days, ranked by title
   * similarity. Uses the shared `canonicalText` normalizer so "Kumbh Mela" and
   * "kumbh   mela" collapse to the same token.
   */
  async findDuplicateCandidates(args: {
    title: string;
    latitude: number;
    longitude: number;
    startDate: Date;
    endDate?: Date | null;
    excludeId?: string;
  }) {
    const windowEnd = new Date(args.startDate.getTime() + DUPLICATE_WINDOW_DAYS * 86_400_000);
    const windowStart = new Date(args.startDate.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000);
    const target = normalizeForMatch(args.title);

    const rows = await prisma.$queryRaw<
      Array<{ id: string; title: string; status: EventStatus; start_date: Date; distance_m: number }>
    >(Prisma.sql`
      SELECT e.id, e.title, e.status, e.start_date,
             ST_Distance(e.location, ST_SetSRID(ST_MakePoint(${args.longitude}, ${args.latitude}), 4326)::geography) AS distance_m
      FROM events e
      WHERE e.deleted_at IS NULL
        AND e.id <> COALESCE(${args.excludeId ?? ''}, '')
        AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        AND e.start_date BETWEEN ${windowStart} AND ${windowEnd}
        AND ST_DWithin(
              e.location,
              ST_SetSRID(ST_MakePoint(${args.longitude}, ${args.latitude}), 4326)::geography,
              ${DUPLICATE_WINDOW_DEGREES * 111_320}
            )
      LIMIT 20
    `);

    return rows
      .map((r) => ({ ...r, _distance: Number(r.distance_m ?? 0) }))
      .filter((r) => this.titleSimilarity(normalizeForMatch(r.title), target) >= DUPLICATE_TITLE_SIMILARITY)
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        startDate: r.start_date,
        _distance: r._distance,
      }))
      .sort((a, b) => a._distance - b._distance);
  },

  /**
   * `GET /admin/events/:id/duplicates` — read-only duplicate evidence.
   *
   * The moderation queue needs this BEFORE an admin presses Approve. Without it
   * the only way to discover a near-duplicate is to attempt approval and read a
   * 409, which means the admin sees "A similar event already exists" with no
   * detail about what matched. This reuses `findDuplicateCandidates` — the exact
   * same scan and threshold `approveEvent` uses — so the evidence shown is the
   * evidence that will block approval. No second matching implementation.
   *
   * Deliberately NOT audited: this is a read, and auditing every queue visit
   * would bury the decisions. The *decision* is already recorded — approve
   * writes `EVENT_APPROVED` with `forced` + `duplicateCount`.
   */
  async adminListDuplicateCandidates(id: string) {
    const event = await prisma.event.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        latitude: true,
        longitude: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!event) throw new ApiError(404, 'Event not found.');

    // Same reason approve refuses: without a position there is no geo window to
    // compare in, so reporting "no duplicates" would be misleading, not helpful.
    const coord = validateCoordinatePair(event.latitude, event.longitude);
    if (!coord) {
      return {
        candidates: [],
        unavailable: 'no-valid-coordinates' as const,
        thresholds: {
          maxDistanceMeters: Math.round(DUPLICATE_WINDOW_DEGREES * 111_320),
          dateWindowDays: DUPLICATE_WINDOW_DAYS,
          minTitleSimilarity: DUPLICATE_TITLE_SIMILARITY,
        },
      };
    }

    const matches = await this.findDuplicateCandidates({
      title: event.title,
      latitude: coord.latitude,
      longitude: coord.longitude,
      startDate: event.startDate,
      endDate: event.endDate,
      excludeId: id,
    });

    // `findDuplicateCandidates` returns only id/title/status/startDate, so pull
    // the fields an admin needs to judge a match, plus the similarity score the
    // scan computed but did not surface.
    const enriched = await prisma.event.findMany({
      where: { id: { in: matches.map((m) => m.id) }, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        eventType: true,
        city: true,
        state: true,
        startDate: true,
        endDate: true,
        coverImage: true,
      },
    });
    const byId = new Map(enriched.map((e) => [e.id, e]));
    const target = normalizeForMatch(event.title);

    const candidates: AdminDuplicateCandidate[] = [];
    for (const m of matches) {
      const row = byId.get(m.id);
      if (!row) continue;
      candidates.push({
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        eventType: row.eventType,
        city: row.city,
        state: row.state,
        startDate: row.startDate,
        endDate: row.endDate,
        coverImage: row.coverImage,
        distanceMeters: Math.round(m._distance),
        titleSimilarity: Number(
          this.titleSimilarity(normalizeForMatch(row.title), target).toFixed(3),
        ),
        dateOverlapDays: this.overlapDays(
          event.startDate,
          event.endDate ?? event.startDate,
          row.startDate,
          row.endDate ?? row.startDate,
        ),
      });
    }

    return {
      candidates,
      unavailable: null,
      thresholds: {
        maxDistanceMeters: Math.round(DUPLICATE_WINDOW_DEGREES * 111_320),
        dateWindowDays: DUPLICATE_WINDOW_DAYS,
        minTitleSimilarity: DUPLICATE_TITLE_SIMILARITY,
      },
    };
  },

  /** Inclusive whole-day overlap between two date ranges. 0 means no overlap. */
  overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
    const DAY = 86_400_000;
    const start = Math.max(aStart.getTime(), bStart.getTime());
    const end = Math.min(aEnd.getTime(), bEnd.getTime());
    if (end < start) return 0;
    return Math.round((end - start) / DAY) + 1;
  },

  /**
   * Dice coefficient over character bigrams. Chosen over Levenshtein because it
   * is O(n), has no dependency, and is forgiving of word order and extra words
   * ("Annual Kumbh Mela 2026" vs "Kumbh Mela") which is the common case for
   * duplicate submissions.
   */
  titleSimilarity(a: string, b: string): number {
    return diceSimilarity(a, b);
  },

  // ── Guards ────────────────────────────────────────────────────────────────

  /**
   * Single authorization gate. Every mutating path funnels through here so
   * there is exactly one place to audit for IDOR.
   *
   * An event with `createdById === null` exists only because the migration could
   * not honestly attribute a legacy PlaceEvent row to a user. Such rows are
   * admin-only by construction.
   */
  assertCanManage(
    event: { createdById: string | null; status: EventStatus; linkedPlaceId?: string | null },
    viewer: EventViewer,
    verb: 'edit' | 'delete',
  ) {
    if (viewer.isAdmin) return;

    // An approved vendor who manages the Place an event hangs off may edit or
    // delete it too, because that is the tenancy model the legacy
    // `/vendor/places/:id/events` routes promised. The grant is explicit and
    // scoped to ONE place, which the caller has already proven they manage —
    // it is not a general privilege escalation.
    if (viewer.managesPlaceId && viewer.managesPlaceId === event.linkedPlaceId) {
      if (verb === 'delete' && event.status === EventStatus.APPROVED) {
        // Deleting a live published listing stays an admin action, matching the
        // owner path: it is a record other people have already seen.
        throw new ApiError(403, 'This event is published. Contact support to remove it.');
      }
      return;
    }

    if (event.createdById == null) {
      throw new ApiError(403, `This event has no owner and can only be ${verb === 'edit' ? 'edited' : 'removed'} by an administrator.`);
    }
    if (event.createdById !== viewer.id) {
      // 403 rather than 404: the caller already proved they can read the id.
      throw new ApiError(403, `You can only ${verb} your own event.`);
    }
  },

  async assertPlaceLinkable(placeId: string) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, status: true, latitude: true, longitude: true, name: true, mergedIntoId: true },
    });
    if (!place) throw new ApiError(400, 'The selected place no longer exists.');
    if (place.mergedIntoId) {
      throw new ApiError(400, 'That place has been merged into another listing.');
    }
    return place;
  },

  async assertVendorLinkable(vendorId: string) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, status: true, businessName: true },
    });
    if (!vendor) throw new ApiError(400, 'The selected vendor no longer exists.');
    return vendor;
  },

  /**
   * Drop events whose parent Place is hidden. Used by the admin queue to explain
   * why an approved event still does not appear on the public map.
   */
  async explainPublicVisibility(eventId: string) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { place: { select: { id: true, name: true, status: true, mergedIntoId: true } } },
    });
    if (!event) throw new ApiError(404, 'Event not found.');
    const reasons: string[] = [];
    if (event.status !== EventStatus.APPROVED) reasons.push(`status is ${event.status}`);
    if (event.endDate.getTime() < startOfTodayUtc().getTime()) reasons.push('event has ended');
    if (!validateCoordinatePair(event.latitude, event.longitude)) reasons.push('no valid coordinates');
    if (event.place && event.place.status !== 'APPROVED') reasons.push('linked place is not approved');
    if (event.place?.mergedIntoId) reasons.push('linked place was merged');
    return { visible: reasons.length === 0, reasons };
  },
};