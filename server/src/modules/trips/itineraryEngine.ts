import { TravelPace, TimePreference, AvoidOption } from '@prisma/client';
import { prisma } from '../../config/database';
import { haversineDistance } from '../../shared/utils/geo';
import { dedupeByLocation, normalizePlaceName } from '../../shared/utils/placeDedupe';
import { resolveDestinationCentroid } from '../../shared/utils/geocode';
import {
  canonicalizeDestination,
  extractMustVisitHints,
  isRegionDestination,
  placeBelongsToDestination,
} from '../../shared/utils/destination';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { assignDaysByClusterValue, absoluteMinTier, minAllowedTier, priorityTier, visitMinutes, type ClusterPlace } from './itineraryCluster';
import { placePassesBudgetFilter } from './budgetFilter';


/**
 * Production itinerary generation engine.
 *
 * Fully functional without any AI/LLM dependency — candidate collection,
 * scoring, hard filtering, opening-hours validation, geographic CLUSTER
 * day assignment (see itineraryCluster.ts), and route/time gates are all
 * deterministic and DB-backed.
 * Gemini (when configured) is used only as a best-effort text polish layer
 * over the *already-chosen* real places — generation never depends on it.
 *
 * Day planning philosophy (itineraryCluster):
 *   USER INTENT → TIME FEASIBILITY → CLUSTER VALUE → PRIORITY → EFFICIENCY
 * A strong local cluster can beat an isolated far 5★ on short trips.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeSlotKey = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface EngineParams {
  destination: string;
  days: number;
  pace: TravelPace;
  travelers?: string | null;
  budgetTier?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  customBudgetAmount?: number | null;
  interests: string[];
  timePreference?: TimePreference | null;
  avoid: AvoidOption[];
  manualPlaceIds?: string[];
  /** When true with manual pins, AI may fill remaining day slots with nearby places. */
  fillWithAi?: boolean;
  /** Free-text prompt — used to pin named landmarks the user asked for. */
  prompt?: string | null;
  startDate?: Date | null;
  transportation?: string[];
  /** Regenerate only this day (1-based); pinned stops on that day are kept. */
  regenerateDayNumber?: number | null;
  /** Place IDs already used elsewhere in the trip — excluded from new picks. */
  excludePlaceIds?: string[];
  /** Actual trip start / traveler origin for Day 1 (overrides destination centroid when set). */
  startLocation?: { latitude: number; longitude: number } | null;
  /**
   * Optional hotel/base per night. Key = 1-based day number that STARTS from that base.
   * Day 2+ otherwise starts from the previous day's last stop.
   */
  hotelBaseByDay?: Record<number, { lat: number; lng: number; label?: string }>;
  /** 0 = original plan; 1+ cycles a different opening area on Regenerate. */
  variationSeed?: number;
  /** Previous day-1 hubs to skip when a peer outing exists. */
  avoidHubIds?: string[];
  /** Earliest allowed day-start time in minutes-of-day (e.g. "start after 10 AM" -> 600). */
  earliestStartMinutes?: number | null;
}

export interface EngineStop {
  placeId: string;
  name: string;
  category: string;
  dayNumber: number;
  order: number;
  timeSlot: TimeSlotKey;
  startTime: string;
  endTime: string;
  duration: number;
  entryFee: number | null;
  cost: number | null;
  distanceFromPrev: number | null;
  reason: string;
  isPinned: boolean;
}

export interface EngineDayInfo {
  dayNumber: number;
  theme: string;
  foodStops: Array<{ placeId: string; name: string; distanceKm: number }>;
  nearbyVendors: Array<{ vendorId: string; businessName: string; distanceKm: number }>;
}

export interface NearbyDestinationSuggestion {
  city: string;
  state: string;
  placeCount: number;
  distanceKm: number | null;
}

export interface EngineResult {
  dayInfo: EngineDayInfo[];
  stops: EngineStop[];
  estimatedBudget: number;
  totalDistanceKm: number;
  note: string;
  warnings: string[];
  nearbyDestinations?: NearbyDestinationSuggestion[];
}

interface CandidatePlace {
  id: string;
  name: string;
  category: string;
  tags: string[];
  city?: string | null;
  state?: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount?: number | null;
  popularityScore: number | null;
  hiddenGemScore: number | null;
  editorialPriority: number;
  openingHours: unknown;
  ticketPrice: unknown;
  estimatedDurationMinutes: number | null;
  recommendedDuration: string | null;
  score: number;
  isPinned: boolean;
}

// ---------------------------------------------------------------------------
// Configuration tables
// ---------------------------------------------------------------------------

export const PACE_CONFIG: Record<TravelPace, { stopsPerDay: number; maxMinutesPerDay: number }> = {
  QUICK: { stopsPerDay: 7, maxMinutesPerDay: 540 },
  BALANCED: { stopsPerDay: 6, maxMinutesPerDay: 480 },
  RELAXED: { stopsPerDay: 5, maxMinutesPerDay: 420 },
  VERY_RELAXED: { stopsPerDay: 4, maxMinutesPerDay: 390 },
};

/** Interest label (as sent by the mobile form) -> matching category/tag keywords. */
export const INTEREST_CATEGORY_MAP: Record<string, string[]> = {
  temples: ['temple', 'mosque', 'church', 'gurudwara'],
  heritage: ['fort', 'palace', 'monument', 'museum', 'heritage'],
  history: ['fort', 'palace', 'monument', 'museum', 'heritage', 'temple'],
  waterfalls: ['waterfall'],
  nature: [
    'waterfall', 'lake', 'park', 'wildlife', 'garden', 'hill', 'valley',
    'dam', 'reservoir', 'riverfront', 'nature', 'forest', 'viewpoint',
  ],
  food: ['market', 'restaurant', 'street food', 'cafe', 'food'],
  adventure: ['waterfall', 'park', 'trek', 'trekking', 'wildlife', 'adventure'],
  shopping: ['market', 'shopping', 'bazaar'],
  'hidden gems': [],
  hidden_gems: [],
  'local culture': ['museum', 'market', 'monument', 'palace', 'ghat', 'temple', 'religious', 'spiritual', 'cultural'],
  local_culture: ['museum', 'market', 'monument', 'palace', 'ghat', 'temple', 'religious', 'spiritual', 'cultural'],
  culture: ['museum', 'market', 'monument', 'palace', 'ghat', 'temple', 'religious', 'spiritual', 'cultural'],
};

const NON_FAMILY_FRIENDLY_KEYWORDS = ['bar', 'pub', 'nightclub', 'nightlife', 'casino'];

const DEFAULT_SPEED_KMH = 30;
const TRANSPORT_COST_PER_KM = 8;

function averageSpeedKmh(transportation?: string[]): number {
  if (!transportation?.length) return DEFAULT_SPEED_KMH;
  const modes = transportation.map((t) => t.toUpperCase());
  if (modes.includes('WALKING')) return 4;
  if (modes.includes('BIKE')) return 15;
  if (modes.includes('TRAIN')) return 45;
  if (modes.includes('FLIGHT')) return 60;
  if (modes.includes('CAR')) return 35;
  return DEFAULT_SPEED_KMH;
}

/**
 * Canonical traveler-count resolution for cost math.
 * Mirrors the mobile app's resolveTravellerCount so both sides agree.
 */
export function resolveTravelerCount(travelers?: string | null): number {
  const key = String(travelers || '').toUpperCase();
  if (key === 'COUPLE') return 2;
  if (key === 'FAMILY' || key === 'FRIENDS') return 3;
  return 1;
}

