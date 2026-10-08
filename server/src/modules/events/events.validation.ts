import { z } from 'zod';
import { EventReportReason, EventReportStatus, EventStatus, EventType } from '@prisma/client';

/**
 * Community Event write validation.
 *
 * Two deliberate departures from `places.validation.ts`:
 *
 * 1. `startDate` accepts `YYYY-MM-DD`, not just a full ISO instant. The audit
 *    (defect C8) found the legacy `createEventSchema` used
 *    `z.string().datetime()`, which rejects the `YYYY-MM-DD` value every native
 *    mobile date picker produces. Date-only input is normalized to UTC midnight
 *    by `parseEventDate`, so storage stays a `DateTime`.
 *
 * 2. `endDate >= startDate` is enforced here. The legacy service had no such
 *    check (defect C9) and happily stored negative-duration events.
 */

/** 24-hour "HH:MM". Normalized to a zero-padded hour by `normalizeEventTime`. */
const EVENT_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
/** "YYYY-MM-DD" — deliberately strict so "22/09/2026" and "22 Sep" are rejected. */
const EVENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const EVENT_TYPES = Object.values(EventType);

/**
 * Parse a date the mobile app can actually send.
 *
 * - `YYYY-MM-DD`            → UTC midnight (an event day, not an instant)
 * - full ISO with `Z`/offset → used as given
 * - `YYYY-MM-DDTHH:mm[:ss]` without a zone → interpreted as UTC
 *
 * Returns null for anything unparseable or for a calendar-impossible date
 * (`2026-02-30`), which `new Date()` would otherwise silently roll over into
 * March.
 */
export function parseEventDate(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (EVENT_DATE_RE.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    // Reject 2026-02-30 / month 13 / day 0, which Date rolls over silently.
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const asUtc = new Date(Date.UTC(y, m - 1, d));
    if (
      asUtc.getUTCFullYear() !== y ||
      asUtc.getUTCMonth() !== m - 1 ||
      asUtc.getUTCDate() !== d
    ) {
      return null;
    }
    return asUtc;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Zero-pad a valid "H:MM"/"HH:MM" to "HH:MM"; return null when malformed. */
export function normalizeEventTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!EVENT_TIME_RE.test(trimmed)) return null;
  const [h, m] = trimmed.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

const eventDateString = z
  .string({ required_error: 'Start date is required.', invalid_type_error: 'Start date is required.' })
  .trim()
  .min(1, 'Start date is required.')
  .refine((v) => parseEventDate(v) !== null, 'Enter a valid date (YYYY-MM-DD).');

const optionalEventDateString = z
  .string()
  .trim()
  .min(1, 'Date cannot be empty.')
  .refine((v) => parseEventDate(v) !== null, 'Enter a valid date (YYYY-MM-DD).')
  .optional()
  .nullable();

/**
 * 24-hour "HH:MM". Kept as a plain validated string (no `.transform()`) for the
 * same reason as dates: a transform makes the field's OUTPUT type required,
 * which silently turns an optional patch field into a mandatory one. The
 * service normalizes with `normalizeEventTime`.
 */
const optionalEventTimeString = z
  .string()
  .trim()
  .refine((v) => v === '' || EVENT_TIME_RE.test(v), 'Enter a valid 24-hour time, e.g. 18:30.')
  .optional()
  .nullable();

const eventTypeEnum = z.nativeEnum(EventType, {
  errorMap: () => ({ message: 'Choose a valid event type.' }),
});

/**
 * Both must be finite numbers. `z.coerce.number()` alone would accept
 * `null` → 0 and `''` → 0, which is exactly the Null-Island fabrication the
 * audit flagged; `assertValidCoordinatePair` in the service layer performs the
 * authoritative range / (0,0) / swapped-axis / India checks.
 */
const coordinateNumber = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number(v.trim())))
  .refine((v) => Number.isFinite(v), 'Coordinates must be finite numbers.');

const imageUrlList = z
  .array(z.string().trim().url('Each photo must be a valid URL.'))
  .max(6, 'You can add up to 6 photos.')
  .optional();

/**
 * Rupees, `0` means free.
 *
 * A blank string becomes `null` ("not supplied") instead of being coerced to
 * `0`: clearing the field must not silently publish the event as free. This is
 * the same null-is-not-zero reasoning as `coordinateNumber`, one field over.
 */
const entryFeeNumber = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : v.trim() === '' ? null : Number(v.trim())))
  .refine((v) => v === null || Number.isFinite(v), 'Entry fee must be a number.')
  .refine((v) => v === null || v >= 0, 'Entry fee cannot be negative.')
  .optional()
  .nullable();

/** `http(s)` only. `new URL()` happily parses `javascript:` — never allow it. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Optional, blank-tolerant, protocol-restricted. `z.string().url()` alone is
 * rejected here because it accepts `javascript:alert(1)` and because an empty
 * string (a cleared form field) would fail validation instead of clearing.
 */
