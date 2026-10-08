/**
 * Event submission form — pure date/time, validation and payload helpers.
 *
 * Everything the Add Event form does that does not need React lives here so it
 * can be unit-tested without rendering the screen. The limits and the rules
 * mirror `server/src/modules/events/events.validation.ts` (createEventSchema)
 * exactly: the client validates only to give an early, local message, the
 * server stays authoritative.
 *
 * Wire format reminders (from the server schema):
 *  - startDate / endDate : "YYYY-MM-DD"
 *  - startTime / endTime : "HH:MM" 24-hour, zero-padded
 *  - latitude/longitude  : a complete, finite, non-(0,0) pair is REQUIRED
 *  - city/state          : `''` fails `.min(1)` — send null when blank
 */
import { isValidLatLng } from '../../services/location/distance';
import { EVENT_TYPES, type CreateEventInput, type EventType } from '../../services/api/events';

/** Field caps. Kept beside the validator so a limit is never written twice. */
export const EVENT_FORM_LIMITS = {
  titleMin: 3,
  titleMax: 200,
  shortDescriptionMax: 300,
  descriptionMax: 5000,
  addressMax: 500,
  cityMax: 100,
  stateMax: 100,
  organizerNameMax: 120,
  organizerContactMax: 200,
  websiteUrlMax: 2048,
  imagesMax: 6,
  entryFeeMax: 1_000_000,
} as const;

/** Every editable field of the form, in the order the screen lays them out. */
export type EventFormField =
  | 'title'
  | 'eventType'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'address'
  | 'city'
  | 'state'
  | 'shortDescription'
  | 'description'
  | 'coverImage'
  | 'images'
  | 'organizerName'
  | 'organizerContact'
  | 'websiteUrl'
  | 'entryFee'
  | 'linkedPlaceId';

export type EventDraft = {
  title: string;
  eventType: EventType | null;
  /** "YYYY-MM-DD" or '' when untouched. */
  startDate: string;
  endDate: string;
  /** "HH:MM" 24-hour or '' when untouched. */
  startTime: string;
  endTime: string;
  /** True once the map picker (or GPS) produced a validated pair. */
  hasLocation: boolean;
  latitude: number | null;
  longitude: number | null;
  address: string;
  city: string;
  state: string;
  shortDescription: string;
  description: string;
  /** Local picker URIs; uploaded at submit time. */
  coverImageUri: string | null;
  imageUris: string[];
  organizerName: string;
  organizerContact: string;
  websiteUrl: string;
  /** Raw input text. '' = not supplied (never coerced to 0 = "free"). */
  entryFee: string;
  linkedPlaceId: string | null;
  linkedPlaceName: string | null;
};

export const EMPTY_EVENT_DRAFT: EventDraft = {
  title: '',
  eventType: null,
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  hasLocation: false,
  latitude: null,
  longitude: null,
  address: '',
  city: '',
  state: '',
  shortDescription: '',
  description: '',
  coverImageUri: null,
  imageUris: [],
  organizerName: '',
  organizerContact: '',
  websiteUrl: '',
  entryFee: '',
  linkedPlaceId: null,
  linkedPlaceName: null,
};

/** True for anything the user has typed into a draft (drives "unsaved" prompts). */
export function isDraftDirty(draft: EventDraft): boolean {
  return (
    draft.title.trim() !== '' ||
    draft.eventType !== null ||
    draft.startDate !== '' ||
    draft.endDate !== '' ||
    draft.startTime !== '' ||
    draft.endTime !== '' ||
    draft.hasLocation ||
    draft.address.trim() !== '' ||
    draft.city.trim() !== '' ||
    draft.state.trim() !== '' ||
    draft.shortDescription.trim() !== '' ||
    draft.description.trim() !== '' ||
    draft.coverImageUri !== null ||
    draft.imageUris.length > 0 ||
    draft.organizerName.trim() !== '' ||
    draft.organizerContact.trim() !== '' ||
    draft.websiteUrl.trim() !== '' ||
    draft.entryFee.trim() !== '' ||
    draft.linkedPlaceId !== null
  );
}

// ── Date helpers ────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local-timezone "YYYY-MM-DD" for a date (never `toISOString`, which is UTC). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/**
 * `2026-10-06` -> `Date` at local midnight, or null when the string is not a
 * real calendar day (`2026-02-30` must not silently roll into March).
 */
export function parseIsoDate(iso: string): Date | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Whole-day comparison of two "YYYY-MM-DD" strings. Returns false if invalid. */
export function isDateOnOrAfter(later: string, earlier: string): boolean {
  const a = parseIsoDate(later);
  const b = parseIsoDate(earlier);
  if (!a || !b) return false;
  return a.getTime() >= b.getTime();
}

/** "14 Mar 2027" — the label every date field shows. */
export function formatDisplayDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Month heading for the calendar modal, e.g. "October 2026". */
export function formatMonthHeading(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/** Days in a month, 0-indexed month. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Mon-Sun grid offsets used by the calendar modal (Indian week starts Sunday). */
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Leading blanks so day 1 lands under its weekday. */
export function leadingBlanks(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1).getDay();
}