/**
 * The same-complex compact bonus is a fast-pace privilege. RELAXED and
 * VERY_RELAXED must deliver genuinely thinner days, so their stop caps are
 * strict and cannot be inflated by nearby top-ups.
 */
export function compactBonusAllowedForPace(pace: TravelPace): boolean {
  return pace === 'QUICK' || pace === 'BALANCED';
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export function estimateDurationMinutes(place: {
  estimatedDurationMinutes?: number | null;
  recommendedDuration?: string | null;
  category?: string | null;
}): number {
  return visitMinutes({
    id: '_',
    name: '_',
    category: place.category || 'default',
    latitude: 0,
    longitude: 0,
    rating: null,
    editorialPriority: 3,
    estimatedDurationMinutes: place.estimatedDurationMinutes ?? null,
    recommendedDuration: place.recommendedDuration ?? null,
    isPinned: false,
  });
}

export function parseEntryFee(ticketPrice: unknown): number | null {
  if (!ticketPrice || typeof ticketPrice !== 'object') return null;
  const tp = ticketPrice as { adult?: number; child?: number; foreigner?: number };
  if (typeof tp.adult === 'number') return tp.adult;
  if (typeof tp.foreigner === 'number') return tp.foreigner;
  if (typeof tp.child === 'number') return tp.child;
  return null;
}

export type FeeBasis = 'FREE' | 'PER_PERSON' | 'PER_VEHICLE' | 'PER_GROUP' | 'FLAT_RATE' | 'UNKNOWN';

/**
 * Resolve what one itinerary party actually PAYS at a place.
 *
 * - Legacy rows without an explicit basis infer PER_PERSON when adult/child/
 *   foreigner amounts exist (that was the engine's historical assumption).
 * - FREE costs nothing.
 * - PER_VEHICLE / PER_GROUP / FLAT_RATE are charged ONCE per outing — the
 *   engine never invents vehicle or group counts.
 * - UNKNOWN is preserved as UNKNOWN: the amount is excluded from the numeric
 *   budget and surfaced as a warning instead of being silently treated as free.
 */
export function resolveEntryCost(
  ticketPrice: unknown,
  travelerCount: number,
): { amount: number; basis: FeeBasis; unknownFee: boolean } {
  const tp = (ticketPrice && typeof ticketPrice === 'object' ? ticketPrice : {}) as {
    adult?: number; child?: number; foreigner?: number; basis?: string;
  };
  const explicit = typeof tp.basis === 'string' ? tp.basis.toUpperCase() : undefined;
  // Any numeric amount field (including 0) means this row predates the basis
  // model and was always treated as a per-person ticket.
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
      return { amount: 0, basis, unknownFee: false };
    case 'PER_PERSON':
      return { amount: perPersonRef * Math.max(1, travelerCount), basis, unknownFee: false };
    case 'PER_VEHICLE':
    case 'PER_GROUP':
    case 'FLAT_RATE':
      return { amount: perPersonRef, basis, unknownFee: false };
    default:
      // UNKNOWN — never silently free.
      return { amount: 0, basis: 'UNKNOWN', unknownFee: hasPaidAmount || explicit === 'UNKNOWN' };
  }
}

const FEE_BASIS_SET = new Set<string>(['FREE', 'PER_PERSON', 'PER_VEHICLE', 'PER_GROUP', 'FLAT_RATE', 'UNKNOWN']);

// ---------------------------------------------------------------------------
// Opening hours: normalization + evaluation (production-shape tolerant)
// ---------------------------------------------------------------------------

interface NormalizedHoursWindow { open: number; close: number }

/**
 * Parse a single time token in any production spelling.
 * Accepts "07:00", "7", "7:30 PM", "06:00am"; rejects everything else so
 * malformed data becomes UNKNOWN instead of a fabricated open state.
 */
function normalizeTimeToken(raw: unknown): number | null {
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

/** Legacy string range: "07:00 - 18:00", "9-5", "closed", "24 hours". */
function parseLegacyHoursRange(value: string): Array<NormalizedHoursWindow> | 'closed' | 'always-open' | null {
  const text = value.trim();
  if (!text) return null;
  if (/^closed$/i.test(text)) return 'closed';
  if (/24\s*hours|open all day|all day|always open/i.test(text)) {
    return [{ open: 0, close: 24 * 60 }];
  }
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  const toMin = (h: string, mm: string | undefined, mer: string | undefined): number | null => {
    const base = normalizeTimeToken(`${h}:${mm || '00'}${mer || ''}`);
    return base;
  };
  const open = toMin(match[1], match[2], match[3]);
  let close = toMin(match[4], match[5], match[6]);
  if (open == null || close == null) return null;
  if (close === open) return []; // zero-length window is not an opening period
  if (close < open) close += 24 * 60; // overnight window
  return [{ open, close }];
}

/**
 * Deterministic normalizer for every Place.openingHours shape seen in the
 * wild:
 *   {"Friday":[{"open":"07:00","close":"18:00"}]}   (production import shape)
 *   {"friday":"07:00 - 18:00"}                      (legacy engine shape)
 *   {"daily":"9 AM - 5 PM"} / {"all": ...}          (generic fallbacks)
 *
 * Guarantees:
 *  - weekday keys are lower-cased (case-insensitive lookup)
 *  - zero-length windows ("07:00"->"07:00") are dropped as invalid
 *  - overnight windows close <= open wrap past midnight
 *  - days with no usable windows are OMITTED (unknown), never invented open
 * Returns null when nothing usable remains -> caller treats as UNKNOWN.
 */
export function normalizeOpeningHours(raw: unknown): Record<string, NormalizedHoursWindow[]> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, NormalizedHoursWindow[]> = {};

  const addWindows = (dayKey: string, value: unknown): void => {
    const key = dayKey.trim().toLowerCase();
    if (!key) return;
    const windows: NormalizedHoursWindow[] = [];

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
          if (open == null || close == null) continue; // malformed window -> skip
          if (close === open) continue;                 // zero-length -> invalid
          if (close < open) close += 24 * 60;           // overnight
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

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    addWindows(key, value);
  }

  return Object.keys(out).length ? out : null;
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveHoursForDate(
  normalized: Record<string, NormalizedHoursWindow[]>,
  date: Date | null,
): NormalizedHoursWindow[] | null | undefined {
  const dayKey = date ? WEEKDAY_NAMES[date.getDay()] : null;
  if (dayKey && dayKey in normalized) return normalized[dayKey];
  for (const fallback of ['daily', 'all', 'everyday', 'every_day']) {
    if (fallback in normalized) return normalized[fallback];
  }
  // No date context: only generic keys can answer; otherwise UNKNOWN.
  return dayKey ? undefined : null;
}

/**
 * Best-effort, schema-tolerant opening-hours check over NORMALIZED data.
 *   true  -> confirmed open at this time
 *   false -> confirmed closed at this time
 *   null  -> unknown/unparseable (caller must never block on this)
 * Malformed and zero-length data resolve to null/false — never to open.
 */
export function isPlaceOpenAt(openingHours: unknown, date: Date | null, minutesOfDay: number): boolean | null {
  const normalized = normalizeOpeningHours(openingHours);
  if (!normalized) return null;

  const windows = resolveHoursForDate(normalized, date);
  if (windows == null) return null;       // unknown for that weekday / no context
  if (windows.length === 0) return false; // explicitly closed

  const t = ((minutesOfDay % 1440) + 1440) % 1440;
  return windows.some((w) => {
    // Inside today's window, or inside an overnight window still running
    // from yesterday (t shifted a full day forward must fall in [open, close]).
    return (t >= w.open && t <= w.close)
      || (w.close > 24 * 60 && t + 24 * 60 >= w.open && t + 24 * 60 <= w.close);
  });
}

/**
 * If the place opens LATER on the given day than `afterMinute`, return the
 * opening minute; null when already open / closed all day / unknown.
 * Lets scheduling shift a visit forward instead of dropping it blindly.
 */
export function nextOpenMinuteAt(openingHours: unknown, date: Date | null, afterMinute: number): number | null {
  const normalized = normalizeOpeningHours(openingHours);
  if (!normalized) return null;
  const windows = resolveHoursForDate(normalized, date);
  if (windows == null || windows.length === 0) return null;
  const t = ((afterMinute % 1440) + 1440) % 1440;
  if (windows.some((w) => t >= w.open && t <= w.close)) return null;
  const future = windows
    .map((w) => w.open)
    .filter((open) => open > t)
    .sort((a, b) => a - b);
  return future.length ? future[0] : null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineDistance(lat1, lng1, lat2, lng2) / 1000;
}

function minutesToTimeStr(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const SLOT_BASE_MINUTES: Record<TimeSlotKey, number> = {
  MORNING: 9 * 60,
  AFTERNOON: 13 * 60,
  EVENING: 17 * 60,
};

function minutesToTimeSlot(minutes: number): TimeSlotKey {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m < 12 * 60) return 'MORNING';
  if (m < 17 * 60) return 'AFTERNOON';
  return 'EVENING';
}

function slotOrderForPreference(pref?: TimePreference | null): TimeSlotKey[] {
  if (pref === 'MORNING_FOCUSED') return ['MORNING', 'AFTERNOON', 'EVENING'];
  if (pref === 'EVENING_FRIENDLY') return ['AFTERNOON', 'EVENING', 'MORNING'];
  return ['MORNING', 'AFTERNOON', 'EVENING'];
}

// ---------------------------------------------------------------------------
// Route optimization: nearest-neighbor construction + bounded 2-opt
// ---------------------------------------------------------------------------

interface RoutablePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export function nearestNeighborOrder<T extends RoutablePoint>(points: T[], start?: { latitude: number; longitude: number }): T[] {
  if (points.length <= 1) return [...points];
  const remaining = [...points];
  const ordered: T[] = [];
  let curLat = start?.latitude ?? points[0].latitude;
  let curLng = start?.longitude ?? points[0].longitude;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(curLat, curLng, remaining[i].latitude, remaining[i].longitude);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1);
    ordered.push(chosen);
    curLat = chosen.latitude;
    curLng = chosen.longitude;
  }
  return ordered;
}