const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048, 'Website must be 2048 characters or fewer.')
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || isHttpUrl(v), 'Enter a valid website starting with http:// or https://.')
  .optional()
  .nullable();

/**
 * Free text the organiser supplies. Trimmed and length-capped, but otherwise
 * deliberately un-validated: a contact is a phone number, an email or a line
 * of prose depending on who typed it, and forcing one shape would reject
 * legitimate flyers. The client renders it as plain text — never as HTML, and
 * never as a link unless it independently parses as a URL or a tel: number.
 */
const optionalContact = z
  .string()
  .trim()
  .max(200, 'Contact must be 200 characters or fewer.')
  .optional()
  .nullable();

/** The one-line teaser shown on cards, search results and the share message. */
const optionalShortDescription = z
  .string()
  .trim()
  .max(300, 'Short description must be 300 characters or fewer.')
  .optional()
  .nullable();

/**
 * Shared shape for create and update. `updateEventSchema` is the partial, so
 * the end>=start rule is re-checked in the service against the merged row
 * (a partial patch cannot see the stored counterpart).
 */
const eventCoreShape = {
  title: z
    .string({ required_error: 'Event name is required.' })
    .trim()
    .min(3, 'Event name must be at least 3 characters.')
    .max(200, 'Event name must be 200 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(5000, 'Description must be 5000 characters or fewer.')
    .optional()
    .nullable(),
  eventType: eventTypeEnum,
  startDate: eventDateString,
  endDate: optionalEventDateString,
  startTime: optionalEventTimeString,
  endTime: optionalEventTimeString,
  latitude: coordinateNumber,
  longitude: coordinateNumber,
  address: z.string().trim().max(500, 'Address must be 500 characters or fewer.').optional().nullable(),
  city: z.string().trim().min(1, 'City is required.').max(100).optional().nullable(),
  state: z.string().trim().min(1, 'State is required.').max(100).optional().nullable(),
  coverImage: z
    .string()
    .trim()
    .url('Cover photo must be a valid URL.')
    .max(2048)
    .optional()
    .nullable(),
  images: imageUrlList,
  shortDescription: optionalShortDescription,
  organizerName: z
    .string()
    .trim()
    .max(120, 'Organiser name must be 120 characters or fewer.')
    .optional()
    .nullable(),
  organizerContact: optionalContact,
  websiteUrl: optionalHttpUrl,
  entryFee: entryFeeNumber,
  linkedPlaceId: z.string().trim().min(1).max(64).optional().nullable(),
  linkedVendorId: z.string().trim().min(1).max(64).optional().nullable(),
};

export const createEventSchema = z
  .object(eventCoreShape)
  .superRefine((data, ctx) => {
    const start = parseEventDate(data.startDate);
    const end = data.endDate ? parseEventDate(data.endDate) : null;
    if (data.endDate && !end) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Enter a valid end date.' });
      return;
    }
    if (start && end && end.getTime() < start.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date cannot be before the start date.',
      });
    }
    if (data.startTime && data.endTime && data.endTime < data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time cannot be before the start time.',
      });
    }
  });

/**
 * Dates stay as validated STRINGS here and are converted by the service with
 * `parseEventDate`. Doing the conversion in a zod `.transform()` produced a
 * `string | Date | null` union across the partial update shape that TypeScript
 * could not narrow, which pushed impossible branches into the service. Parsing
 * in the service keeps one obvious conversion point and lets the same function
 * be unit-tested directly.
 */
export const updateEventSchema = z.object({
  title: eventCoreShape.title.optional(),
  description: eventCoreShape.description,
  eventType: eventTypeEnum.optional(),
  startDate: eventDateString.optional(),
  endDate: optionalEventDateString,
  startTime: optionalEventTimeString,
  endTime: optionalEventTimeString,
  latitude: coordinateNumber.optional(),
  longitude: coordinateNumber.optional(),
  address: eventCoreShape.address,
  city: eventCoreShape.city,
  state: eventCoreShape.state,
  coverImage: eventCoreShape.coverImage,
  images: eventCoreShape.images,
  shortDescription: eventCoreShape.shortDescription,
  organizerName: eventCoreShape.organizerName,
  organizerContact: eventCoreShape.organizerContact,
  websiteUrl: eventCoreShape.websiteUrl,
  entryFee: eventCoreShape.entryFee,
  linkedPlaceId: eventCoreShape.linkedPlaceId,
  linkedVendorId: eventCoreShape.linkedVendorId,
});

/** Reject an empty patch outright rather than silently no-op. */
export const updateEventSchemaWithGuard = updateEventSchema.refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  'No changes supplied.',
);

// ── Public list / map query ──────────────────────────────────────────────────

