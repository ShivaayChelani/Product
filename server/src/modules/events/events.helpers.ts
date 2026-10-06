import { EventStatus, EventType, Prisma } from '@prisma/client';
import { isEventPastEnd, placeVisibilityWhere } from './events-public-visibility';
import { validateCoordinatePair } from '../../shared/utils/coordinates';

/**
 * The single include used by every event read.
 *
 * Defined here (not in the service) because `mapEventRow` needs the same shape,
 * and two independent copies of a Prisma `include` drift apart the moment one
 * side adds a field.
 */
export const EVENT_INCLUDE = {
  createdBy: { select: { id: true, name: true, avatar: true } },
  approvedBy: { select: { id: true, name: true } },
  place: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      mergedIntoId: true,
      latitude: true,
      longitude: true,
      // Needed by the shared parent-visibility gate: `canPublicViewPlace` also
      // considers the verified-only policy, which reads these three.
      dataQuality: true,
      source: true,
      verificationLevel: true,
    },
  },
  vendor: { select: { id: true, businessName: true, status: true } },
  _count: { select: { reels: true, reports: true } },
} satisfies Prisma.EventInclude;

export type EventWithRelations = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;

/**
 * URL-safe slug. Titles are free-form Unicode (Hindi, Tamil, emoji) so
 * ascii-folding would produce an empty slug for many real events; fall back to
 * the event id so the column is never blank.
 */
export function buildEventSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base ? `${base}-${id.slice(-8)}` : `event-${id.slice(-8)}`;
}

/** "today" / "tomorrow" / "weekend" / "on <date>" — used by list cards. */
export function formatEventDateLabel(start: Date, end: Date, now: Date = new Date()): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const today = startOfToday(now);
  const days = Math.round((startOfToday(start).getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days <= 7) return start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

  const startLabel = start.toLocaleDateString('en-IN', opts);
  // Same month → "12–15 Sep"; otherwise spell out the end date.
  if (end.getUTCFullYear() === start.getUTCFullYear() && end.getUTCMonth() === start.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.toLocaleDateString('en-IN', opts)}`;
  }
  return `${startLabel} – ${end.toLocaleDateString('en-IN', opts)}`;
}

function startOfToday(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO week ends Saturday, which is when Indian fairs/carnivals mostly start. */
export function isWeekend(start: Date, end: Date, now: Date = new Date()): boolean {
  const candidates = end.getTime() !== start.getTime() ? [start, new Date(end.getTime() - 86_400_000)] : [start];
  const today = startOfToday(now).getTime();
  return candidates.some((d) => {
    const day = d.getUTCDay(); // 0 Sun, 6 Sat
    return day === 0 || day === 6 ? d.getTime() >= today : false;
  });
}

/**
 * Shared serialization for public, owner, and admin responses.
 *
 * `latitude`/`longitude` are emitted as `null` — never `0` — when absent, and
 * `hasCoordinates` tells the client whether to offer a "View on map" action.
 * Admin responses additionally carry moderation fields so the moderation UI
 * does not need a second endpoint.
 */
export function mapEventRow(
  event: EventWithRelations,
  viewer: { id?: string; isAdmin: boolean } | null,
  options: { includeModerationFields?: boolean } = {},
): Record<string, unknown> {
  const isOwner = viewer?.id != null && event.createdById === viewer.id;
  const canSeeModeration = options.includeModerationFields === true || viewer?.isAdmin === true || isOwner;

  const coord = validateCoordinatePair(event.latitude, event.longitude);
  const parentPlaceVisible = placeVisibilityWhere(event.place);
  const past = isEventPastEnd(event);

  const base = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    status: event.status,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    latitude: coord?.latitude ?? null,
    longitude: coord?.longitude ?? null,
    hasCoordinates: coord !== null,
    address: event.address,
    city: event.city,
    state: event.state,
    coverImage: event.coverImage,
    images: event.images,
    // Flyer facts. Public by design — a listing nobody can read the organiser,
    // fee or teaser from is a listing nobody can attend.
    shortDescription: event.shortDescription,
    organizerName: event.organizerName,
    organizerContact: event.organizerContact,
    websiteUrl: event.websiteUrl,
    entryFee: event.entryFee,
    isFeatured: event.isFeatured,
    isPast: past,
    placeId: event.linkedPlaceId,
    placeName: event.place?.name ?? null,
    vendorId: event.linkedVendorId,
    vendorName: event.vendor?.businessName ?? null,
    reelCount: event._count?.reels ?? 0,
    reportCount: event._count?.reports ?? 0,
    createdBy: event.createdBy
      ? { id: event.createdBy.id, name: event.createdBy.name, avatar: event.createdBy.avatar }
      : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    // Legacy provenance, so an admin can tell a migrated row from a new one.
    legacyPlaceEventId: event.legacyPlaceEventId,
    parentPlaceVisible,
  };

  if (!canSeeModeration) return base;

  return {
    ...base,
    createdById: event.createdById,
    approvedById: event.approvedById,
    approvedBy: event.approvedBy ? { id: event.approvedBy.id, name: event.approvedBy.name } : null,
    approvedAt: event.approvedAt,
    rejectionReason: event.rejectionReason,
    cancelledAt: event.cancelledAt,
    cancellationReason: event.cancellationReason,
    publishedAt: event.publishedAt,
    isOwner,
  };
}

/**
 * An event is only publicly listable when it is APPROVED, not finished, and its
 * parent Place (if any) is still visible. Used to post-filter rows when the
 * visibility gate cannot be expressed in SQL (a linked Place is a second table).
 */
export function isEventPubliclyVisible(
  event: {
    status: EventStatus;
    endDate: Date;
    place?: Parameters<typeof placeVisibilityWhere>[0];
  },
  now: Date = new Date(),
): boolean {
  if (event.status !== EventStatus.APPROVED) return false;
  if (isEventPastEnd(event, now)) return false;
  return placeVisibilityWhere(event.place ?? null);
}

/** Marker/icon grouping on the client, kept here so web and mobile agree. */
export const EVENT_TYPE_MARKER: Record<EventType, { icon: string; label: string }> = {
  FESTIVAL: { icon: 'event-festival', label: 'Festival' },
  RELIGIOUS: { icon: 'event-religious', label: 'Religious' },
  CULTURAL: { icon: 'event-cultural', label: 'Cultural' },
  FAIR_MELA: { icon: 'event-mela', label: 'Fair / Mela' },
  CONCERT: { icon: 'event-concert', label: 'Concert' },
  EXHIBITION: { icon: 'event-exhibition', label: 'Exhibition' },
  SPORTS: { icon: 'event-sports', label: 'Sports' },
  FOOD: { icon: 'event-food', label: 'Food' },
  COMMUNITY: { icon: 'event-community', label: 'Community' },
  LOCAL: { icon: 'event-local', label: 'Local' },
  OTHER: { icon: 'event-other', label: 'Other' },
};

/** Moderation transitions the admin queue is allowed to drive. */
export const MODERATION_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  PENDING: [EventStatus.APPROVED, EventStatus.REJECTED],
  APPROVED: [EventStatus.CANCELLED, EventStatus.PENDING],
  REJECTED: [EventStatus.PENDING],
  CANCELLED: [],
  EXPIRED: [],
};