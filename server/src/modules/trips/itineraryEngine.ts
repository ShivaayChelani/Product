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
  nature: ['waterfall', 'lake', 'park', 'wildlife', 'garden', 'hill', 'valley'],
  food: ['market', 'restaurant', 'street food', 'cafe'],
  adventure: ['waterfall', 'park', 'trek', 'trekking', 'wildlife', 'adventure'],
  shopping: ['market', 'shopping', 'bazaar'],
  'hidden gems': [],
  hidden_gems: [],
  'local culture': ['museum', 'market', 'monument', 'palace', 'ghat'],
  local_culture: ['museum', 'market', 'monument', 'palace', 'ghat'],
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

/**
 * Best-effort, schema-tolerant opening-hours check. Returns:
 *   true  -> confirmed open at this time
 *   false -> confirmed closed at this time
 *   null  -> unknown/unparseable (caller must never block on this)
 */
export function isPlaceOpenAt(openingHours: unknown, date: Date | null, minutesOfDay: number): boolean | null {
  if (!openingHours || typeof openingHours !== 'object') return null;
  const hours = openingHours as Record<string, string>;

  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = date ? weekdayNames[date.getDay()] : null;

  const raw = (dayKey && hours[dayKey]) || hours.daily || hours.all || null;
  if (!raw || typeof raw !== 'string') return null;

  if (/closed/i.test(raw)) return false;
  if (/24\s*hours|open all day|all day/i.test(raw)) return true;

  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  const toMinutes = (h: string, m: string | undefined, meridiem: string | undefined, fallbackMeridiem?: string): number | null => {
    let hour = parseInt(h, 10);
    const minute = m ? parseInt(m, 10) : 0;
    const mer = (meridiem || fallbackMeridiem || '').toLowerCase();
    if (Number.isNaN(hour)) return null;
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
  };

  const [, oh, om, oMer, ch, cm, cMer] = match;
  const openMin = toMinutes(oh, om, oMer, cMer);
  let closeMin = toMinutes(ch, cm, cMer, oMer);
  if (openMin === null || closeMin === null) return null;
  if (closeMin <= openMin) closeMin += 24 * 60;

  const t = minutesOfDay < openMin && (minutesOfDay + 24 * 60) <= closeMin ? minutesOfDay + 24 * 60 : minutesOfDay;
  return t >= openMin && t <= closeMin;
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
  rating: true, popularityScore: true, hiddenGemScore: true, editorialPriority: true,
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
    const keywords = INTEREST_CATEGORY_MAP[interest.toLowerCase()] || [];
    if (keywords.some((k) => cat.includes(k) || tags.some((t) => t.includes(k)))) return true;
    if (tags.includes(interest.toLowerCase())) return true;
  }
  return false;
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

  if (params.avoid.includes('NON_FAMILY_FRIENDLY') && (params.travelers === 'FAMILY' || params.travelers === 'family')) {
    if (NON_FAMILY_FRIENDLY_KEYWORDS.some((k) => cat.includes(k) || tags.some((t) => t.includes(k)))) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Reason / theme text generation (deterministic — always available)
// ---------------------------------------------------------------------------

function buildReason(place: CandidatePlace, interests: string[], distanceFromPrevKm: number | null): string {
  const matchedInterest = interests.find((interest) => {
    const keywords = INTEREST_CATEGORY_MAP[interest.toLowerCase()] || [];
    return keywords.some((k) => place.category.toLowerCase().includes(k) || place.tags.some((t) => t.toLowerCase().includes(k)));
  });

  const parts: string[] = [];
  if (place.rating && place.rating >= 4) parts.push(`Highly rated ${place.category}`);
  else parts.push(`Popular ${place.category}`);
  if (matchedInterest) parts.push(`matches your interest in ${matchedInterest}`);
  if (place.hiddenGemScore && place.hiddenGemScore > 60) parts.push('a hidden gem worth discovering');
  if (distanceFromPrevKm !== null) parts.push(`${distanceFromPrevKm.toFixed(1)}km from your previous stop`);

  return parts.join(', ') + '.';
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
  const tierEligible = scoredCandidates.filter((p) => priorityTier({
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
  const chosenAi = (rankedForCap.length >= Math.min(params.days * 2, 4) ? rankedForCap : scoredCandidates)
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

  // Cluster-value day assignment: best geographic experience per day,
  // not angular round-robin / highest-rating-first.
  const clusterPool: ClusterPlace[] = allChosen.map((p) => ({
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
    debug: process.env.ITINERARY_CLUSTER_DEBUG === 'true',
    variationSeed: params.variationSeed,
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
        // Push forward to the next preferred slot base that is still after arrival —
        // do not rewind the day clock into an earlier overlapping window.
        const laterSlot = slotSequence.find((s) => SLOT_BASE_MINUTES[s] >= startMinutes);
        if (laterSlot) {
          startMinutes = Math.max(startMinutes, SLOT_BASE_MINUTES[laterSlot]);
        } else {
          warnings.push(`${place.name} may be closed at its scheduled time; kept in the plan but please double-check hours.`);
        }
      }

      const endMinutes = startMinutes + duration;
      const slot = minutesToTimeSlot(startMinutes);
      const entryFee = parseEntryFee(place.ticketPrice);
      if (entryFee) totalEntryFees += entryFee;

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

  const estimatedBudget = Math.round(totalEntryFees + totalDistanceKm * TRANSPORT_COST_PER_KM);

  const note = warnings.length > 0
    ? warnings[0]
    : `${stops.length} stops across ${params.days} day${params.days > 1 ? 's' : ''}, optimized for a ${params.pace.toLowerCase().replace('_', ' ')} pace.`;

  let nearbyDestinations: NearbyDestinationSuggestion[] | undefined;
  if (stops.length === 0 && centroidTrusted) {
    nearbyDestinations = await findNearbyDestinations(destination, centroid);
  }

  const result: EngineResult = {
    dayInfo,
    stops,
    estimatedBudget,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    note,
    warnings,
    nearbyDestinations,
  };


  // Gemini polish is opt-in — it adds latency and can trip Render's request limits.
  if (env.geminiApiKey && process.env.ENABLE_GEMINI_ITINERARY_POLISH === 'true') {
    try {
      return await polishWithGemini(result, params);
    } catch (err) {
      console.warn('[itineraryEngine] Gemini polish failed, using deterministic text:', err);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Optional Gemini text polish (best-effort; never blocks generation)
// ---------------------------------------------------------------------------

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

  const prompt = `Rewrite the "theme" for each day and the "reason" for each stop below to be more engaging, in 1 short sentence each. Do NOT change any place, add new places, or change facts (distance/fees). Return ONLY JSON matching:
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
      if (typeof day.dayNumber === 'number' && typeof day.theme === 'string') {
        polishedDayThemes.set(day.dayNumber, day.theme);
      }
      for (const stop of day.stops || []) {
        if (typeof stop.name === 'string' && typeof stop.reason === 'string') {
          polishedReasons.set(`${day.dayNumber}:${stop.name}`, stop.reason);
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
