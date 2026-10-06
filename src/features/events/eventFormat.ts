/**
 * Presentation helpers for the Community Events feed.
 *
 * The server already ships `marker.icon` / `marker.label` per EventType
 * (`EVENT_TYPE_MARKER` in events.helpers.ts) so the web and mobile surfaces
 * agree on vocabulary. These helpers only translate that contract into local
 * UI: labels, Ionicons names and the date/time strings the cards render.
 *
 * Date handling follows the server lifecycle rule (events.lifecycle.ts):
 * `startTime`/`endTime` are UTC wall-clock text and `endDate` is inclusive, so
 * a same-day event with no times is "today" rather than a 24-hour span.
 */
import type { CommunityEvent, EventType } from '../../services/api/events';

/** Display label per EventType. Mirrors EVENT_TYPE_MARKER.label server-side. */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  FESTIVAL: 'Festival',
  RELIGIOUS: 'Religious',
  CULTURAL: 'Cultural',
  FAIR_MELA: 'Fair / Mela',
  CONCERT: 'Concert',
  EXHIBITION: 'Exhibition',
  SPORTS: 'Sports',
  FOOD: 'Food',
  COMMUNITY: 'Community',
  LOCAL: 'Local',
  OTHER: 'Other',
};

/** Ionicons name per EventType for cards and the map detail card. */
export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  FESTIVAL: 'sparkles-outline',
  RELIGIOUS: 'flower-outline',
  CULTURAL: 'color-palette-outline',
  FAIR_MELA: 'storefront-outline',
  CONCERT: 'musical-notes-outline',
  EXHIBITION: 'images-outline',
  SPORTS: 'football-outline',
  FOOD: 'restaurant-outline',
  COMMUNITY: 'people-outline',
  LOCAL: 'location-outline',
  OTHER: 'calendar-outline',
};

export function eventTypeLabel(eventType?: string | null): string {
  const key = (eventType || 'OTHER') as EventType;
  return EVENT_TYPE_LABELS[key] ?? EVENT_TYPE_LABELS.OTHER;
}

export function eventTypeIcon(eventType?: string | null): string {
  const key = (eventType || 'OTHER') as EventType;
  return EVENT_TYPE_ICONS[key] ?? EVENT_TYPE_ICONS.OTHER;
}

/** Parse an ISO instant into a Date, or null when the server sent nothing usable. */
function parseEventDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Formats a day in UTC.
 *
 * The day keys above are UTC, and the server stores `startDate`/`endDate` as UTC
 * midnight of the event day. Formatting in the device timezone would shift an
 * evening-start event onto the neighbouring day and make the card disagree with
 * the lifecycle badge derived from the same timestamp.
 */
function formatDay(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });
}

/** Year is only worth showing when the event is not in the current calendar year. */
function dayOptsFor(
  date: Date,
  opts: Intl.DateTimeFormatOptions,
  now: Date,
): Intl.DateTimeFormatOptions {
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return sameYear ? opts : { ...opts, year: 'numeric' };
}

/**
 * "Today" / "Tomorrow" / weekday / "12–15 Sep" / "28 Oct 2026 – 2 Nov 2026".
 *
 * Same shape as the server's `formatEventDateLabel`, reimplemented here because
 * the client needs it in the device timezone and for standalone rows.
 */
