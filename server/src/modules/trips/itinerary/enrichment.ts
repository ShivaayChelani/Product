/**
 * Place enrichment (Phase 1).
 *
 * Turns a factual PALSAFAR PlaceRecord into an EnrichedPlace by attaching
 * engine-computed estimates with an explicit trust classification. Rules:
 *   - known DB value            -> VERIFIED
 *   - engine-computed estimate  -> ESTIMATED
 *   - missing / illegible       -> UNKNOWN (never invented)
 *
 * The pure helpers below are extracted from the legacy engine (duration / fee /
 * opening-hours handling) and are duplicated here intentionally until the new
 * engine replaces the old one (Phase 2+).
 */

import type {
  DataTrust,
  EnrichedPlace,
  EntryFeeEstimate,
  FeeBasis,
  GeoCoords,
  HoursWindow,
  NormalizedHours,
  PlaceRecord,
  PlaceState,
  TimeOfDaySuitability,
} from './types';

// ---------------------------------------------------------------------------
// Visit duration (extracted from itineraryZones.visitMinutes)
// ---------------------------------------------------------------------------

const CATEGORY_DURATION: Record<string, number> = {
  fort: 100,
  palace: 90,
  heritage: 75,
  museum: 75,
  temple: 45,
  gurudwara: 45,
  spiritual: 45,
  religious: 45,
  church: 40,
  mosque: 40,
  waterfall: 60,
  nature: 60,
  park: 45,
  garden: 30,
  lake: 60,
  ghat: 45,
  viewpoint: 45,
  monument: 45,
  adventure: 60,
  trek: 90,
  wildlife: 150,
  cultural: 60,
  market: 60,
  beach: 90,
  default: 60,
};

/** One stop on a multi-place day — not a half-day dedicated visit. */
export const MAX_SIGHTSEEING_SLICE_MINUTES = 75;
const UNCAP_VISIT_CATEGORIES = new Set(['wildlife', 'trek']);

export function categoryOf(p: { category: string }): string {
  return (p.category || 'default').toLowerCase();
}

/**
 * Estimate how long a single party actually stays at a place.
 * Catalog `estimatedDurationMinutes` wins when present; otherwise a documented
 * per-category default; both are capped to a sightseeing slice.
 */
export function estimateDurationMinutes(place: {
  category: string;
  estimatedDurationMinutes?: number | null;
  recommendedDuration?: string | null;
}): number {
  const cat = categoryOf(place);
  const rawDefault = CATEGORY_DURATION[cat] ?? CATEGORY_DURATION.default;
  let raw = rawDefault;
  if (place.estimatedDurationMinutes && place.estimatedDurationMinutes > 0) {
    raw = place.estimatedDurationMinutes;
  } else if (place.recommendedDuration) {
    const match = place.recommendedDuration.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const num = parseFloat(match[1]);
      const isHours = /hour|hr/i.test(place.recommendedDuration);
      if (!Number.isNaN(num) && num > 0) raw = Math.round(isHours ? num * 60 : num);
    }
  }
  if (UNCAP_VISIT_CATEGORIES.has(cat)) return Math.max(1, raw);
  return Math.max(1, Math.min(raw, MAX_SIGHTSEEING_SLICE_MINUTES));
}

// ---------------------------------------------------------------------------
// Entry fees (extracted from itineraryEngine.parseEntryFee / resolveEntryCost)
// ---------------------------------------------------------------------------

export function parseEntryFee(ticketPrice: unknown): number | null {
  if (!ticketPrice || typeof ticketPrice !== 'object') return null;
  const tp = ticketPrice as { adult?: number; child?: number; foreigner?: number };
  if (typeof tp.adult === 'number') return tp.adult;
  if (typeof tp.foreigner === 'number') return tp.foreigner;
  if (typeof tp.child === 'number') return tp.child;
  return null;
}