// ── Time helpers ────────────────────────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHhmm(value: string): boolean {
  return HHMM_RE.test(value);
}

/** "09:30" -> { hour12: 9, minute: 30, period: 'AM' } (12-hour for the wheel). */
export function hhmmToParts(hhmm: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  const match = HHMM_RE.exec(hhmm);
  const hour24 = match ? Number(match[1]) : 9;
  const minute = match ? Number(match[2]) : 0;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

/** 12-hour wheel parts -> "HH:MM" 24-hour for the wire. */
export function partsToHhmm(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  const h24 = period === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;
  return `${`${h24}`.padStart(2, '0')}` + `:${`${minute}`.padStart(2, '0')}`;
}

/** "09:30" -> "09:30 AM"; anything unparseable is shown verbatim. */
export function formatTime12(hhmm: string): string {
  if (!isValidHhmm(hhmm)) return hhmm;
  const { hour12, minute, period } = hhmmToParts(hhmm);
  return `${hour12}:${`${minute}`.padStart(2, '0')} ${period}`;
}

/** True only when the end sits after the start (server rejects equal-or-before). */
export function isTimeAfter(start: string, end: string): boolean {
  if (!isValidHhmm(start) || !isValidHhmm(end)) return false;
  return end > start;
}

export const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
export const MINUTES_5 = Array.from({ length: 12 }, (_, i) => i * 5);

// ── Validation ──────────────────────────────────────────────────────────────

/** Ordered so `firstEventFormError` returns the field nearest the top of the form. */
const FIELD_ORDER: EventFormField[] = [
  'title',
  'eventType',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'location',
  'address',
  'city',
  'state',
  'shortDescription',
  'description',
  'coverImage',
  'images',
  'organizerName',
  'organizerContact',
  'websiteUrl',
  'entryFee',
  'linkedPlaceId',
];

export type EventFormError = { field: EventFormField; message: string };

function blank(value: string): boolean {
  return value.trim() === '';
}

/** `http(s)` only — mirrors `isHttpUrl` on the server. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Every rule the server applies, run in screen order.
 *
 * Returns `[]` for a submittable draft; otherwise the first error per field so
 * the form can highlight all of them at once and scroll to the first one.
 */
export function validateEventDraft(draft: EventDraft): EventFormError[] {
  const errors: EventFormError[] = [];
  const push = (field: EventFormField, message: string) => errors.push({ field, message });

  const title = draft.title.trim();
  if (title.length < EVENT_FORM_LIMITS.titleMin) {
    push('title', 'Event name must be at least 3 characters.');
  } else if (title.length > EVENT_FORM_LIMITS.titleMax) {
    push('title', `Event name must be ${EVENT_FORM_LIMITS.titleMax} characters or fewer.`);
  }

  if (!draft.eventType || !(EVENT_TYPES as readonly string[]).includes(draft.eventType)) {
    push('eventType', 'Choose an event type.');
  }

  if (!ISO_DATE_RE.test(draft.startDate) || !parseIsoDate(draft.startDate)) {
    push('startDate', 'Choose a start date.');
  }

  const end = draft.endDate;
  if (blank(end)) {
    push('endDate', 'Choose an end date.');
  } else if (!ISO_DATE_RE.test(end) || !parseIsoDate(end)) {
    push('endDate', 'Enter a valid end date.');
  } else if (ISO_DATE_RE.test(draft.startDate) && !isDateOnOrAfter(end, draft.startDate)) {
    push('endDate', 'End date cannot be before the start date.');
  }

  if (blank(draft.startTime)) {
    push('startTime', 'Choose a start time.');
  } else if (!isValidHhmm(draft.startTime)) {
    push('startTime', 'Enter a valid start time.');
  }

  if (blank(draft.endTime)) {
    push('endTime', 'Choose an end time.');
  } else if (!isValidHhmm(draft.endTime)) {
    push('endTime', 'Enter a valid end time.');
  } else if (isValidHhmm(draft.startTime) && !isTimeAfter(draft.startTime, draft.endTime)) {
    push('endTime', 'End time must be after the start time.');
  }

  if (!draft.hasLocation || !isValidLatLng(draft.latitude, draft.longitude)) {
    push('location', 'Pick the event location on the map.');
  }

  if (draft.address.length > EVENT_FORM_LIMITS.addressMax) {
    push('address', `Address must be ${EVENT_FORM_LIMITS.addressMax} characters or fewer.`);
  }
  if (draft.city.length > EVENT_FORM_LIMITS.cityMax) {
    push('city', `City must be ${EVENT_FORM_LIMITS.cityMax} characters or fewer.`);
  }
  if (draft.state.length > EVENT_FORM_LIMITS.stateMax) {
    push('state', `State must be ${EVENT_FORM_LIMITS.stateMax} characters or fewer.`);
  }

  if (draft.shortDescription.length > EVENT_FORM_LIMITS.shortDescriptionMax) {
    push(
      'shortDescription',
      `Short description must be ${EVENT_FORM_LIMITS.shortDescriptionMax} characters or fewer.`,
    );
  }
  if (draft.description.length > EVENT_FORM_LIMITS.descriptionMax) {
    push('description', `Description must be ${EVENT_FORM_LIMITS.descriptionMax} characters or fewer.`);
  }

  if (draft.imageUris.length > EVENT_FORM_LIMITS.imagesMax) {
    push('images', `You can add up to ${EVENT_FORM_LIMITS.imagesMax} photos.`);
  }

  if (draft.organizerName.length > EVENT_FORM_LIMITS.organizerNameMax) {
    push('organizerName', `Organiser name must be ${EVENT_FORM_LIMITS.organizerNameMax} characters or fewer.`);
  }
  if (draft.organizerContact.length > EVENT_FORM_LIMITS.organizerContactMax) {
    push('organizerContact', `Contact must be ${EVENT_FORM_LIMITS.organizerContactMax} characters or fewer.`);
  }

  const website = draft.websiteUrl.trim();
  if (website) {
    if (website.length > EVENT_FORM_LIMITS.websiteUrlMax) {
      push('websiteUrl', `Website must be ${EVENT_FORM_LIMITS.websiteUrlMax} characters or fewer.`);
    } else if (!isHttpUrl(website)) {
      push('websiteUrl', 'Enter a valid website starting with http:// or https://.');
    }
  }

  const fee = draft.entryFee.trim();
  if (fee) {
    const parsed = Number(fee);
    if (!Number.isFinite(parsed)) {
      push('entryFee', 'Entry fee must be a number.');
    } else if (parsed < 0) {
      push('entryFee', 'Entry fee cannot be negative.');
    } else if (parsed > EVENT_FORM_LIMITS.entryFeeMax) {
      push('entryFee', 'Entry fee looks too large.');
    }
  }

  return errors;
}

/** First error in screen order — what "scroll to the first invalid field" uses. */
export function firstEventFormError(draft: EventDraft): EventFormError | null {
  const errors = validateEventDraft(draft);
  if (!errors.length) return null;
  for (const field of FIELD_ORDER) {
    const hit = errors.find(e => e.field === field);
    if (hit) return hit;
  }
  return errors[0];
}

/** True when the server would accept this draft (used to enable the submit bar). */
export function isEventDraftSubmittable(draft: EventDraft): boolean {
  return validateEventDraft(draft).length === 0;
}

// ── Payload ─────────────────────────────────────────────────────────────────

function optionalText(value: string, max: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Draft -> `POST /events` body.
 *
 * Deliberate omissions: `status`, `approvedAt`, `approvedBy`, `slug`, `id` —
 * the server derives moderation itself and ignores anything a client sends, so
 * they are never even offered here. Blank strings become `null` because the
 * server's `.min(1)` rejects `''` on city/state.
 */
export function buildCreateEventInput(
  draft: EventDraft,
  uploaded: { coverImage: string | null; images: string[] },
): CreateEventInput {
  const start = draft.startDate;
  const end = draft.endDate || start;
  const entryFeeRaw = draft.entryFee.trim();
  const entryFee = entryFeeRaw === '' ? null : Number(entryFeeRaw);

  const input: CreateEventInput = {
    title: draft.title.trim(),
    eventType: draft.eventType as EventType,
    startDate: start,
    endDate: end,
    startTime: draft.startTime,
    endTime: draft.endTime,
    latitude: draft.latitude,
    longitude: draft.longitude,
    address: optionalText(draft.address, EVENT_FORM_LIMITS.addressMax),
    city: optionalText(draft.city, EVENT_FORM_LIMITS.cityMax),
    state: optionalText(draft.state, EVENT_FORM_LIMITS.stateMax),
    coverImage: uploaded.coverImage,
    images: uploaded.images,
    shortDescription: optionalText(draft.shortDescription, EVENT_FORM_LIMITS.shortDescriptionMax),
    description: optionalText(draft.description, EVENT_FORM_LIMITS.descriptionMax),
    organizerName: optionalText(draft.organizerName, EVENT_FORM_LIMITS.organizerNameMax),
    organizerContact: optionalText(draft.organizerContact, EVENT_FORM_LIMITS.organizerContactMax),
    websiteUrl: optionalText(draft.websiteUrl, EVENT_FORM_LIMITS.websiteUrlMax),
    entryFee: Number.isFinite(entryFee as number) ? entryFee : null,
    linkedPlaceId: draft.linkedPlaceId,
    linkedVendorId: null,
  };

  return input;
}

/** PENDING confirmation copy shown after a successful submit. */
export const EVENT_SUBMIT_NOTICE = {
  status: 'PENDING REVIEW',
  title: 'Event submitted for review',
  body:
    'Your event has been received and is awaiting review. It will appear in discovery once an admin approves it — usually within a day.',
} as const;