const latBound = z.string().refine(
  (v) => {
    const n = parseFloat(v);
    return !Number.isNaN(n) && Math.abs(n) <= 90;
  },
  'Invalid latitude (-90 to 90)',
);
const lngBound = z.string().refine(
  (v) => {
    const n = parseFloat(v);
    return !Number.isNaN(n) && Math.abs(n) <= 180;
  },
  'Invalid longitude (-180 to 180)',
);

/**
 * Event map / list contract. Mirrors `mapQuerySchema` for the Places map so the
 * mobile client can reuse its fetch plumbing unchanged.
 */
export const eventMapQuerySchema = z.object({
  north: latBound,
  south: latBound,
  east: lngBound,
  west: lngBound,
  zoom: z.string().optional().default('12'),
  limit: z.string().optional().default('200'),
  cursor: z.string().optional(),
  /** Comma-separated EventType keys. Capped, never free-form. */
  types: z.string().optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  /** Include events whose start date is in the past but end date is future. */
  includeOngoing: z.enum(['true', 'false', '1', '0']).optional(),
  featuredOnly: z.enum(['true', 'false', '1', '0']).optional(),
});

/** `GET /events/featured` — no viewport, just a small curated strip. */
export const featuredEventsQuerySchema = z.object({
  limit: z.string().optional().default('10'),
});

export const eventListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional().default('20'),
  types: z.string().optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  q: z.string().trim().max(120).optional(),
  from: optionalEventDateString,
  to: optionalEventDateString,
  /** Owners see their own submissions regardless of status. */
  mine: z.enum(['true', 'false', '1', '0']).optional(),
  featuredOnly: z.enum(['true', 'false', '1', '0']).optional(),
});

export const nearbyEventsQuerySchema = z.object({
  lat: coordinateNumber,
  lng: coordinateNumber,
  radiusKm: z
    .string()
    .optional()
    .default('25')
    .refine((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n <= 500;
    }, 'radiusKm must be between 1 and 500'),
  limit: z.string().optional().default('50'),
});

// ── Moderation (admin) ───────────────────────────────────────────────────────

export const approveEventSchema = z.object({
  /** Bypass the duplicate-candidate guard. Mirrors hidden-gems `force`. */
  force: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional(),
});

export const rejectEventSchema = z.object({
  reason: z.string().trim().min(3, 'A rejection reason is required.').max(500),
});

export const unpublishEventSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required.').max(500),
});

export const cancelEventSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required.').max(500),
});

export const featureEventSchema = z.object({
  isFeatured: z.boolean(),
});

export const eventIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid event ID.'),
});

export const adminListEventsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional().default('20'),
  status: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .refine((v) => v === undefined || Object.values(EventStatus).includes(v as EventStatus), {
      message: 'Invalid event status.',
    })
    .transform((v) => v as EventStatus | undefined),
  lifecycle: z.enum(['LIVE', 'UPCOMING', 'ENDED']).optional(),
  types: z.string().optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  q: z.string().trim().max(120).optional(),
  createdById: z.string().trim().max(64).optional(),
  linkedVendorId: z.string().trim().max(64).optional(),
  linkedPlaceId: z.string().trim().max(64).optional(),
  from: optionalEventDateString,
  to: optionalEventDateString,
  hasReports: z.enum(['true', 'false', '1', '0']).optional(),
});

export const adminEventReportsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional().default('20'),
  status: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .refine((v) => v === undefined || Object.values(EventReportStatus).includes(v as EventReportStatus), {
      message: 'Invalid event report status.',
    })
    .transform((v) => v as EventReportStatus | undefined),
});

export const resolveEventReportSchema = z.object({
  resolutionNote: z.string().trim().max(500).optional(),
});

export const reportEventSchema = z.object({
  reason: z.nativeEnum(EventReportReason, {
    errorMap: () => ({ message: 'Choose a valid reason.' }),
  }),
  details: z.string().trim().max(1000).optional().nullable(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventMapQueryInput = z.infer<typeof eventMapQuerySchema>;
export type EventListQueryInput = z.infer<typeof eventListQuerySchema>;
export type NearbyEventsQueryInput = z.infer<typeof nearbyEventsQuerySchema>;
export type ApproveEventInput = z.infer<typeof approveEventSchema>;
export type RejectEventInput = z.infer<typeof rejectEventSchema>;
export type UnpublishEventInput = z.infer<typeof unpublishEventSchema>;
export type CancelEventInput = z.infer<typeof cancelEventSchema>;
export type FeatureEventInput = z.infer<typeof featureEventSchema>;
export type AdminListEventsQueryInput = z.infer<typeof adminListEventsQuerySchema>;
export type AdminEventReportsQueryInput = z.infer<typeof adminEventReportsQuerySchema>;
export type ResolveEventReportInput = z.infer<typeof resolveEventReportSchema>;
export type ReportEventInput = z.infer<typeof reportEventSchema>;