const FEE_BASIS_SET = new Set<string>(['FREE', 'PER_PERSON', 'PER_VEHICLE', 'PER_GROUP', 'FLAT_RATE', 'UNKNOWN']);

/**
 * Resolve what one itinerary party actually PAYS at a place.
 * Extracted verbatim from the legacy engine so budget math stays identical.
 */
export function resolveEntryCost(ticketPrice: unknown, travelerCount: number): EntryFeeEstimate {
  const tp = (ticketPrice && typeof ticketPrice === 'object' ? ticketPrice : {}) as {
    adult?: number; child?: number; foreigner?: number; basis?: string;
  };
  const explicit = typeof tp.basis === 'string' ? tp.basis.toUpperCase() : undefined;
  const hasAmountFields = [tp.adult, tp.child, tp.foreigner].some((v) => typeof v === 'number');
  const hasPaidAmount = [tp.adult, tp.child, tp.foreigner].some((v) => typeof v === 'number' && v > 0);
  const perPersonRef = typeof tp.adult === 'number'
    ? tp.adult
    : typeof tp.foreigner === 'number'
      ? tp.foreigner
      : typeof tp.child === 'number'
        ? tp.child
        : 0;

  let basis: FeeBasis;
  if (explicit && FEE_BASIS_SET.has(explicit)) basis = explicit as FeeBasis;
  else if (!explicit && hasAmountFields) basis = 'PER_PERSON';
  else basis = 'UNKNOWN';

  switch (basis) {
    case 'FREE':
      return { amount: 0, basis, trust: 'VERIFIED', unknownFee: false };
    case 'PER_PERSON':
      return { amount: perPersonRef * Math.max(1, travelerCount), basis, trust: 'VERIFIED', unknownFee: false };
    case 'PER_VEHICLE':
    case 'PER_GROUP':
    case 'FLAT_RATE':
      return { amount: perPersonRef, basis, trust: 'VERIFIED', unknownFee: false };
    default:
      return { amount: 0, basis: 'UNKNOWN', trust: 'UNKNOWN', unknownFee: hasPaidAmount || explicit === 'UNKNOWN' };
  }
}

// ---------------------------------------------------------------------------
// Opening hours (extracted from itineraryEngine normalize/isPlaceOpenAt)
// ---------------------------------------------------------------------------

function normalizeTimeToken(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1440) return raw;
  if (typeof raw !== 'string') return null;
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3];
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseLegacyHoursRange(value: string): HoursWindow[] | 'closed' | 'always-open' | null {
  const text = value.trim();
  if (!text) return null;
  if (/^closed$/i.test(text)) return 'closed';
  if (/24\s*hours|open all day|all day|always open/i.test(text)) return [{ open: 0, close: 24 * 60 }];
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  const toMin = (h: string, mm: string | undefined, mer: string | undefined): number | null =>
    normalizeTimeToken(`${h}:${mm || '00'}${mer || ''}`);
  const open = toMin(match[1], match[2], match[3]);
  let close = toMin(match[4], match[5], match[6]);
  if (open == null || close == null) return null;
  if (close === open) return [];
  if (close < open) close += 24 * 60;
  return [{ open, close }];
}

/**
 * Deterministic normalizer for every openingHours shape seen in production.
 * Days with no usable windows are OMITTED (unknown), never invented open.
 */
