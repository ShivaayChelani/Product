import { Role, RoleAssignmentStatus } from '@prisma/client';
import { ApiError } from '../../shared/utils/ApiError';
import { prisma } from '../../config/database';
import { isEventPastEnd } from '../events/events-public-visibility';
import { canPublicViewPlace } from '../places/services/places-public-visibility';

/**
 * Validation and authorization for `Reel.eventId`.
 *
 * Reels already carry an `eventId` column (indexed, `onDelete: SetNull`), but
 * nothing checked it. That left two holes:
 *
 *   1. **Validity** - `eventId` was written straight through, so a typo, a
 *      deleted event, or a client-invented cuid produced a dangling reference.
 *      A real event in any state was accepted silently.
 *   2. **Authorization** - any creator could attach a reel to any event,
 *      including someone else's PENDING submission. `/events/:id/reels` then
 *      surfaces approved reels under an event, which is a way to advertise on a
 *      listing you do not control.
 *
 * Unlike `placeId` (which silently degrades to `null`) and `vendorId` (which is
 * approved-only), an unusable `eventId` is rejected outright: silently dropping
 * the link would leave the creator believing their reel is attached to an event
 * when it is not.
 */

/** Stable messages so the client can branch on them if it ever needs to. */
export const EVENT_LINK_ERRORS = {
  notFound: 'Event not found.',
  notVisible: 'That event is not available to link a reel to.',
  notOwner: 'You can only link a reel to your own unpublished event.',
} as const;

/** The slice of `Event` the authorization rule needs. */
export type LinkableEvent = {
  status: string;
  endDate: Date;
  /** Nullable: legacy rows migrated from `place_events` have no creator. */
  createdById: string | null;
};

export type LinkContext = {
  /** The creator's *user* id (not their CreatorProfile id). */
  viewerUserId: string | null;
  isAdmin?: boolean;
};

/**
 * Whether a user id holds a capable ADMIN role assignment.
 *
 * Checks `ACTIVE` and `APPROVED` together, matching `CAPABLE_STATUSES` in
 * `specialtyRoles`. Checking ACTIVE alone would miss an admin whose assignment
 * sits in APPROVED — which is how role approvals are actually stored — and
 * quietly deny the moderation path.
 *
 * Lives here rather than on a service so both the reel and creator-draft paths
 * share one definition. Fails closed: a lookup error means "not an admin".
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const rows = await prisma.userRole.findMany({
      where: {
        userId,
        role: Role.ADMIN,
        status: { in: [RoleAssignmentStatus.ACTIVE, RoleAssignmentStatus.APPROVED] },
      },
      select: { id: true },
      take: 1,
    });
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Whether a reel's author may attach it to this event.
 *
 * Three ways to pass:
 *   - **publicly visible** — approved, not finished, parent Place visible. Anyone
 *     filming an advertised event may tag it.
 *   - **own event** — a creator must be able to tag the event they just
 *     submitted while it is still PENDING, otherwise the two features cannot be
 *     used together at all.
 *   - **admin** — moderation tooling.
 *
 * CANCELLED is excluded even for the owner: cancellation is a deliberate public
 * statement that the event is not happening, so its reels should stop driving
 * traffic to it. REJECTED is treated the same way.
 */
export function canLinkReelToEvent(event: LinkableEvent, ctx: LinkContext) {
  const isAdmin = ctx.isAdmin === true;
  const isOwner = event.createdById === ctx.viewerUserId;

  // Terminal decisions: admins may still attach (for moderation records), nobody else.
  if (event.status === 'REJECTED' || event.status === 'CANCELLED') {
    return isAdmin ? { allowed: true as const } : { allowed: false as const, reason: 'notVisible' as const };
  }

  // A finished event cannot be tagged by anyone but an admin.
  if (isEventPastEnd(event)) {
    return isAdmin ? { allowed: true as const } : { allowed: false as const, reason: 'notVisible' as const };
  }

  if (isOwner) return { allowed: true as const };
  if (event.status === 'APPROVED') return { allowed: true as const };
  if (isAdmin) return { allowed: true as const };

  // PENDING/EXPIRED belonging to someone else.
  return { allowed: false as const, reason: 'notOwner' as const };
}