function routeLength(points: RoutablePoint[], start?: { latitude: number; longitude: number }): number {
  let total = 0;
  let prevLat = start?.latitude;
  let prevLng = start?.longitude;
  for (const p of points) {
    if (prevLat !== undefined && prevLng !== undefined) {
      total += haversineKm(prevLat, prevLng, p.latitude, p.longitude);
    }
    prevLat = p.latitude;
    prevLng = p.longitude;
  }
  return total;
}

/** Bounded 2-opt improvement pass to reduce backtracking beyond pure NN. */
export function twoOptImprove<T extends RoutablePoint>(points: T[], start?: { latitude: number; longitude: number }, maxIterations = 60): T[] {
  if (points.length < 4) return points;
  let route = [...points];
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (routeLength(candidate, start) < routeLength(route, start) - 1e-6) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

// ---------------------------------------------------------------------------
// Candidate collection + scoring
// ---------------------------------------------------------------------------

// Re-export for tests and callers that imported from itineraryEngine.
export { dedupeByLocation, normalizePlaceName } from '../../shared/utils/placeDedupe';

const PLACE_SELECT = {
  id: true, name: true, category: true, tags: true, latitude: true, longitude: true,
  rating: true, reviewCount: true, popularityScore: true, hiddenGemScore: true, editorialPriority: true,
  openingHours: true,
  ticketPrice: true, estimatedDurationMinutes: true, recommendedDuration: true,
  city: true, state: true,
} as const;

/** Max distance (km) from destination centroid for a stop to be included. */
const CITY_RADIUS_KM = 55;
const REGION_RADIUS_KM = 140;

function maxRadiusKm(destination: string): number {
  return isRegionDestination(destination) ? REGION_RADIUS_KM : CITY_RADIUS_KM;
}

async function collectCandidates(
  destination: string,
  centroid: { lat: number; lng: number },
  excludeIds: Set<string>,
  centroidTrusted: boolean,
) {
  const dest = canonicalizeDestination(destination) || destination.trim();
  const exclude = Array.from(excludeIds);
  const radiusKm = maxRadiusKm(dest);
  const baseWhere = {
    status: 'APPROVED' as const,
    latitude: { not: null },
    longitude: { not: null },
    ...(exclude.length ? { id: { notIn: exclude } } : {}),
  };

  // Exact city/state first — this is the accuracy gate for "places asked".
  const byExact = await prisma.place.findMany({
    where: {
      ...baseWhere,
      OR: [
        { city: { equals: dest, mode: 'insensitive' } },
        { state: { equals: dest, mode: 'insensitive' } },
      ],
    },
    select: PLACE_SELECT,
    take: 100,
  });

  const exact = dedupeByLocation(byExact).filter((p) => placeBelongsToDestination(p, dest));
  if (exact.length >= 8) {
    return centroidTrusted
      ? exact.filter((p) => p.latitude != null && p.longitude != null
        && haversineKm(centroid.lat, centroid.lng, p.latitude, p.longitude) <= radiusKm)
      : exact;
  }

  // Soft city/state contains when exact coverage is thin.
  const bySoft = await prisma.place.findMany({
    where: {
      ...baseWhere,
      OR: [
        { city: { contains: dest, mode: 'insensitive' } },
        { state: { contains: dest, mode: 'insensitive' } },
      ],
    },
    select: PLACE_SELECT,
    take: 100,
  });

  let combined = dedupeByLocation([...exact, ...bySoft]).filter((p) => placeBelongsToDestination(p, dest));
  if (combined.length >= 6) {
    return centroidTrusted
      ? combined.filter((p) => p.latitude != null && p.longitude != null
        && haversineKm(centroid.lat, centroid.lng, p.latitude, p.longitude) <= radiusKm)
      : combined;
  }

  if (!centroidTrusted) {
    // Never invent a random city's places when destination is unknown.
    return combined;
  }

  // Last resort: nearby radius, still membership-filtered when possible.
  const cityIds = new Set(combined.map((p) => p.id));
  const radiusDeg = radiusKm / 111;
  const byRadius = await prisma.place.findMany({
    where: {
      status: 'APPROVED',
      ...(cityIds.size || exclude.length
        ? { id: { notIn: Array.from(new Set([...exclude, ...cityIds])) } }
        : {}),
      latitude: { not: null, gte: centroid.lat - radiusDeg, lte: centroid.lat + radiusDeg },
      longitude: { not: null, gte: centroid.lng - radiusDeg, lte: centroid.lng + radiusDeg },
    },
    select: PLACE_SELECT,
    take: 80,
  });

  const radiusKept = byRadius.filter((p) => {
    if (p.latitude == null || p.longitude == null) return false;
    if (haversineKm(centroid.lat, centroid.lng, p.latitude, p.longitude) > radiusKm) return false;
    // Prefer places that still belong to the destination; allow nearby only for thin catalogs.
    return placeBelongsToDestination(p, dest) || combined.length < 4;
  });

  combined = dedupeByLocation([...combined, ...radiusKept]);
  return combined.filter((p) => p.latitude != null && p.longitude != null
    && haversineKm(centroid.lat, centroid.lng, p.latitude, p.longitude) <= radiusKm);
}

/** Resolve landmark names mentioned in the user prompt to place IDs in/near the destination. */
async function resolvePromptMentionedPlaces(
  prompt: string | null | undefined,
  destination: string,
  centroid: { lat: number; lng: number },
  alreadyPinned: Set<string>,
): Promise<string[]> {
  const hints = extractMustVisitHints(prompt, destination);
  if (hints.length === 0) return [];

  const dest = canonicalizeDestination(destination) || destination.trim();
  const radiusKm = maxRadiusKm(dest);
  const found: string[] = [];

  for (const hint of hints) {
    const matches = await prisma.place.findMany({
      where: {
        status: 'APPROVED',
        latitude: { not: null },
        longitude: { not: null },
        name: { contains: hint, mode: 'insensitive' },
        OR: [
          { city: { contains: dest, mode: 'insensitive' } },
          { state: { contains: dest, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, city: true, state: true, latitude: true, longitude: true, rating: true },
      take: 8,
    });

    const ranked = matches
      .filter((m) => placeBelongsToDestination(m, dest)
        || (m.latitude != null && m.longitude != null
          && haversineKm(centroid.lat, centroid.lng, m.latitude, m.longitude) <= radiusKm))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

    for (const m of ranked) {
      if (alreadyPinned.has(m.id) || found.includes(m.id)) continue;
      found.push(m.id);
      break; // one best match per hint
    }
  }

  return found;
}

function matchesInterests(place: { category: string; tags: string[] }, interests: string[]): boolean {
  if (interests.length === 0) return true;
  const cat = place.category.toLowerCase();
  const tags = place.tags.map((t) => t.toLowerCase());
  for (const interest of interests) {
    const key = interest.toLowerCase();
    const keywords = INTEREST_CATEGORY_MAP[key] || [];
    if (keywords.some((k) => cat.includes(k) || tags.some((t) => t.includes(k)))) return true;
    // The raw interest itself may name a category or tag directly
    // ("heritage" -> category "heritage", "food" -> tag "street food").
    if (cat.includes(key) || tags.some((t) => t.includes(key))) return true;
  }
  return false;
}

/**
 * Interest-driven pool narrowing. When enough candidates genuinely match the
 * requested interests, unmatched places are pushed behind every matched one so
 * they only appear when capacity remains — interests must materially shape the
 * plan, not decorate it. Pinned stops always survive.
 */
export function applyInterestGate<T extends { id: string; isPinned?: boolean }>(
  pool: T[],
  interests: string[],
  neededSlots: number,
): { pool: T[]; gatedOutCount: number; gated: boolean; matchedIds: Set<string> } {
  const meaningful = Array.from(new Set(interests.map((i) => i.toLowerCase().trim())))
    .filter((i) => (INTEREST_CATEGORY_MAP[i] || []).length > 0);
  if (!meaningful.length) {
    return { pool, gatedOutCount: 0, gated: false, matchedIds: new Set() };
  }

  const matched = pool.filter((p) =>
    p.isPinned || matchesInterests(p as unknown as { category: string; tags: string[] }, meaningful));
  // Supply coverage rule: gate only when matches can actually fill the plan
  // (absolute floor keeps tiny pools stable). Otherwise keep everyone.
  const need = Math.max(Math.ceil(neededSlots), 12);
  if (matched.length < need) {
    return { pool, gatedOutCount: 0, gated: false, matchedIds: new Set() };
  }

  const matchedIds = new Set(matched.map((m) => m.id));
  const ordered = [...matched, ...pool.filter((p) => !matchedIds.has(p.id))];
  return { pool: ordered, gatedOutCount: pool.length - matched.length, gated: true, matchedIds };
}

function scoreCandidate(
  place: {
    category: string;
    tags: string[];
    city?: string | null;
    state?: string | null;
    latitude: number;
    longitude: number;
    rating: number | null;
    popularityScore: number | null;
    hiddenGemScore: number | null;
  },
  centroid: { lat: number; lng: number },
  interests: string[],
  wantsHiddenGems: boolean,
  avoidCrowded: boolean,
  destination: string,
  radiusKm: number,
): number {
  let score = 0;
  score += matchesInterests(place, interests) ? 0.35 : 0.08;
  score += Math.min(1, (place.rating ?? 3) / 5) * 0.2;

  const popularity = Math.min(1, (place.popularityScore ?? 20) / 100);
  score += avoidCrowded ? (1 - popularity) * 0.15 : popularity * 0.15;

  if (wantsHiddenGems) score += Math.min(1, (place.hiddenGemScore ?? 0) / 100) * 0.25;

  const distKm = haversineKm(centroid.lat, centroid.lng, place.latitude, place.longitude);
  score += Math.max(0, 1 - distKm / Math.max(radiusKm, 1)) * 0.2;

  // Hard accuracy boost: places that truly belong to the asked destination.
  if (placeBelongsToDestination(place, destination)) score += 0.35;
  const dest = canonicalizeDestination(destination);
  const city = (place.city || '').toLowerCase().trim();
  if (dest && city === dest) score += 0.15;

  return score;
}

/** Suggest verified nearby cities when the destination has too few places. */
export async function findNearbyDestinations(
  destination: string,
  centroid: { lat: number; lng: number },
  limit = 5,
): Promise<NearbyDestinationSuggestion[]> {
  const dest = canonicalizeDestination(destination) || destination.trim();
  const radiusDeg = 2.5; // ~275 km search window

  const places = await prisma.place.findMany({
    where: {
      status: 'APPROVED',
      latitude: { not: null, gte: centroid.lat - radiusDeg, lte: centroid.lat + radiusDeg },
      longitude: { not: null, gte: centroid.lng - radiusDeg, lte: centroid.lng + radiusDeg },
      NOT: {
        OR: [
          { city: { equals: dest, mode: 'insensitive' } },
          { city: { contains: dest, mode: 'insensitive' } },
        ],
      },
    },
    select: { city: true, state: true, latitude: true, longitude: true },
    take: 500,
  });

  const byCity = new Map<string, { state: string; count: number; lat: number; lng: number }>();
  for (const p of places) {
    if (!p.city || p.latitude == null || p.longitude == null) continue;
    const cityKey = p.city.trim();
    if (!cityKey) continue;
    const key = cityKey.toLowerCase();
    const existing = byCity.get(key);
    if (existing) {
      existing.count++;
    } else {
      byCity.set(key, { state: p.state || '', count: 1, lat: p.latitude, lng: p.longitude });
    }
  }

  return Array.from(byCity.entries())
    .map(([cityKey, info]) => ({
      city: cityKey.replace(/\b\w/g, (c) => c.toUpperCase()),
      state: info.state,
      placeCount: info.count,
      distanceKm: Math.round(haversineKm(centroid.lat, centroid.lng, info.lat, info.lng) * 10) / 10,
    }))
    .filter((s) => s.placeCount >= 5)
    .sort((a, b) => b.placeCount - a.placeCount || (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, limit);
}

function passesHardFilters(
  place: { category: string; tags: string[]; ticketPrice: unknown },
  params: EngineParams,
): boolean {
  const cat = place.category.toLowerCase();
  const tags = place.tags.map((t) => t.toLowerCase());
  const entryFee = parseEntryFee(place.ticketPrice);

  if (!placePassesBudgetFilter(entryFee, params)) return false;

  if ((params.avoid.includes('NON_FAMILY_FRIENDLY') || params.travelers === 'FAMILY' || params.travelers === 'family')) {
    if (NON_FAMILY_FRIENDLY_KEYWORDS.some((k) => cat.includes(k) || tags.some((t) => t.includes(k)))) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Reason / theme text generation (deterministic — always available)
// ---------------------------------------------------------------------------

/** Human-readable category labels — raw slugs like "riverfront_/_nature" never reach users. */
export function humanizeCategory(category: string): string {
  const cleaned = (category || '')
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'local spot';
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function buildReason(place: CandidatePlace, interests: string[], _distanceFromPrevKm: number | null): string {
  const label = humanizeCategory(place.category);

  // Proximity is owned by the journey-reason layer; this copy must not repeat it.
  const matchedInterest = interests.find((interest) => {
    const keywords = INTEREST_CATEGORY_MAP[interest.toLowerCase()] || [];
    return keywords.some((k) => place.category.toLowerCase().includes(k) || place.tags.some((t) => t.toLowerCase().includes(k)));
  });

  const parts: string[] = [];
  // Only claim quality when the database actually supports it.
  if (place.rating != null && place.rating >= 4 && (place.reviewCount ?? 0) > 0) {
    parts.push(`Well-rated ${label.toLowerCase()}`);
  } else {
    parts.push(label);
  }
  if (matchedInterest) parts.push(`fits your interest in ${matchedInterest}`);
  if (place.hiddenGemScore != null && place.hiddenGemScore > 60) parts.push('a quieter pick worth discovering');
  else if (place.popularityScore != null && place.popularityScore > 70) parts.push('a visitor favourite');

  const reason = parts.filter(Boolean).join(', ');
  return reason ? `${reason}.` : `A ${label.toLowerCase()} worth a stop.`;
}

/** Day title from actual destination + cluster highlights — never a stale city template. */
export function buildDayTheme(
  destination: string,
  places: Array<{ name: string; category: string; editorialPriority?: number; rating?: number | null }>,
): string {
  const destLabel = (destination || '').trim().split(',')[0].trim() || 'Local';
  if (!places.length) return `${destLabel} Free Day`;

  const shortName = (name: string) => {
    const cleaned = name.replace(/\b(Temple|Mandir|Fort|Falls|Palace|Museum|Ghat)\b/gi, '').trim();
    return (cleaned || name).split(/\s+/).slice(0, 2).join(' ');
  };

  const highlights = places
    .filter((p) => (p.editorialPriority ?? 0) >= 5 || (p.rating ?? 0) >= 4.5)
    .map((p) => shortName(p.name));

  if (highlights.length >= 2) {
    return `${highlights[0]} & ${destLabel} Highlights`;
  }
  if (highlights.length === 1) {
    return `${highlights[0]} & ${destLabel}`;
  }

  const cat = (places[0].category || 'sightseeing').toLowerCase();
  const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
  return `${destLabel} ${catLabel} & Local Sightseeing`;
}

// ---------------------------------------------------------------------------
// Route quality + attempt selection (P0 budget / P2 regeneration guard)
// ---------------------------------------------------------------------------

/** Chain-vs-direct span ratio for one day's stop sequence. 1.0 = straight line. */
export function routeDetourIndex(points: Array<{ latitude: number; longitude: number }>): number {
  if (points.length < 3) return 1;
  let chain = 0;
  for (let i = 1; i < points.length; i++) {
    chain += haversineKm(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
  }
  const direct = haversineKm(points[0].latitude, points[0].longitude, points[points.length - 1].latitude, points[points.length - 1].longitude);
  if (direct < 0.5) return chain > 2 ? 1.5 : 1; // single-complex day: compact by definition
  return Math.round((chain / direct) * 100) / 100;
}

const MAX_ACCEPTABLE_DAY_DETOUR = 1.8;

interface AttemptOutcome {
  result: EngineResult;
  maxDetour: number;
  overBudgetBy: number;
}

/**
 * Deterministic winner policy:
 *   1. any within-budget attempt beats any over-budget attempt
 *   2. then least budget overrun
 *   3. then best route quality (lowest worst-day detour)
 *   4. then earliest generated (stable tie-break)
 */
export function selectBestAttempt(list: AttemptOutcome[], _budgetCap: number | null): AttemptOutcome | null {
  if (!list.length) return null;
  return [...list].sort((x, y) => {
    const xOver = x.overBudgetBy > 0 ? 1 : 0;
    const yOver = y.overBudgetBy > 0 ? 1 : 0;
    if (xOver !== yOver) return xOver - yOver;
    if (x.overBudgetBy !== y.overBudgetBy) return x.overBudgetBy - y.overBudgetBy;
    // Completeness outranks geometry: a fuller plan beats a sparser one even
    // when the sparse one happens to sit on a straight line.
    if (x.result.stops.length !== y.result.stops.length) {
      return y.result.stops.length - x.result.stops.length;
    }
    if (Math.abs(x.maxDetour - y.maxDetour) > 1e-9) return x.maxDetour - y.maxDetour;
    return list.indexOf(x) - list.indexOf(y);
  })[0];
}

function maxRouteDetourForStops(stops: EngineStop[], byId: Map<string, CandidatePlace>): number {
  const pointsByDay = new Map<number, Array<{ latitude: number; longitude: number }>>();
  for (const s of stops) {
    const p = byId.get(s.placeId);
    if (!p) continue;
    let arr = pointsByDay.get(s.dayNumber);
    if (!arr) { arr = []; pointsByDay.set(s.dayNumber, arr); }
    arr.push({ latitude: p.latitude, longitude: p.longitude });
  }
  let max = 1;
  for (const pts of pointsByDay.values()) {
    max = Math.max(max, routeDetourIndex(pts));
  }
  return max;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function generateItineraryPlan(params: EngineParams): Promise<EngineResult> {

  const warnings: string[] = [];
  const paceConfig = PACE_CONFIG[params.pace] || PACE_CONFIG.BALANCED;
  const totalSlotsWanted = params.days * paceConfig.stopsPerDay;
  const destination = canonicalizeDestination(params.destination) || params.destination.trim();
  const radiusKm = maxRadiusKm(destination);

  const resolution = await resolveDestinationCentroid(destination);
  let centroid = { lat: resolution.lat, lng: resolution.lng };
  let centroidTrusted = resolution.resolved;

  const initialPinnedIds = Array.from(new Set(params.manualPlaceIds || []));
  const promptPinnedIds = await resolvePromptMentionedPlaces(
    params.prompt,
    destination,
    centroid,
    new Set(initialPinnedIds),
  );
  const allPinnedIds = Array.from(new Set([...initialPinnedIds, ...promptPinnedIds]));

  const pinnedPlaces = allPinnedIds.length
    ? await prisma.place.findMany({
        where: { id: { in: allPinnedIds }, latitude: { not: null }, longitude: { not: null } },
        select: PLACE_SELECT,
      })
    : [];

  // Prefer destination centroid over pin centroid so a single far pin cannot pull
  // the whole trip into the wrong city. Fall back to pins only if destination unresolved.
  if (!centroidTrusted && pinnedPlaces.length > 0) {
    centroid = {
      lat: pinnedPlaces.reduce((s, p) => s + (p.latitude || 0), 0) / pinnedPlaces.length,
      lng: pinnedPlaces.reduce((s, p) => s + (p.longitude || 0), 0) / pinnedPlaces.length,
    };
    centroidTrusted = true;
  }

  if (promptPinnedIds.length > 0) {
    warnings.push(`Included ${promptPinnedIds.length} place(s) you mentioned in your prompt.`);
  }

  const pinnedIds = new Set([
    ...pinnedPlaces.map((p) => p.id),
    ...(params.excludePlaceIds || []),
  ]);
  const wantsHiddenGems = params.interests.some((i) => i.toLowerCase().includes('hidden'));
  const avoidCrowded = params.avoid.includes('CROWDED');

  // Text/name matches can live far away — always keep the itinerary geographically
  // coherent around a trusted destination centroid.
  const rawCandidatesUnfiltered = await collectCandidates(destination, centroid, pinnedIds, centroidTrusted);
  const rawCandidates = centroidTrusted
    ? rawCandidatesUnfiltered.filter(
        (p) => p.latitude != null && p.longitude != null
          && haversineKm(centroid.lat, centroid.lng, p.latitude, p.longitude) <= radiusKm
          && (placeBelongsToDestination(p, destination)
            || rawCandidatesUnfiltered.filter((x) => placeBelongsToDestination(x, destination)).length < 4),
      )
    : rawCandidatesUnfiltered.filter((p) => placeBelongsToDestination(p, destination));

  const pinnedLocationKeys = pinnedPlaces
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .map((p) => ({ key: normalizePlaceName(p.name), lat: p.latitude as number, lng: p.longitude as number }));
  const isDuplicateOfPinned = (p: { name: string; latitude: number | null; longitude: number | null }): boolean => {
    if (p.latitude === null || p.longitude === null) return false;
    const key = normalizePlaceName(p.name);
    return pinnedLocationKeys.some((pl) => pl.key === key && haversineKm(pl.lat, pl.lng, p.latitude as number, p.longitude as number) < 0.3);
  };

  const scoredCandidates: CandidatePlace[] = rawCandidates
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .filter((p) => !isDuplicateOfPinned(p))
    .filter((p) => passesHardFilters(p, params))
    .map((p) => ({
      ...p,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      score: scoreCandidate(
        p as any,
        centroid,
        params.interests,
        wantsHiddenGems,
        avoidCrowded,
        destination,
        radiusKm,
      ),
      isPinned: false,
    }))
    .sort((a, b) => {
      const priorityDiff = (b.editorialPriority ?? 3) - (a.editorialPriority ?? 3);
      if (priorityDiff !== 0) return priorityDiff;
      return b.score - a.score;
    });

  // Hand-picked places (checkbox selection) become the itinerary by default.
  // Only fill remaining day slots with AI extras when the user opted in.
  const useSelectedOnly = pinnedPlaces.length > 0 && !params.fillWithAi;
  // Preferred quality is minAllowedTier; absoluteMin opens the pool for multi-day
  // fallback after higher tiers are exhausted (cluster still prefers geography).
  const preferredMin = minAllowedTier(params.days);
  const poolFloor = absoluteMinTier(params.days);

  // P1: "Make this trip cheaper" / LOW budget — bias ranking toward cheaper
  // places so cost intent actually changes which stops are chosen.
  if (params.budgetTier === 'LOW') {
    for (const c of scoredCandidates) {
      const fee = parseEntryFee(c.ticketPrice) ?? 0;
      if (fee > 0) c.score -= Math.min(1, fee / 300) * 0.25;
    }
    scoredCandidates.sort((a, b) => {
      const priorityDiff = (b.editorialPriority ?? 3) - (a.editorialPriority ?? 3);
      if (priorityDiff !== 0) return priorityDiff;
      return b.score - a.score;
    });
  }

  // P1: interests must materially shape the pool, not just decorate reasons.
  const interestGate = applyInterestGate(
    scoredCandidates,
    params.interests,
    params.days * paceConfig.stopsPerDay,
  );
  if (interestGate.gated) {
    logger.info(
      { destination, gatedOut: interestGate.gatedOutCount, kept: interestGate.pool.length },
      'Interest gate narrowed candidate pool',
    );
  }
  const interestRanked = interestGate.pool;
  // When the gate has enough matched supply, unmatched places are excluded from
  // CLUSTERING entirely (pins excepted) so interests decide where days go —
  // not just the order inside a geography-dominated packer.
  const clusterInterestFilter: Set<string> | null = interestGate.gated ? interestGate.matchedIds : null;

  const tierEligible = interestRanked.filter((p) => priorityTier({
    id: p.id,
    name: p.name,
    category: p.category,
    latitude: p.latitude,
    longitude: p.longitude,
    rating: p.rating,
    editorialPriority: p.editorialPriority ?? 3,
    estimatedDurationMinutes: p.estimatedDurationMinutes,
    recommendedDuration: p.recommendedDuration,
    isPinned: false,
    score: p.score,
  }) >= poolFloor);

  // Soft pool cap — cluster planner decides inclusion; do not pre-commit top-N by rating alone.
  const poolCap = Math.max(totalSlotsWanted * 4, params.days * 12, 40);
  const slotsForAi = useSelectedOnly ? 0 : poolCap;
  // Prefer higher-tier rows first so the soft cap does not drop 5★ for junk.
  const preferredEligible = tierEligible.filter((p) => priorityTier({
    id: p.id,
    name: p.name,
    category: p.category,
    latitude: p.latitude,
    longitude: p.longitude,
    rating: p.rating,
    editorialPriority: p.editorialPriority ?? 3,
    estimatedDurationMinutes: p.estimatedDurationMinutes,
    recommendedDuration: p.recommendedDuration,
    isPinned: false,
    score: p.score,
  }) >= preferredMin);
  const rankedForCap = [
    ...preferredEligible,
    ...tierEligible.filter((p) => !preferredEligible.some((x) => x.id === p.id)),
  ];
  const chosenAi = (rankedForCap.length >= Math.min(params.days * 2, 4) ? rankedForCap : interestRanked)
    .slice(0, slotsForAi);

  if (pinnedPlaces.length === 0 && chosenAi.length === 0) {
    const nearby = centroidTrusted
      ? await findNearbyDestinations(destination, centroid)
      : [];
    if (nearby.length > 0) {
      const names = nearby.slice(0, 3).map((n) => `${n.city}${n.state ? `, ${n.state}` : ''} (${n.placeCount} places)`).join('; ');
      warnings.push(
        centroidTrusted
          ? `No approved places were found for "${params.destination}". Try nearby: ${names}.`
          : `We don't have places for "${params.destination}" yet. Try a nearby major city or a different destination.`,
      );
    } else {
      warnings.push(
        centroidTrusted
          ? `No approved places were found for "${params.destination}". Try a nearby city or broaden your interests.`
          : `We don't have places for "${params.destination}" yet. Try a nearby major city or a different destination.`,
      );
    }
  } else if (!useSelectedOnly && chosenAi.length < Math.min(totalSlotsWanted, 4)) {
    warnings.push(`Only ${pinnedPlaces.length + chosenAi.length} suitable places were found near "${params.destination}"; the itinerary may have fewer stops than requested.`);
  }

  const allChosen: CandidatePlace[] = [
    ...pinnedPlaces.map((p) => ({
      ...p,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      score: Number.POSITIVE_INFINITY,
      isPinned: true,
    })),
    ...chosenAi,
  ];

  const transportSpeed = averageSpeedKmh(params.transportation);

  // ---- P0 budget context ----
  const budgetCap = params.customBudgetAmount != null && params.customBudgetAmount > 0
    ? params.customBudgetAmount
    : null;
  const travelerCount = resolveTravelerCount(params.travelers);
  const compactBonus = compactBonusAllowedForPace(params.pace);
  const seedBase = params.variationSeed ?? 0;
  /** Place ids excluded across attempts while trimming toward the budget cap. */
  const budgetExcludedIds = new Set<string>(params.excludePlaceIds ?? []);
  /** Places whose ticket basis is UNKNOWN — excluded from the numeric budget. */
  const unknownFeeNames = new Set<string>();
  interface Attempt extends AttemptOutcome { attemptIndex: number }
  const attempts: Attempt[] = [];

  // Deterministic multi-attempt assembly:
  //  - over budget? drop the costliest non-pinned paid stop and rebuild
  //  - degraded route? the next attempt's internal seed varies zone anchoring
  // The best attempt wins; nothing here changes the planning pipeline itself.
  for (let attemptIdx = 0; attemptIdx < 4; attemptIdx++) {
    const attemptWarnings: string[] = [];

    const clusterPool: ClusterPlace[] = allChosen
      .filter((p) => !budgetExcludedIds.has(p.id))
      .filter((p) => !clusterInterestFilter || p.isPinned || clusterInterestFilter.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        latitude: p.latitude,
        longitude: p.longitude,
        rating: p.rating,
        editorialPriority: p.editorialPriority ?? 3,
        estimatedDurationMinutes: p.estimatedDurationMinutes,
        recommendedDuration: p.recommendedDuration,
        isPinned: p.isPinned,
        score: p.score,
      }));

    const attemptSeed = attemptIdx === 0
      ? seedBase
      : (seedBase + attemptIdx * 101 + budgetExcludedIds.size * 37) % 10001;

    // Cluster-value day assignment: best geographic experience per day,
    // not angular round-robin / highest-rating-first.
    const planningDays = params.regenerateDayNumber ? 1 : params.days;
    const { days: clusteredDays, plannedDays } = assignDaysByClusterValue(clusterPool, {
      days: planningDays,
      maxStopsPerDay: paceConfig.stopsPerDay,
      maxMinutesPerDay: paceConfig.maxMinutesPerDay,
      origin: params.startLocation
        ? { lat: params.startLocation.latitude, lng: params.startLocation.longitude }
        : centroid,
      hotelBaseByDay: params.hotelBaseByDay,
      speedKmh: transportSpeed,
      allowCompactBonus: compactBonus,
      debug: process.env.ITINERARY_CLUSTER_DEBUG === 'true',
      variationSeed: attemptSeed as number | undefined,
      avoidHubIds: params.avoidHubIds,
    });
    const byId = new Map(allChosen.map((p) => [p.id, p]));
    const regenDay = params.regenerateDayNumber;
  const dayBuckets: CandidatePlace[][] = Array.from({ length: params.days }, (_, i) => {
    const day = clusteredDays[i] || [];
    return day.map((c) => byId.get(c.id)).filter((p): p is CandidatePlace => !!p);
  });
  const plannedByDay = new Map(
    plannedDays.map((pd) => [regenDay || pd.dayNumber, pd]),
  );

  const dayInfo: EngineDayInfo[] = [];
  const stops: EngineStop[] = [];
  let totalDistanceKm = 0;
  let totalEntryFees = 0;

  for (let dayIdx = 0; dayIdx < params.days; dayIdx++) {
    const dayNumber = dayIdx + 1;
    if (regenDay && dayNumber !== regenDay) {
      continue;
    }
    const ordered = regenDay ? (dayBuckets[0] || []) : dayBuckets[dayIdx];
    if (!ordered.length) {
      dayInfo.push({ dayNumber, theme: 'Free day / rest day', foodStops: [], nearbyVendors: [] });
      continue;
    }

    const slotSequence = slotOrderForPreference(params.timePreference);
    let currentOrder = 0;
    // Sequential clock cursor — never assign times from independent slot buckets.
    let currentClock = SLOT_BASE_MINUTES[slotSequence[0]];
    // Honor a requested earliest start ("start after 10 AM") without ever
    // pulling the clock earlier than the preference's natural base.
    if (params.earliestStartMinutes != null && Number.isFinite(params.earliestStartMinutes)) {
      const clamped = Math.max(5 * 60, Math.min(18 * 60, Math.round(params.earliestStartMinutes)));
      currentClock = Math.max(currentClock, clamped);
    }
    let prevPlace: CandidatePlace | null = null;
    const dayDate = params.startDate ? new Date(params.startDate.getTime() + dayIdx * 86400000) : null;

    for (const place of ordered) {
      // Keep every stop the zone planner already chose. Dropping unpinned
      // leftovers here is what collapsed Bhedaghat days to two 90-minute
      // waterfalls even after the cluster was packed.
      const duration = estimateDurationMinutes(place);

      let distanceFromPrev: number | null = null;
      let travelMinutes: number;
      if (prevPlace) {
        distanceFromPrev = haversineKm(prevPlace.latitude, prevPlace.longitude, place.latitude, place.longitude);
        if (params.avoid.includes('LONG_TRAVEL') && distanceFromPrev > 25 && !place.isPinned) {
          continue;
        }
        travelMinutes = Math.max(5, Math.round((distanceFromPrev / transportSpeed) * 60));
        totalDistanceKm += distanceFromPrev;
      } else {
        travelMinutes = 10; // buffer from day start / hotel
      }

      // Arrive after finishing previous stop + travel; never jump backward to a slot base.
      let startMinutes = currentClock + travelMinutes;

      const openState = isPlaceOpenAt(place.openingHours, dayDate, startMinutes % 1440);
      if (openState === false) {
        // 1) If reliable hours show a later opening today within a reasonable
        //    wait, shift the visit forward instead of dropping it.
        const opensAt = nextOpenMinuteAt(place.openingHours, dayDate, startMinutes);
        if (opensAt != null && opensAt - startMinutes <= 120) {
          startMinutes = Math.max(startMinutes, opensAt);
        } else {
          // 2) Fall back to pushing to a later preferred slot base.
          const laterSlot = slotSequence.find((s) => SLOT_BASE_MINUTES[s] >= startMinutes);
          const pushed = laterSlot ? Math.max(startMinutes, SLOT_BASE_MINUTES[laterSlot]) : null;
          const stillClosed = pushed == null
            || isPlaceOpenAt(place.openingHours, dayDate, (pushed + duration / 2) % 1440) === false;
          if (pushed != null && !stillClosed) {
            startMinutes = pushed;
          } else if (!place.isPinned) {
            // 3) Confirmed-closed and unshiftable: reject the stop outright.
            attemptWarnings.push(`${place.name} is closed at its scheduled time, so it was left out of this day.`);
            continue;
          } else {
            attemptWarnings.push(`${place.name} may be closed at its scheduled time; kept because you pinned it — please double-check hours.`);
          }
        }
      }

      const endMinutes = startMinutes + duration;
      const slot = minutesToTimeSlot(startMinutes);
      // Stop.entryFee keeps the per-person display price; the BUDGET uses the
      // basis-aware party cost (per-vehicle/group charged once, UNKNOWN excluded).
      const entryFee = parseEntryFee(place.ticketPrice);
      const entryCost = resolveEntryCost(place.ticketPrice, travelerCount);
      if (entryCost.unknownFee && entryFee && place.name) unknownFeeNames.add(place.name);
      totalEntryFees += entryCost.amount;

      const planned = plannedByDay.get(dayNumber);
      const isRegionAnchor = planned?.regionAnchorId === place.id;
      const baseReason = buildReason(place, params.interests, distanceFromPrev);
      const journeyReason = isRegionAnchor
        ? `Regional anchor for day ${dayNumber}`
        : currentOrder === 0
          ? `Day start near ${planned?.dayStart.label || 'origin'}`
          : distanceFromPrev != null && distanceFromPrev <= 12
            ? `Nearby in the same region (${distanceFromPrev.toFixed(1)} km)`
            : null;
      const reason = journeyReason
        ? `${journeyReason}. ${baseReason}`
        : baseReason;

      stops.push({
        placeId: place.id,
        name: place.name,
        category: place.category,
        dayNumber,
        order: currentOrder,
        timeSlot: slot,
        startTime: minutesToTimeStr(startMinutes),
        endTime: minutesToTimeStr(endMinutes),
        duration,
        entryFee,
        cost: entryFee,
        distanceFromPrev,
        reason,
        isPinned: place.isPinned,
      });

      currentClock = endMinutes;
      currentOrder++;
      prevPlace = place;
    }

    const theme = buildDayTheme(params.destination, ordered);

    // Skip live food/vendor DB lookups during generation — they added multi-second
    // latency per day on cold Render Postgres and aren't required for the itinerary.
    dayInfo.push({ dayNumber, theme, foodStops: [], nearbyVendors: [] });
  }

    // ---- P0: traveler-multiplied cost model + budget constraint ----
    // Entry fees in ticketPrice are per-person; transport is per vehicle.
    const groupEntryFees = totalEntryFees * travelerCount;
    const attemptEstimatedBudget = Math.round(groupEntryFees + totalDistanceKm * TRANSPORT_COST_PER_KM);
    const attemptMaxDetour = maxRouteDetourForStops(stops, byId);
    const attemptOverBudget = budgetCap ? Math.max(0, attemptEstimatedBudget - budgetCap) : 0;

    attempts.push({
      result: {
        dayInfo,
        stops,
        estimatedBudget: attemptEstimatedBudget,
        totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
        note: '',
        warnings: [...warnings, ...attemptWarnings],
      },
      maxDetour: attemptMaxDetour,
      overBudgetBy: attemptOverBudget,
      attemptIndex: attemptIdx,
    });

    if (attemptOverBudget > 0) {
      // Deterministic optimization toward the cap: rebuild without the single
      // costliest non-pinned paid stop before ever admitting defeat.
      const removable = stops.filter((s) => (s.entryFee ?? 0) > 0 && !s.isPinned && !budgetExcludedIds.has(s.placeId));
      if (removable.length > 0) {
        const costliest = removable.reduce((a, b) => ((b.entryFee ?? 0) > (a.entryFee ?? 0) ? b : a));
        budgetExcludedIds.add(costliest.placeId);
        continue;
      }
    }

    // P2 regeneration guard: a clearly degraded route is not shipped when a
    // deterministic re-anchor can do better. Variation stays; bad geometry goes.
    if (attemptMaxDetour > MAX_ACCEPTABLE_DAY_DETOUR && attemptIdx < 3) {
      continue;
    }
    break;
  }

  // ---- Winner selection + honest over-budget reporting ----
  const best = selectBestAttempt(attempts, budgetCap);
  const finalWarnings = best ? [...best.result.warnings] : [...warnings];
  if (unknownFeeNames.size > 0) {
    finalWarnings.push(
      `Ticket type at ${[...unknownFeeNames].slice(0, 3).join(', ')}${unknownFeeNames.size > 3 ? ' and others' : ''} could not be confirmed as per-person or per-vehicle, so those tickets are not included in the budget estimate.`,
    );
  }
  if (budgetCap && best && best.overBudgetBy > 0) {
    finalWarnings.unshift(
      `This itinerary costs about ₹${best.result.estimatedBudget} for ${travelerCount} traveler${travelerCount > 1 ? 's' : ''}, which exceeds your ₹${budgetCap} budget even after swapping in lower-cost stops.`,
    );
  }

  const result: EngineResult = best
    ? { ...best.result, warnings: finalWarnings }
    : {
        dayInfo: [],
        stops: [],
        estimatedBudget: 0,
        totalDistanceKm: 0,
        note: '',
        warnings: finalWarnings,
      };
  result.note = finalWarnings[0]
    || `${result.stops.length} stops across ${params.days} day${params.days > 1 ? 's' : ''}, optimized for a ${params.pace.toLowerCase().replace('_', ' ')} pace.`;

  let nearbyDestinations: NearbyDestinationSuggestion[] | undefined;
  if (result.stops.length === 0 && centroidTrusted) {
    nearbyDestinations = await findNearbyDestinations(destination, centroid);
    result.nearbyDestinations = nearbyDestinations;
  }


  // Gemini polish is opt-in — it adds latency and can trip Render's request limits.
  if (env.geminiApiKey && process.env.ENABLE_GEMINI_ITINERARY_POLISH === 'true') {
    const startedAt = Date.now();
    try {
      const polished = await polishWithGemini(result, params);
      logger.info(
        { durationMs: Date.now() - startedAt, stops: result.stops.length, days: result.dayInfo.length },
        'Gemini itinerary polish applied',
      );
      return polished;
    } catch (err) {
      logger.warn(
        { err, durationMs: Date.now() - startedAt },
        'Gemini itinerary polish failed — using deterministic text',
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Optional Gemini text polish (best-effort; never blocks generation)
// ---------------------------------------------------------------------------

const POLISHED_THEME_MAX_CHARS = 80;
const POLISHED_REASON_MAX_CHARS = 160;

function sanitizePolishedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  // Collapse whitespace/newlines; reject rewrites that ignore the length cap
  // so deterministic copy is kept instead of a truncated or rambling one.
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > maxChars) return null;
  return cleaned;
}

async function polishWithGemini(result: EngineResult, params: EngineParams): Promise<EngineResult> {
  const apiKey = env.geminiApiKey;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const context = {
    destination: params.destination,
    days: result.dayInfo.map((d) => ({
      dayNumber: d.dayNumber,
      theme: d.theme,
      stops: result.stops.filter((s) => s.dayNumber === d.dayNumber).map((s) => ({ name: s.name, category: s.category, reason: s.reason })),
    })),
  };

  const prompt = `Rewrite the "theme" for each day and the "reason" for each stop below to be more engaging. Rules:
- Theme: one line, at most 10 words.
- Reason: one sentence, at most 22 words.
- Do NOT change any place names, add new places, mention weather, or change facts (distance/fees/times).
Return ONLY JSON matching:
{ "days": [{ "dayNumber": number, "theme": string, "stops": [{ "name": string, "reason": string }] }] }

Data: ${JSON.stringify(context)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return result;

    const json: any = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const polished = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

    const polishedDayThemes = new Map<number, string>();
    const polishedReasons = new Map<string, string>();
    for (const day of polished.days || []) {
      const theme = sanitizePolishedText(day?.theme, POLISHED_THEME_MAX_CHARS);
      if (typeof day?.dayNumber === 'number' && theme) {
        polishedDayThemes.set(day.dayNumber, theme);
      }
      for (const stop of day?.stops || []) {
        const reason = sanitizePolishedText(stop?.reason, POLISHED_REASON_MAX_CHARS);
        if (typeof stop?.name === 'string' && reason) {
          polishedReasons.set(`${day.dayNumber}:${stop.name}`, reason);
        }
      }
    }

    return {
      ...result,
      dayInfo: result.dayInfo.map((d) => ({ ...d, theme: polishedDayThemes.get(d.dayNumber) || d.theme })),
      stops: result.stops.map((s) => ({ ...s, reason: polishedReasons.get(`${s.dayNumber}:${s.name}`) || s.reason })),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