export function normalizeOpeningHours(raw: unknown): NormalizedHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: NormalizedHours = {};

  const addWindows = (dayKey: string, value: unknown): void => {
    const key = dayKey.trim().toLowerCase();
    if (!key) return;
    const windows: HoursWindow[] = [];

    if (typeof value === 'string') {
      const parsed = parseLegacyHoursRange(value);
      if (parsed === 'closed') { out[key] = []; return; }
      if (parsed === 'always-open') { out[key] = [{ open: 0, close: 24 * 60 }]; return; }
      if (Array.isArray(parsed)) windows.push(...parsed);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          const open = normalizeTimeToken(obj.open ?? obj.opens ?? obj.from);
          let close = normalizeTimeToken(obj.close ?? obj.closes ?? obj.to);
          if (open == null || close == null) continue;
          if (close === open) continue;
          if (close < open) close += 24 * 60;
          windows.push({ open, close });
        } else if (typeof entry === 'string') {
          const parsed = parseLegacyHoursRange(entry);
          if (Array.isArray(parsed)) windows.push(...parsed);
        }
      }
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const open = normalizeTimeToken(obj.open ?? obj.opens ?? obj.from);
      let close = normalizeTimeToken(obj.close ?? obj.closes ?? obj.to);
      if (open != null && close != null && close !== open) {
        if (close < open) close += 24 * 60;
        windows.push({ open, close });
      }
    }

    if (windows.length) out[key] = windows;
    else if (typeof value === 'string' && /^closed$/i.test(value.trim())) out[key] = [];
  };

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) addWindows(key, value);

  return Object.keys(out).length ? out : null;
}

export const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function resolveHoursForDate(
  normalized: NormalizedHours,
  date: Date | null,
): HoursWindow[] | null | undefined {
  const dayKey = date ? WEEKDAY_NAMES[date.getDay()] : null;
  if (dayKey && dayKey in normalized) return normalized[dayKey];
  for (const fallback of ['daily', 'all', 'everyday', 'every_day']) {
    if (fallback in normalized) return normalized[fallback];
  }
  return dayKey ? undefined : null;
}

/**
 * Best-effort, schema-tolerant opening-hours check over NORMALIZED data.
 * true = confirmed open; false = confirmed closed; null = unknown.
 * Malformed and zero-length data resolve to null/false — never to open.
 */
export function isPlaceOpenAt(openingHours: unknown, date: Date | null, minutesOfDay: number): boolean | null {
  const normalized = normalizeOpeningHours(openingHours);
  if (!normalized) return null;
  const windows = resolveHoursForDate(normalized, date);
  if (windows == null) return null;
  if (windows.length === 0) return false;
  const t = ((minutesOfDay % 1440) + 1440) % 1440;
  return windows.some((w) =>
    (t >= w.open && t <= w.close)
    || (w.close > 24 * 60 && t + 24 * 60 >= w.open && t + 24 * 60 <= w.close),
  );
}

/** If the place opens LATER on the given day than `afterMinute`, return the opening minute. */
export function nextOpenMinuteAt(openingHours: unknown, date: Date | null, afterMinute: number): number | null {
  const normalized = normalizeOpeningHours(openingHours);
  if (!normalized) return null;
  const windows = resolveHoursForDate(normalized, date);
  if (windows == null || windows.length === 0) return null;
  const t = ((afterMinute % 1440) + 1440) % 1440;
  if (windows.some((w) => t >= w.open && t <= w.close)) return null;
  const future = windows.map((w) => w.open).filter((open) => open > t).sort((a, b) => a - b);
  return future.length ? future[0] : null;
}

// ---------------------------------------------------------------------------
// Time-of-day suitability (0..1 per slot, deterministic)
// ---------------------------------------------------------------------------

const EVENING_AFFINITY: Record<string, number> = {
  ghat: 10,
  viewpoint: 8,
  lake: 6,
  beach: 8,
  waterfall: 5,
  market: 7,
  garden: 3,
  park: 3,
};

export function eveningAffinity(p: { category: string }): number {
  return EVENING_AFFINITY[categoryOf(p)] ?? 0;
}

/** Fraction of a slot's span that trusted opening hours actually cover. */
function slotCoverage(hours: NormalizedHours | null, date: Date | null, slotStart: number, slotEnd: number): number | null {
  if (!hours) return null;
  const windows = resolveHoursForDate(hours, date);
  if (windows == null) return null;
  if (windows.length === 0) return 0;
  let covered = 0;
  for (const w of windows) {
    const start = Math.max(slotStart, w.open);
    const end = Math.min(slotEnd, w.close);
    if (end > start) covered += end - start;
  }
  return Math.max(0, Math.min(1, covered / Math.max(1, slotEnd - slotStart)));
}