export function formatEventDateRange(
  startDate?: string | null,
  endDate?: string | null,
  now: Date = new Date(),
): string {
  const start = parseEventDate(startDate);
  if (!start) return 'Date to be announced';

  const end = parseEventDate(endDate) ?? start;
  const today = startOfUtcToday(now);
  const diffDays = Math.round((startOfUtcToday(start).getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) {
    return formatDay(start, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (diffDays < 0) return 'Ended';

  const dayMonth: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const startOpts = dayOptsFor(start, dayMonth, now);
  const endOpts = dayOptsFor(end, dayMonth, now);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    if (start.getUTCDate() === end.getUTCDate()) return formatDay(start, startOpts);
    return `${start.getUTCDate()}–${formatDay(end, endOpts)}`;
  }
  return `${formatDay(start, startOpts)} – ${formatDay(end, endOpts)}`;
}

/** "18:30 – 21:00" when both times exist, otherwise whichever one does. */
export function formatEventTimeRange(
  startTime?: string | null,
  endTime?: string | null,
): string {
  const start = (startTime || '').trim();
  const end = (endTime || '').trim();
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return '';
}

/** "12 Oct 2026 · 18:30 – 21:00", the long form used on the detail screen. */
export function formatEventFullSchedule(event: Pick<CommunityEvent, 'startDate' | 'endDate' | 'startTime' | 'endTime'>): string {
  const start = parseEventDate(event.startDate);
  if (!start) return 'Date to be announced';

  const datePart = formatDay(start, { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = formatEventTimeRange(event.startTime, event.endTime);
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

/** "City, State" with empty parts dropped. */
export function formatEventLocation(event: Pick<CommunityEvent, 'city' | 'state' | 'address'>): string {
  const cityPart = [event.city, event.state].filter(Boolean).join(', ');
  if (cityPart) return cityPart;
  return (event.address || '').trim();
}

/** Full one-line address for the detail screen; falls back to the city. */
export function formatEventAddress(event: Pick<CommunityEvent, 'address' | 'city' | 'state' | 'placeName'>): string {
  const parts = [
    (event.address || '').trim(),
    [event.city, event.state].filter(Boolean).join(', '),
  ].filter(Boolean);
  const unique = parts.filter((part, i) => parts.indexOf(part) === i);
  if (unique.length) return unique.join(' · ');
  return (event.placeName || '').trim();
}

/**
 * LIVE / UPCOMING / ENDED, using the server's own rules so the list badge can
 * never disagree with the server's lifecycle filter.
 */
export function eventLifecycle(event: Pick<CommunityEvent, 'isPast' | 'startDate' | 'startTime'>, now: Date = new Date()): 'LIVE' | 'UPCOMING' | 'ENDED' {
  if (event.isPast) return 'ENDED';
  const start = parseEventDate(event.startDate);
  if (!start) return 'UPCOMING';
  const startAt = event.startTime ? withUtcTime(start, event.startTime) : start;
  return startAt.getTime() <= now.getTime() ? 'LIVE' : 'UPCOMING';
}

/** Applies `HH:MM` wall-clock text to the UTC fields of a date. */
function withUtcTime(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return date;
  const next = new Date(date.getTime());
  next.setUTCHours(hours, minutes, 0, 0);
  return next;
}

/** True when the event has a usable position the map can plot. */
export function eventHasCoordinates(
  event: Pick<CommunityEvent, 'hasCoordinates' | 'latitude' | 'longitude'>,
): boolean {
  if (event.hasCoordinates) return true;
  return (
    typeof event.latitude === 'number' &&
    typeof event.longitude === 'number' &&
    Number.isFinite(event.latitude) &&
    Number.isFinite(event.longitude) &&
    !(event.latitude === 0 && event.longitude === 0)
  );
}

/** Cover image, falling back to the first gallery entry. */
export function eventImage(event: Pick<CommunityEvent, 'coverImage' | 'images'>): string | null {
  if (event.coverImage) return event.coverImage;
  const first = event.images?.[0];
  return first || null;
}

/**
 * The id a share/deep link should carry.
 *
 * The server resolves `/events/:idOrSlug`, and the slug is the stable,
 * human-readable form that survives an id change. Prefer it; fall back to the
 * cuid only when the payload is missing one.
 */
export function eventLinkId(event: Pick<CommunityEvent, 'slug' | 'id'>): string {
  const slug = (event.slug || '').trim();
  if (slug) return slug;
  return (event.id || '').trim();
}