/**
 * Whether an event is publicly linkable, i.e. visible in the events feature.
 *
 * Delegates to the Places visibility policy for the parent rather than
 * re-deriving "approved and not merged", exactly as
 * `events-public-visibility.placeVisibilityWhere` does — a second, looser copy
 * of that rule is how a hidden Place ends up one hop from being public.
 */
export function isPubliclyLinkableEvent(
  event: LinkableEvent,
  place: Parameters<typeof canPublicViewPlace>[0] | null,
  isAdmin = false,
): boolean {
  if (event.status !== 'APPROVED') return false;
  if (isEventPastEnd(event)) return false;
  // A standalone event (legacy rows migrated from `place_events`, or an event
  // created without a Place) has no parent to inherit visibility from.
  if (!place) return true;
  return canPublicViewPlace(place as Parameters<typeof canPublicViewPlace>[0], isAdmin);
}

/** The public shape of an event attached to a reel. */
export type ReelEventSummary = {
  id: string;
  slug: string;
  title: string;
  eventType: string;
  startDate: Date;
  endDate: Date;
  coverImage: string | null;
  city: string | null;
  state: string | null;
};

/** Everything `sanitizeReelEvent` needs in order to make its decision. */
export type ReelEventCandidate = ReelEventSummary & {
  status: string;
  createdById: string | null;
  place: Parameters<typeof canPublicViewPlace>[0] | null;
};

/**
 * Narrows a loaded Event down to what is safe to put on a reel payload.
 *
 * Returns `null` unless the event is publicly linkable, so a reel can never
 * advertise a PENDING, REJECTED, CANCELLED or finished event — including via
 * rows linked before `resolveReelEventLink` existed.
 *
 * Deliberately drops `createdById`, `status`, `endDate` and `place`: a reel is
 * world-readable, and none of those belong in a public payload.
 */
export function sanitizeReelEvent(event: ReelEventCandidate | null | undefined): ReelEventSummary | null {
  if (!event) return null;
  if (!isPubliclyLinkableEvent(event, event.place)) return null;
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    eventType: event.eventType,
    startDate: event.startDate,
    endDate: event.endDate,
    coverImage: event.coverImage,
    city: event.city,
    state: event.state,
  };
}

/**
 * Resolves a client-supplied `eventId` to a storable event id.
 *
 * - blank / null clears the link (an explicit unlink).
 * - a linkable id or slug returns the canonical `event.id`, so pasting a share
 *   URL works.
 * - anything else throws `ApiError(400)`.
 */
export async function resolveReelEventLink(
  rawEventId: string | null | undefined,
  ctx: LinkContext,
): Promise<string | null> {
  const key = typeof rawEventId === 'string' ? rawEventId.trim() : '';
  if (!key) return null;

  const event = await prisma.event.findFirst({
    where: { OR: [{ id: key }, { slug: key }] },
    select: {
      id: true,
      status: true,
      endDate: true,
      createdById: true,
      place: {
        select: {
          status: true,
          mergedIntoId: true,
          dataQuality: true,
          source: true,
          verificationLevel: true,
        },
      },
    },
  });

  if (!event) throw new ApiError(400, EVENT_LINK_ERRORS.notFound);

  if (isPubliclyLinkableEvent(event, event.place, ctx.isAdmin === true)) return event.id;

  const verdict = canLinkReelToEvent(event, ctx);
  if (!verdict.allowed) {
    throw new ApiError(
      400,
      verdict.reason === 'notOwner' ? EVENT_LINK_ERRORS.notOwner : EVENT_LINK_ERRORS.notVisible,
    );
  }
  return event.id;
}