export type SlotKey = 'MORNING' | 'AFTERNOON' | 'EVENING';

const SLOT_RANGES: Record<SlotKey, { start: number; end: number }> = {
  MORNING: { start: 8 * 60, end: 12 * 60 },
  AFTERNOON: { start: 12 * 60, end: 17 * 60 },
  EVENING: { start: 17 * 60, end: 21 * 60 },
};

export function computeTimeOfDaySuitability(openingHours: unknown, category: string, date: Date | null): TimeOfDaySuitability {
  const normalized = normalizeOpeningHours(openingHours);
  const out = {} as TimeOfDaySuitability;
  for (const slot of Object.keys(SLOT_RANGES) as SlotKey[]) {
    const { start, end } = SLOT_RANGES[slot];
    const coverage = slotCoverage(normalized, date, start, end);
    let value: number;
    if (coverage == null) {
      value = 0.5; // unknown hours are a neutral signal, never fabricated
    } else if (slot === 'EVENING') {
      // Blend real coverage with documented evening affinity for sunset/aarti-style places.
      value = 0.7 * coverage + 0.3 * Math.min(1, eveningAffinity({ category }) / 10);
    } else {
      value = coverage;
    }
    out[slot] = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  }
  return out;
}

// ---------------------------------------------------------------------------
// enrichPlace
// ---------------------------------------------------------------------------

export interface EnrichContext {
  travelerCount: number;
  date?: Date | null;
  /** Defaults to a zero-state (nothing selected/pinned/...) when not supplied. */
  state?: PlaceState;
}

export function emptyPlaceState(): PlaceState {
  return {
    selected: false,
    pinned: false,
    lockedPosition: false,
    fixedTime: false,
    priorityAnchor: false,
    complementary: false,
    optional: false,
  };
}

export function enrichPlace(record: PlaceRecord, ctx: EnrichContext): EnrichedPlace {
  const hasCoords = typeof record.latitude === 'number' && typeof record.longitude === 'number';
  const coordinates: GeoCoords = hasCoords
    ? { lat: record.latitude as number, lng: record.longitude as number }
    : { lat: 0, lng: 0 };

  const durationMinutes = estimateDurationMinutes(record);
  const entryFee = resolveEntryCost(record.ticketPrice, Math.max(1, ctx.travelerCount));
  const openingHours = normalizeOpeningHours(record.openingHours);

  return {
    id: record.id,
    name: record.name,
    category: record.category || 'default',
    tags: record.tags || [],
    city: record.city ?? null,
    country: record.country ?? null,
    coordinates,
    rating: record.rating,
    reviewCount: record.reviewCount ?? 0,
    popularityScore: record.popularityScore,
    hiddenGemScore: record.hiddenGemScore,
    editorialPriority: record.editorialPriority ?? 3,
    durationMinutes,
    durationTrust: 'ESTIMATED',
    entryFee,
    openingHours,
    hoursTrust: openingHours ? 'VERIFIED' : 'UNKNOWN',
    timeOfDaySuitability: computeTimeOfDaySuitability(record.openingHours, record.category, ctx.date ?? null),
    state: ctx.state ?? emptyPlaceState(),
    factsTrust: {
      statusVerified: true,
      coordinatesVerified: hasCoords,
      categoryVerified: !!record.category,
      ratingVerified: typeof record.rating === 'number',
      openingHoursDelivered: !!openingHours,
      ticketPriceDelivered: entryFee.trust !== 'UNKNOWN',
    },
    belongsToDestination: false,
  };
}

/** Trust label helper for estimates — VERIFIED/ESTIMATED/UNKNOWN with no ambiguity. */
export function trustOf(value: unknown): DataTrust {
  if (value === null || value === undefined) return 'UNKNOWN';
  return 'VERIFIED';
}