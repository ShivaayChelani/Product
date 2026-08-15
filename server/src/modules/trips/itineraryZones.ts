/**
 * Zone-based itinerary planner core (pure, DB-free).
 *
 * Traveler model this encodes:
 *   "Jab main kisi area me pahunchta hoon, main us area ka SAB KUCH dekhta hoon,
 *    phir agle area jaata hoon."
 *
 * A ZONE is one real sightseeing area — the set of attractions a local would
 * describe with a single name ("Bhedaghat side", "Gwarighat side", "city ke
 * andar"). Zones are built around their strongest hub with a tight radius, so a
 * zone can never chain-grow across a city.
 *
 * The planner then:
 *   1. picks the best zone for the day (value vs travel from the day start),
 *   2. EXHAUSTS that zone before considering anything farther,
 *   3. only after the zone is finished, tops the day up from an immediately
 *      adjacent zone (short bounded hop),
 *   4. orders stops as a real driving route from the day start, so nearby
 *      places are visited together and "on the way" places come first.
 *
 * Distance is a first-class constraint here, not a tiebreaker. Rating decides
 * WHICH zone is worth a day; geography decides what happens inside the day.
 *
 * Debug: ITINERARY_CLUSTER_DEBUG=true
 */

import { haversineDistance } from '../../shared/utils/geo';

// ---------------------------------------------------------------------------
// Shared place model + primitives
// ---------------------------------------------------------------------------

export interface ClusterPlace {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  editorialPriority: number;
  estimatedDurationMinutes?: number | null;
  recommendedDuration?: string | null;
  isPinned: boolean;
  /** Soft score from interest/popularity filters — never overrides zone geography. */
  score?: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineDistance(lat1, lng1, lat2, lng2) / 1000;
}

export function distanceBetween(a: ClusterPlace, b: ClusterPlace): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

export function distanceFromPoint(p: LatLng, place: ClusterPlace): number {
  return haversineKm(p.lat, p.lng, place.latitude, place.longitude);
}

/** Travel time estimate including a fixed parking/walk-in buffer. */
export function estimateTravelMinutes(distKm: number, speedKmh: number): number {
  const speed = Math.max(4, speedKmh);
  return Math.round((distKm / speed) * 60) + 10;
}

export function categoryOf(p: ClusterPlace): string {
  return (p.category || 'default').toLowerCase();
}

/**
 * Realistic time actually spent at a kind of place. These are deliberately
 * closer to how long a visit takes than to how long it could take — an inflated
 * catalog duration silently pushes real nearby attractions out of the day.
 *
 * Catalog `estimatedDurationMinutes` is used when present, but capped to a
 * sightseeing slice so one waterfall cannot eat half a relaxed day.
 */
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

export function visitMinutes(p: ClusterPlace): number {
  const cat = categoryOf(p);
  const categoryDefault = CATEGORY_DURATION[cat] ?? CATEGORY_DURATION.default;
  let raw = categoryDefault;
  if (p.estimatedDurationMinutes && p.estimatedDurationMinutes > 0) {
    raw = p.estimatedDurationMinutes;
  } else if (p.recommendedDuration) {
    const match = p.recommendedDuration.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const num = parseFloat(match[1]);
      const isHours = /hour|hr/i.test(p.recommendedDuration);
      if (!Number.isNaN(num) && num > 0) {
        raw = Math.round(isHours ? num * 60 : num);
      }
    }
  }
  if (UNCAP_VISIT_CATEGORIES.has(cat)) return raw;
  return Math.min(raw, MAX_SIGHTSEEING_SLICE_MINUTES);
}

// ---------------------------------------------------------------------------
// Place value + quality tiers
// ---------------------------------------------------------------------------

/**
 * Tourist importance — rating driven, distance free.
 * Kept identical to the historical formula so tier thresholds stay stable.
 */
export function importanceScore(p: ClusterPlace): number {
  const rating = p.rating ?? 0;
  const mustVisit = p.isPinned || (p.editorialPriority ?? 0) >= 5 ? 2 : 0;
  const editorialBoost = Math.max(0, (p.editorialPriority ?? 3) - 3) * 2;
  return rating * 10 + mustVisit * 5 + editorialBoost;
}

export function priorityTier(p: ClusterPlace): number {
  if (p.isPinned || (p.editorialPriority ?? 0) >= 5) return 5;
  if (p.rating == null) return unratedTier(p);
  const imp = importanceScore(p);
  if (imp >= 45) return 5;
  if (imp >= 35) return 4;
  if (imp >= 25) return 3;
  if (imp >= 15) return 2;
  return 1;
}

/**
 * Most OSM/Wikidata imports carry no rating at all. Scoring those as 0★ would
 * bury genuine landmarks (Balancing Rock, a riverside ghat) under any place that
 * happens to have a stray review, so they are placed by curation and by what
 * kind of place they are instead.
 */
function unratedTier(p: ClusterPlace): number {
  const editorial = p.editorialPriority ?? 3;
  if (editorial >= 4) return 4;
  const appeal = CATEGORY_APPEAL[categoryOf(p)] ?? CATEGORY_APPEAL.default;
  if (editorial <= 2) return appeal >= 6 ? 2 : 1;
  return appeal >= 6 ? 3 : 2;
}

export function isAnchorCandidate(p: ClusterPlace): boolean {
  return priorityTier(p) >= 5;
}

/**
 * How interesting a category is on its own, used so that unrated-but-notable
 * places (OSM imports with no rating) still rank above an unnamed city park.
 */
const CATEGORY_APPEAL: Record<string, number> = {
  waterfall: 10,
  wildlife: 9,
  fort: 9,
  palace: 9,
  beach: 9,
  heritage: 7,
  ghat: 7,
  trek: 7,
  adventure: 7,
  temple: 6,
  religious: 6,
  gurudwara: 6,
  spiritual: 6,
  church: 5,
  mosque: 5,
  museum: 6,
  monument: 6,
  lake: 6,
  viewpoint: 6,
  nature: 6,
  cultural: 5,
  market: 5,
  garden: 3,
  park: 2,
  default: 4,
};

/** Places that are best experienced late in the day (aarti, sunset, lights). */
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

export function eveningAffinity(p: ClusterPlace): number {
  return EVENING_AFFINITY[categoryOf(p)] ?? 0;
}

/** Base worth of each ★ tier, so a must-visit with no rating still ranks high. */
const TIER_VALUE = [0, 6, 14, 26, 40, 58];

/**
 * Total draw of a place.
 *
 * Tier first (a curated must-visit outranks a 2★ with a stray rating), then the
 * rating as a fine-grained tiebreak, then intrinsic category appeal. Used for
 * every "is this worth a stop / worth a day" decision.
 */
export function experienceValue(p: ClusterPlace): number {
  const tier = priorityTier(p);
  const appeal = CATEGORY_APPEAL[categoryOf(p)] ?? CATEGORY_APPEAL.default;
  return TIER_VALUE[tier] + (p.rating ?? 0) * 4 + appeal;
}

/** Preferred quality floor for a trip length (tried first, then relaxed). */
export function minAllowedTier(days: number): number {
  if (days <= 3) return 3;
  if (days <= 4) return 2;
  return 1;
}

/** Absolute floor once preferred tiers are exhausted. */
export function absoluteMinTier(days: number): number {
  if (days <= 1) return 3;
  return 1;
}

/** Floor used when packing a day. */
export function membershipMinTier(days: number): number {
  if (days === 1) return minAllowedTier(days);
  return absoluteMinTier(days);
}

/** Tightest floor that still leaves usable places in the pool. */
export function resolveActiveTierFloor(unused: ClusterPlace[], days: number): number {
  const preferred = minAllowedTier(days);
  const absolute = absoluteMinTier(days);
  for (let floor = preferred; floor >= absolute; floor--) {
    if (unused.some((p) => p.isPinned || priorityTier(p) >= floor)) return floor;
  }
  return absolute;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function clusterCenterOf(places: ClusterPlace[]): LatLng {
  const n = Math.max(1, places.length);
  return {
    lat: places.reduce((s, p) => s + p.latitude, 0) / n,
    lng: places.reduce((s, p) => s + p.longitude, 0) / n,
  };
}

/** Widest pairwise distance in a set (km). */
export function clusterDiameterKm(places: ClusterPlace[]): number {
  if (places.length <= 1) return 0;
  let max = 0;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const d = distanceBetween(places[i], places[j]);
      if (d > max) max = d;
    }
  }
  return max;
}

function nearestDistanceTo(p: ClusterPlace, set: ClusterPlace[]): number {
  let best = Infinity;
  for (const m of set) {
    const d = distanceBetween(m, p);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Zone construction
// ---------------------------------------------------------------------------

/** A place joins its hub's zone within this radius — one short drive. */
export const ZONE_HUB_RADIUS_KM = 5;
/**
 * Secondary join: a place adjacent to any existing member may still belong to
 * the same outing (e.g. a waterfall just outside the hub radius), but only if
 * the zone stays inside MAX_ZONE_DIAMETER_KM. Kept small because this is the
 * step that could otherwise chain A→B→C across a whole city.
 */
export const ZONE_JOIN_RADIUS_KM = 2.5;
/**
 * Hard cap on a zone's own span. One sightseeing area is something a traveler
 * covers without a real drive between stops — a few km end to end. Beyond this
 * the places belong to different outings even if a chain of stops connects them.
 */
export const MAX_ZONE_DIAMETER_KM = 6.5;

/** After a zone is exhausted, a leftover-time hop may reach this far. */
export const ADJACENT_FILL_MAX_KM = 6;
/**
 * A day that its own area could only fill with a stop or two may reach a little
 * further, because there is nothing closer left to do. Once the day already has
 * a proper set of stops, ADJACENT_FILL_MAX_KM applies and the day ends here.
 */
export const THIN_DAY_FILL_MAX_KM = 10;
/** A day with fewer than this many stops may pick up the nearest leftover
 *  high-priority place. Only a lonely 1-stop outing qualifies — a 2-stop area
 *  is already a real outing and must not raid tomorrow's neighbourhood. */
export const THIN_DAY_STOPS = 2;
/** Whole-day geographic span cap (excludes the approach from the day start). */
export const MAX_DAY_SPAN_KM = 22;
/** Leftover time needed before topping up from a neighbouring zone. */
export const MIN_FILL_MINUTES = 110;
/** Minimum draw for a leftover-time top-up stop — never drive for filler. */
export const MIN_FILL_VALUE = 38;
/**
 * Stops this close to one already chosen are effectively the same halt
 * (Dhuandhar / ropeway / marble-rocks viewpoint), so they may exceed the pace
 * stop count when there is time for them.
 */
export const NEAR_FREE_STOP_KM = 4;
/** How many such near-free stops a day may add beyond the pace limit. */
export const MAX_COMPACT_BONUS_STOPS = 2;
/**
 * Practically the same halt — a temple inside the fort you are already walking
 * through. Saving one of these for another day would send the traveler back to
 * the same spot, so the pace limit gives way whenever the clock allows.
 */
export const SAME_COMPLEX_KM = 1.5;
/** Quality floor for a lower-tier local top-up inside the chosen zone. */
export const LOCAL_TOPUP_MIN_TIER = 2;

export interface Zone {
  id: string;
  hub: ClusterPlace;
  places: ClusterPlace[];
  center: LatLng;
  diameterKm: number;
  /** Sum of experienceValue over all members — the zone's raw draw. */
  totalValue: number;
}

function byValueDesc(a: ClusterPlace, b: ClusterPlace): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return experienceValue(b) - experienceValue(a);
}

/** Radii that define how wide one area may be. */
export interface ZoneShape {
  hubRadiusKm: number;
  joinRadiusKm: number;
  maxDiameterKm: number;
}

export const DEFAULT_ZONE_SHAPE: ZoneShape = {
  hubRadiusKm: ZONE_HUB_RADIUS_KM,
  joinRadiusKm: ZONE_JOIN_RADIUS_KM,
  maxDiameterKm: MAX_ZONE_DIAMETER_KM,
};

/**
 * Walking-scale grouping used only when a SINGLE area is too big for one day
 * (a whole old city, not a compact outing like Bhedaghat).
 */
export const TIGHT_ZONE_SHAPE: ZoneShape = {
  hubRadiusKm: 2.5,
  joinRadiusKm: 1.2,
  maxDiameterKm: 3.5,
};

/**
 * Compact sightseeing clusters stay one area even on a long trip. Splitting
 * them would send the traveler back to Bhedaghat on day 3 for leftover temples.
 */
export const COMPACT_OUTING_DIAMETER_KM = 5.5;
/**
 * Compact outings get at least this much clock. A relaxed 240-minute pace plus
 * 90-minute catalog waterfalls otherwise collapses Bhedaghat to two lonely stops.
 */
export const COMPACT_COVERAGE_MINUTES = 450;
/** How many places one day can realistically cover before a zone is "overfull". */
export const ONE_DAY_PLACE_BUDGET = 5;

/**
 * Grow one zone outward from `hub`: first everything within the hub radius,
 * then adjacent stragglers, always bounded by the shape's diameter.
 * `assigned` is mutated so callers can partition a pool in one pass.
 */
function growZone(
  hub: ClusterPlace,
  ordered: ClusterPlace[],
  assigned: Set<string>,
  shape: ZoneShape,
): Zone {
  assigned.add(hub.id);
  const members: ClusterPlace[] = [hub];

  // Nearest first in both phases: when the diameter cap starts rejecting
  // members, the ones left out should be the far edge of the area, never a
  // place across the road that lost its slot to something 5 km away.
  const nearHub = ordered
    .filter((q) => !assigned.has(q.id) && distanceBetween(hub, q) <= shape.hubRadiusKm)
    .sort((a, b) => distanceBetween(hub, a) - distanceBetween(hub, b));
  for (const q of nearHub) {
    if (assigned.has(q.id)) continue;
    if (clusterDiameterKm([...members, q]) > shape.maxDiameterKm) continue;
    members.push(q);
    assigned.add(q.id);
  }

  let grew = true;
  while (grew) {
    grew = false;
    const joinable = ordered
      .filter((q) => !assigned.has(q.id) && nearestDistanceTo(q, members) <= shape.joinRadiusKm)
      .sort((a, b) => nearestDistanceTo(a, members) - nearestDistanceTo(b, members));
    for (const q of joinable) {
      if (clusterDiameterKm([...members, q]) > shape.maxDiameterKm) continue;
      members.push(q);
      assigned.add(q.id);
      grew = true;
      break;
    }
  }

  members.sort(byValueDesc);
  return {
    id: 'zone:' + hub.id,
    hub,
    places: members,
    center: clusterCenterOf(members),
    diameterKm: clusterDiameterKm(members),
    totalValue: members.reduce((s, p) => s + experienceValue(p), 0),
  };
}

/**
 * Group a candidate pool into geographic sightseeing zones.
 *
 * Hubs are claimed strongest-first, so the best attraction defines its area and
 * weaker neighbours attach to it rather than forming their own competing zone.
 */
export function buildZones(
  pool: ClusterPlace[],
  shape: ZoneShape = DEFAULT_ZONE_SHAPE,
): Zone[] {
  const ordered = [...pool].sort(byValueDesc);
  const assigned = new Set<string>();
  const zones: Zone[] = [];

  for (const hub of ordered) {
    if (assigned.has(hub.id)) continue;
    zones.push(growZone(hub, ordered, assigned, shape));
  }
  return zones;
}

/**
 * Group the city into geographic outings — one area, one day.
 *
 * Compact clusters (Bhedaghat, a fort complex) stay together no matter how
 * many days were booked. Only a sprawling overfull zone — a whole old city
 * that cannot be walked in one outing — is cut into walking neighbourhoods.
 */
export function buildDayAreas(pool: ClusterPlace[], days: number): Zone[] {
  const natural = buildZones(pool, DEFAULT_ZONE_SHAPE);
  const floor = resolveActiveTierFloor(pool, days);
  const usable = (z: Zone) => z.places.some((p) => p.isPinned || priorityTier(p) >= floor);
  if (natural.filter(usable).length >= days) return natural;

  const areas: Zone[] = [];
  for (const zone of natural) {
    const overfull = zone.places.length > ONE_DAY_PLACE_BUDGET;
    const sprawling = zone.diameterKm > COMPACT_OUTING_DIAMETER_KM;
    if (overfull && sprawling) {
      areas.push(...buildZones(zone.places, TIGHT_ZONE_SHAPE));
    } else {
      areas.push(zone);
    }
  }
  return areas;
}

/**
 * Zone seeded at a caller-chosen place rather than the strongest hub.
 * Used when the anchor is decided elsewhere (user pin, legacy anchor-first API).
 */
export function buildZoneAround(
  hub: ClusterPlace,
  pool: ClusterPlace[],
  excludeIds: Set<string> = new Set(),
): Zone {
  const ordered = pool
    .filter((p) => p.id === hub.id || !excludeIds.has(p.id))
    .sort(byValueDesc);
  const assigned = new Set<string>();
  return growZone(hub, ordered, assigned, DEFAULT_ZONE_SHAPE);
}

// ---------------------------------------------------------------------------
// Intra-day routing
// ---------------------------------------------------------------------------

export interface RoutedDay {
  stops: ClusterPlace[];
  /** Day start → first stop. */
  approachKm: number;
  approachMinutes: number;
  /** Sum of stop-to-stop legs. */
  travelKm: number;
  travelMinutes: number;
  visitMinutes: number;
  /** approach + inter-stop travel + visits. */
  totalMinutes: number;
  maxHopKm: number;
  spanKm: number;
}

function pathKm(dayStart: LatLng, order: ClusterPlace[]): number {
  if (!order.length) return 0;
  let total = distanceFromPoint(dayStart, order[0]);
  for (let i = 1; i < order.length; i++) {
    total += distanceBetween(order[i - 1], order[i]);
  }
  return total;
}

function nearestNeighborPath(dayStart: LatLng, places: ClusterPlace[]): ClusterPlace[] {
  const remaining = [...places];
  const ordered: ClusterPlace[] = [];
  let cursor: LatLng = dayStart;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceFromPoint(cursor, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cursor = { lat: next.latitude, lng: next.longitude };
  }
  return ordered;
}

/** Full 2-opt on a short path with a fixed virtual start point. */
function twoOpt(dayStart: LatLng, order: ClusterPlace[], lockFirst: boolean): ClusterPlace[] {
  if (order.length < 3) return order;
  const firstMovable = lockFirst ? 1 : 0;
  let best = [...order];
  let bestLen = pathKm(dayStart, best);
  let improved = true;
  let guard = 0;

  while (improved && guard < 40) {
    improved = false;
    guard++;
    for (let i = firstMovable; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const len = pathKm(dayStart, candidate);
        if (len < bestLen - 1e-9) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Nudge an aarti / sunset / market style stop into the last slot when the
 * detour is small. Keeps Gwarighat's evening aarti at the end of the day
 * instead of at 10am.
 */
function preferEveningFinish(dayStart: LatLng, order: ClusterPlace[], lockFirst: boolean): ClusterPlace[] {
  if (order.length < 2) return order;
  const last = order[order.length - 1];
  const lastAffinity = eveningAffinity(last);
  const startIdx = lockFirst ? 1 : 0;

  let bestOrder = order;
  let bestAffinity = lastAffinity;
  const baseLen = pathKm(dayStart, order);

  for (let i = startIdx; i < order.length - 1; i++) {
    const candidatePlace = order[i];
    const affinity = eveningAffinity(candidatePlace);
    if (affinity <= bestAffinity + 2) continue;
    const candidate = [...order.slice(0, i), ...order.slice(i + 1), candidatePlace];
    const len = pathKm(dayStart, candidate);
    if (len <= baseLen * 1.12 + 0.5) {
      bestOrder = candidate;
      bestAffinity = affinity;
    }
  }
  return bestOrder;
}

/**
 * Order a set of stops as a real route from the day start and measure the day.
 * `lockFirstId` keeps a specific place as stop #1 (used by the legacy
 * anchor-first API).
 */
export function routeDay(
  places: ClusterPlace[],
  dayStart: LatLng,
  speedKmh: number,
  lockFirstId?: string,
): RoutedDay {
  if (!places.length) {
    return {
      stops: [], approachKm: 0, approachMinutes: 0, travelKm: 0,
      travelMinutes: 0, visitMinutes: 0, totalMinutes: 0, maxHopKm: 0, spanKm: 0,
    };
  }

  const locked = lockFirstId ? places.find((p) => p.id === lockFirstId) : undefined;
  const rest = locked ? places.filter((p) => p.id !== locked.id) : places;

  let order = locked
    ? [locked, ...nearestNeighborPath({ lat: locked.latitude, lng: locked.longitude }, rest)]
    : nearestNeighborPath(dayStart, rest);
  order = twoOpt(dayStart, order, !!locked);
  order = preferEveningFinish(dayStart, order, !!locked);

  const approachKm = distanceFromPoint(dayStart, order[0]);
  const approachMinutes = estimateTravelMinutes(approachKm, speedKmh);
  let travelKm = 0;
  let travelMinutes = 0;
  let maxHopKm = 0;
  for (let i = 1; i < order.length; i++) {
    const hop = distanceBetween(order[i - 1], order[i]);
    travelKm += hop;
    travelMinutes += estimateTravelMinutes(hop, speedKmh);
    if (hop > maxHopKm) maxHopKm = hop;
  }
  const visit = order.reduce((s, p) => s + visitMinutes(p), 0);

  return {
    stops: order,
    approachKm,
    approachMinutes,
    travelKm,
    travelMinutes,
    visitMinutes: visit,
    totalMinutes: approachMinutes + travelMinutes + visit,
    maxHopKm,
    spanKm: clusterDiameterKm(order),
  };
}

// ---------------------------------------------------------------------------
// Day packing
// ---------------------------------------------------------------------------

export interface PackOptions {
  days: number;
  maxStopsPerDay: number;
  maxMinutesPerDay: number;
  speedKmh: number;
  /** Quality floor for the primary pack (from resolveActiveTierFloor). */
  tierFloor: number;
  /** Allow near-free extra stops beyond maxStopsPerDay. */
  allowCompactBonus?: boolean;
  /** Allow a leftover-time hop into a neighbouring zone (default true). */
  allowAdjacentFill?: boolean;
  /**
   * If the chosen area only produced one stop, reach for the nearest unused
   * high-priority place so the day is not a single-sight outing (default true).
   * Disabled while comparing areas so a lonely hub cannot steal another area.
   */
  allowThinFill?: boolean;
  /**
   * Allow below-floor places right next to a chosen stop (default true).
   * Disabled while comparing zones so a zone is judged on real content only.
   */
  allowLocalTopup?: boolean;
  /**
   * Force this place into the day as stop #1, bypassing the tier floor.
   * Used when the anchor is decided by the caller (user pin / explicit region).
   */
  seedId?: string;
  debug?: boolean;
}

/** Diminishing value for repeating the same kind of place in one day. */
function saturationFactor(sameCategoryCount: number): number {
  if (sameCategoryCount <= 0) return 1;
  if (sameCategoryCount === 1) return 0.9;
  if (sameCategoryCount === 2) return 0.5;
  if (sameCategoryCount === 3) return 0.25;
  return 0.12;
}

function countSameCategory(chosen: ClusterPlace[], p: ClusterPlace): number {
  const cat = categoryOf(p);
  return chosen.filter((c) => categoryOf(c) === cat).length;
}

/**
 * Value of adding `p` to a day that already contains `chosen`.
 *
 * Distance is subtracted at a steep rate so that inside a zone the traveler
 * always finishes what is next to them first. Category saturation only reduces
 * value — it can never block a place and push the day geographically away.
 */
function additionValue(p: ClusterPlace, chosen: ClusterPlace[], hub: ClusterPlace): number {
  let value = experienceValue(p) * saturationFactor(countSameCategory(chosen, p));
  if (p.isPinned) value += 1000;
  const anchorSet = chosen.length ? chosen : [hub];
  value -= nearestDistanceTo(p, anchorSet) * 6;
  return value;
}

/** Extra pull for a genuine must-visit when leftovers compete for a slot. */
function tierBoost(p: ClusterPlace): number {
  const tier = priorityTier(p);
  if (tier >= 5) return 25;
  if (tier >= 4) return 10;
  return 0;
}

/**
 * What the day is actually worth to the traveler: the same place counts for less
 * when it is the third temple of the day, so a varied day beats a repetitive one.
 */
function itineraryValue(stops: ClusterPlace[]): number {
  let total = 0;
  for (let i = 0; i < stops.length; i++) {
    total += experienceValue(stops[i]) * saturationFactor(countSameCategory(stops.slice(0, i), stops[i]));
  }
  return total;
}

export interface PackedDay extends RoutedDay {
  hub: ClusterPlace;
  /** Places pulled in from a neighbouring zone after this zone was exhausted. */
  filledFromAdjacent: string[];
  value: number;
  decisions: string[];
}

function stopCapacity(
  chosen: ClusterPlace[],
  p: ClusterPlace,
  opts: PackOptions,
  fromOwnZone: boolean,
): boolean {
  // This area is visited once. Pack everything the clock allows so leftovers
  // are not waiting for a second trip tomorrow.
  if (fromOwnZone) return chosen.length < 10;
  if (chosen.length < opts.maxStopsPerDay) return true;
  if (chosen.length >= opts.maxStopsPerDay + MAX_COMPACT_BONUS_STOPS) return false;
  const gap = nearestDistanceTo(p, chosen);
  if (gap <= SAME_COMPLEX_KM) return true;
  return !!opts.allowCompactBonus && gap <= NEAR_FREE_STOP_KM;
}

/**
 * Build one day: exhaust the zone, then (only then) top up from next door.
 */
export function packDay(
  zone: Zone,
  allZones: Zone[],
  usedIds: Set<string>,
  dayStart: LatLng,
  opts: PackOptions,
): PackedDay {
  const decisions: string[] = [];
  const chosen: ClusterPlace[] = [];
  const filledFromAdjacent: string[] = [];
  const rejectedForTime = new Set<string>();
  let routed = routeDay([], dayStart, opts.speedKmh);

  const isUsable = (p: ClusterPlace, floor: number): boolean =>
    !usedIds.has(p.id)
    && !chosen.some((c) => c.id === p.id)
    && !rejectedForTime.has(p.id)
    && (p.isPinned || priorityTier(p) >= floor);

  const minuteBudget = (fromOwnZone: boolean): number => {
    if (fromOwnZone && zone.diameterKm <= COMPACT_OUTING_DIAMETER_KM) {
      return Math.max(opts.maxMinutesPerDay, COMPACT_COVERAGE_MINUTES);
    }
    return opts.maxMinutesPerDay;
  };

  const tryAdd = (p: ClusterPlace, label: string, force = false, fromOwnZone = false): boolean => {
    if (!force && !stopCapacity(chosen, p, opts, fromOwnZone)) return false;
    const trial = routeDay([...chosen, p], dayStart, opts.speedKmh, opts.seedId);
    const budget = minuteBudget(fromOwnZone);
    if (!force && trial.totalMinutes > budget) {
      rejectedForTime.add(p.id);
      if (opts.debug) {
        decisions.push(
          'SKIP ' + p.name + ' — day full ('
            + trial.totalMinutes + 'm > ' + budget + 'm)',
        );
      }
      return false;
    }
    if (!force && chosen.length && trial.spanKm > MAX_DAY_SPAN_KM) {
      rejectedForTime.add(p.id);
      if (opts.debug) {
        decisions.push('SKIP ' + p.name + ' — day span ' + trial.spanKm.toFixed(1) + 'km too wide');
      }
      return false;
    }
    chosen.push(p);
    routed = trial;
    if (opts.debug) {
      decisions.push(
        label + ' ' + p.name
          + ' (value=' + experienceValue(p).toFixed(0)
          + ', ' + nearestDistanceTo(p, chosen.filter((c) => c.id !== p.id)).toFixed(1) + 'km from picked)',
      );
    }
    return true;
  };

  // Phase 0 — a caller-chosen anchor always opens the day.
  if (opts.seedId) {
    const seed = zone.places.find((p) => p.id === opts.seedId);
    if (seed && !usedIds.has(seed.id)) tryAdd(seed, 'ANCHOR', true, true);
  }

  // Phase 1 — the zone itself, nearest-and-best first, until nothing fits.
  const packFromZone = (floor: number, label: string) => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const pool = zone.places.filter((p) => isUsable(p, floor));
      if (!pool.length) break;
      const ranked = pool
        .map((p) => ({ p, v: additionValue(p, chosen, zone.hub) }))
        .sort((a, b) => b.v - a.v);
      for (const { p } of ranked) {
        if (tryAdd(p, label, false, true)) {
          progressed = true;
          break;
        }
      }
    }
  };

  packFromZone(opts.tierFloor, 'ZONE');

  // If a stronger same-area stop missed the clock, bump out the weakest
  // filler (the on-the-way temple) rather than skipping Ghughra Falls.
  let upgraded = true;
  while (upgraded && chosen.length >= 2) {
    upgraded = false;
    const missed = zone.places
      .filter((p) => rejectedForTime.has(p.id) && !chosen.some((c) => c.id === p.id) && !usedIds.has(p.id))
      .sort((a, b) => experienceValue(b) - experienceValue(a));
    if (!missed.length) break;
    const evictable = chosen.filter(
      (c) => c.id !== opts.seedId && c.id !== zone.hub.id && !c.isPinned,
    ).sort((a, b) => experienceValue(a) - experienceValue(b));
    if (!evictable.length) break;
    for (const p of missed) {
      const weak = evictable[0];
      if (experienceValue(p) < experienceValue(weak) + 8) continue;
      const next = chosen.filter((c) => c.id !== weak.id);
      const trial = routeDay([...next, p], dayStart, opts.speedKmh, opts.seedId);
      if (trial.totalMinutes > minuteBudget(true)) continue;
      if (next.length && trial.spanKm > MAX_DAY_SPAN_KM) continue;
      const idx = chosen.findIndex((c) => c.id === weak.id);
      chosen.splice(idx, 1);
      chosen.push(p);
      routed = trial;
      rejectedForTime.delete(p.id);
      rejectedForTime.add(weak.id);
      if (opts.debug) {
        decisions.push('SWAP ' + weak.name + ' → ' + p.name + ' (stronger stop in the same area)');
      }
      upgraded = true;
      break;
    }
  }

  // Phase 2 — leftovers, ranked against each other so quality decides the last
  // slots rather than whichever candidate happened to be closest.
  //
  // A neighbouring area may only be touched once THIS area is genuinely
  // finished: if a stop 2 km away did not fit the clock, driving 10 km for a
  // different one makes no sense. That is exactly the "ek point dekha aur 8 km
  // dur nikal gaya" behaviour this planner exists to prevent.
  const remaining = () => opts.maxMinutesPerDay - routed.totalMinutes;
  const zoneStillHadOptions = zone.places.some((p) => rejectedForTime.has(p.id));
  const localAllowed = opts.allowLocalTopup !== false;
  const thin = chosen.length > 0 && chosen.length < THIN_DAY_STOPS;
  const crossAllowed = !zoneStillHadOptions && (
    opts.allowAdjacentFill !== false
    || (thin && opts.allowThinFill !== false)
  );
  const localFloor = Math.min(opts.tierFloor, LOCAL_TOPUP_MIN_TIER);

  if (opts.debug && zoneStillHadOptions) {
    decisions.push(
      'STOP day: ' + zone.hub.name + ' area still had stops that did not fit the clock — '
        + 'day ends here rather than driving to another area',
    );
  }

  let progressed = true;
  while (progressed && chosen.length) {
    progressed = false;
    const leftovers: Array<{ p: ClusterPlace; v: number; kind: string; own: boolean }> = [];

    if (localAllowed) {
      // Anything practically at a stop the day already has belongs to this day,
      // whichever zone it was filed under: you do not come back tomorrow for a
      // temple across the road. Zones choose the area; this covers it fully.
      for (const other of allZones) {
        for (const p of other.places) {
          if (!isUsable(p, localFloor)) continue;
          const hop = nearestDistanceTo(p, chosen);
          const sameZone = other.id === zone.id;
          if (hop > (sameZone ? NEAR_FREE_STOP_KM : SAME_COMPLEX_KM)) continue;
          leftovers.push({
            p,
            v: experienceValue(p) + tierBoost(p) - hop * 4,
            kind: other.id === zone.id ? 'ZONE' : 'LOCAL',
            own: other.id === zone.id,
          });
        }
      }
    }

    if (crossAllowed && remaining() >= (thin ? 50 : MIN_FILL_MINUTES)) {
      // A thin day (one lonely stop) reaches for the nearest leftover
      // high-priority place so the traveler is not sent home after one sight.
      // A full day only hops next-door, and never into tomorrow's area unless
      // there are spare areas left (caller sets allowAdjacentFill).
      const last = routed.stops[routed.stops.length - 1];
      const hopLimit = thin ? THIN_DAY_FILL_MAX_KM : ADJACENT_FILL_MAX_KM;
      const stopRoom = thin || chosen.length < opts.maxStopsPerDay;
      if (stopRoom) {
        for (const other of allZones) {
          if (other.id === zone.id) continue;
          for (const p of other.places) {
            if (!isUsable(p, Math.min(opts.tierFloor, LOCAL_TOPUP_MIN_TIER))) continue;
            if (experienceValue(p) < MIN_FILL_VALUE) continue;
            const hop = distanceBetween(last, p);
            if (hop > hopLimit) continue;
            if (nearestDistanceTo(p, chosen) > hopLimit) continue;
            leftovers.push({
              p,
              v: experienceValue(p) + tierBoost(p) - hop * 4,
              kind: 'ADJACENT',
              own: false,
            });
          }
        }
      }
    }

    leftovers.sort((a, b) => b.v - a.v);
    for (const cand of leftovers) {
      if (tryAdd(cand.p, cand.kind, false, cand.own)) {
        if (cand.kind === 'ADJACENT') filledFromAdjacent.push(cand.p.id);
        progressed = true;
        break;
      }
    }
  }

  if (opts.debug && !filledFromAdjacent.length && !zoneStillHadOptions) {
    decisions.push(
      'STOP day: ' + zone.hub.name + ' area fully covered — '
        + 'next region deferred to next day (remaining ' + Math.max(0, remaining()) + 'm)',
    );
  }

  const value = itineraryValue(chosen);

  return {
    ...routed,
    hub: zone.hub,
    filledFromAdjacent,
    value,
    decisions,
  };
}

// ---------------------------------------------------------------------------
// Zone scoring for day selection
// ---------------------------------------------------------------------------

/**
 * How much a day spent in this zone is worth, net of getting there.
 *
 * A zone earns day 1 by being worth a full day out — several real attractions
 * close together — not merely by being far away or by holding one famous name.
 * From day 2 on the traveler is already on the road, so travel from where they
 * stopped is weighted heavily and the trip advances area by area instead of
 * criss-crossing the map.
 */
export function scoreZoneForDay(
  packed: PackedDay,
  dayIndex: number,
  fromPreviousEndpoint: boolean,
): number {
  if (!packed.stops.length) return -Infinity;

  const uniqueCategories = new Set(packed.stops.map((p) => categoryOf(p))).size;
  const mustVisits = packed.stops.filter((p) => isAnchorCandidate(p)).length;
  const peakValue = Math.max(...packed.stops.map((p) => experienceValue(p)));
  const averageValue = packed.value / packed.stops.length;

  let score = packed.value;
  // A full area outing beats a single famous name: the traveler came to see
  // everything around, not to tick the top-rated pin and leave.
  score += packed.stops.length * 14;
  score += uniqueCategories * 7;
  score += mustVisits * 12;
  score += peakValue * 0.45;
  score += averageValue * 1.2;
  // Reward a tight day: everything close together is a better outing.
  score += Math.max(0, 16 - packed.spanKm * 1.4);
  if (packed.stops.some((p) => p.isPinned)) score += 400;

  const travelWeight = fromPreviousEndpoint ? 1.15 : dayIndex === 0 ? 0.4 : 0.75;
  score -= packed.approachMinutes * travelWeight;
  score -= packed.travelMinutes * 0.25;
  if (fromPreviousEndpoint && packed.approachKm > 30) {
    score -= (packed.approachKm - 30) * 1.2;
  }

  if (
    dayIndex === 0
    && !fromPreviousEndpoint
    && packed.stops.length >= 4
    && packed.approachKm >= 8
    && packed.approachKm <= 40
  ) {
    // Day-trip outing: a full cluster you travel to (Bhedaghat) beats ticking
    // city-centre pins that can be seen on any later day.
    score += packed.stops.length * 10 + Math.min(35, packed.approachKm);
  }

  return score;
}

export interface RankedDayArea<T> {
  score: number;
  hubId: string;
  stopIds?: string[];
  pick: T;
}

/**
 * Regenerate must not replay the same day-1 area when another real outing exists.
 * Seed 0 keeps the original winner so first-time generation stays stable.
 */
export function pickVariedCandidate<T>(
  ranked: Array<RankedDayArea<T>>,
  variationSeed: number,
  days: number,
  avoidPlaceIds: string[] = [],
): RankedDayArea<T> | null {
  if (!ranked.length) return null;
  if (!variationSeed) return ranked[0];

  const avoid = new Set(avoidPlaceIds);
  const notAvoided = (r: RankedDayArea<T>) =>
    !avoid.has(r.hubId) && !(r.stopIds || []).some((id) => avoid.has(id));

  // 1-day: keep the richest outing (Bhedaghat stays Bhedaghat); packing
  // changes stop order. Multi-day: rotate which area opens the trip.
  if (days <= 1) {
    return ranked[0];
  }

  const offset = Math.abs(variationSeed) % ranked.length;
  const rotated = [...ranked.slice(offset), ...ranked.slice(0, offset)];
  const fresh = rotated.filter(notAvoided);
  return fresh[0] || rotated[0];
}

// ---------------------------------------------------------------------------
// Main planner
// ---------------------------------------------------------------------------

export interface ZonePlannerOptions {
  days: number;
  maxStopsPerDay: number;
  maxMinutesPerDay: number;
  origin: LatLng;
  speedKmh?: number;
  hotelBaseByDay?: Record<number, { lat: number; lng: number; label?: string }>;
  debug?: boolean;
  /** Allow near-free extra stops beyond the pace limit (default true). */
  allowCompactBonus?: boolean;
  /**
   * Bumps which competitive area opens the trip. 0 keeps the original
   * highest-scoring day-1 outing; 1+ cycles alternatives on Regenerate.
   */
  variationSeed?: number;
  /** Hubs already used as a previous plan's day-1 area — skip when a peer exists. */
  avoidHubIds?: string[];
}

export interface PlannedDayTrace {
  dayNumber: number;
  dayStart: { lat: number; lng: number; label: string };
  dayEnd: { lat: number; lng: number; label: string };
  regionAnchorId: string;
  regionAnchorName: string;
  stops: ClusterPlace[];
  decisions: string[];
}

export interface ZonePlanResult {
  days: ClusterPlace[][];
  plannedDays: PlannedDayTrace[];
  debugLog: string[];
}

export function planZoneItinerary(
  pool: ClusterPlace[],
  options: ZonePlannerOptions,
): ZonePlanResult {
  const debug = !!options.debug || process.env.ITINERARY_CLUSTER_DEBUG === 'true';
  const debugLog: string[] = [];
  const usedIds = new Set<string>();
  const days: ClusterPlace[][] = [];
  const plannedDays: PlannedDayTrace[] = [];
  const speedKmh = options.speedKmh ?? 30;
  const allowCompactBonus = options.allowCompactBonus !== false;

  const zones = buildDayAreas(pool, options.days);
  /** An area belongs to exactly one day — no day ever returns to it. */
  const usedAreaIds = new Set<string>();
  if (debug) {
    debugLog.push('AREAS (' + zones.length + ') for ' + options.days + ' day(s):');
    for (const z of zones) {
      debugLog.push(
        '  ' + z.hub.name + ' — ' + z.places.length + ' places, span '
          + z.diameterKm.toFixed(1) + 'km, value ' + z.totalValue.toFixed(0)
          + ' :: ' + z.places.map((p) => p.name).join(' | '),
      );
    }
  }

  let previousDayEnd = {
    lat: options.origin.lat,
    lng: options.origin.lng,
    label: 'trip-origin',
  };
  for (let dayIndex = 0; dayIndex < options.days; dayIndex++) {
    const dayNumber = dayIndex + 1;
    const hotel = options.hotelBaseByDay?.[dayNumber];
    const dayStart = hotel
      ? { lat: hotel.lat, lng: hotel.lng, label: hotel.label || 'hotel-base' }
      : dayIndex === 0
        ? { lat: options.origin.lat, lng: options.origin.lng, label: 'trip-origin' }
        : previousDayEnd;
    const fromPreviousEndpoint = dayIndex > 0 && !hotel;

    const unused = pool.filter((p) => !usedIds.has(p.id));
    if (!unused.length) break;
    const tierFloor = resolveActiveTierFloor(unused, options.days);

    // Only areas no earlier day has been to. Today's area gets covered as fully
    // as the clock allows and is then closed for the rest of the trip, so the
    // traveler never drives back to a place they have already seen.
    const remainingDays = options.days - dayIndex;
    const openAreas = zones.filter(
      (z) => !usedAreaIds.has(z.id) && z.places.some((p) => !usedIds.has(p.id)),
    );

    const decisions: string[] = [];
    if (debug) {
      decisions.push(
        'DAY ' + dayNumber + ' START ' + dayStart.lat.toFixed(4) + ',' + dayStart.lng.toFixed(4)
          + ' (' + dayStart.label + ') tierFloor=' + tierFloor
          + ' freshAreas=' + openAreas.length + ' for ' + remainingDays + ' day(s) left',
      );
    }

    const packOpts: PackOptions = {
      days: options.days,
      maxStopsPerDay: options.maxStopsPerDay,
      maxMinutesPerDay: options.maxMinutesPerDay,
      speedKmh,
      tierFloor,
      allowCompactBonus,
      // A neighbouring area may only be absorbed when there are more areas left
      // than days to spend; otherwise that area is tomorrow's day.
      allowAdjacentFill: openAreas.length > remainingDays,
      debug,
    };

    // A place the user explicitly asked for opens the day it belongs to.
    const seedFor = (zone: Zone) => zone.places.find((p) => p.isPinned && !usedIds.has(p.id))?.id;

    let best: { zone: Zone; packed: PackedDay; score: number } | null = null;
    const ranked: Array<RankedDayArea<{ zone: Zone; packed: PackedDay }>> = [];
    for (const zone of openAreas) {
      // Compare areas on their own headline attractions: filler stops borrowed
      // from next door must not decide which area the day belongs to.
      const packed = packDay(zone, openAreas, usedIds, dayStart, {
        ...packOpts,
        seedId: seedFor(zone),
        allowLocalTopup: false,
        allowAdjacentFill: false,
        allowThinFill: false,
      });
      if (!packed.stops.length) continue;
      const score = scoreZoneForDay(packed, dayIndex, fromPreviousEndpoint);
      if (debug) {
        decisions.push(
          '  candidate area ' + zone.hub.name + ' score=' + score.toFixed(0)
            + ' stops=' + packed.stops.map((s) => s.name).join(' → ')
            + ' approach=' + packed.approachKm.toFixed(1) + 'km'
            + ' span=' + packed.spanKm.toFixed(1) + 'km'
            + ' mins=' + packed.totalMinutes,
        );
      }
      ranked.push({
        score,
        hubId: zone.hub.id,
        stopIds: packed.stops.map((s) => s.id),
        pick: { zone, packed },
      });
    }
    ranked.sort((a, b) => b.score - a.score);
    const chosen = pickVariedCandidate(
      ranked,
      dayIndex === 0 ? (options.variationSeed ?? 0) : 0,
      options.days,
      dayIndex === 0 ? (options.avoidHubIds || []) : [],
    );
    if (chosen) best = { ...chosen.pick, score: chosen.score };

    if (!best) {
      if (debug) decisions.push('DAY ' + dayNumber + ': no fresh area remains — rest day');
      debugLog.push(...decisions);
      break;
    }

    // The area is settled — now fill the day out properly, covering everything
    // worth seeing around the chosen stops before the clock runs out. This is
    // the area's only day, so the pace limit gives way to nearby stops.
    const varySeed = options.variationSeed ?? 0;
    const altStart = varySeed > 0 && !seedFor(best.zone) && best.zone.places.length > 1
      ? best.zone.places[Math.abs(varySeed) % best.zone.places.length]?.id
      : seedFor(best.zone);
    const finalPacked = packDay(best.zone, openAreas, usedIds, dayStart, {
      ...packOpts,
      seedId: altStart,
    });
    if (finalPacked.stops.length >= best.packed.stops.length) {
      best = { ...best, packed: finalPacked };
    }

    for (const stop of best.packed.stops) usedIds.add(stop.id);
    days.push(best.packed.stops);

    const last = best.packed.stops[best.packed.stops.length - 1];
    const dayEnd = { lat: last.latitude, lng: last.longitude, label: last.name };

    // Close today's area only. Leftovers from THIS area are dropped rather than
    // deferred — a second trip for them would send the traveler back to streets
    // they already walked. Neighbouring areas stay open for later days.
    usedAreaIds.add(best.zone.id);
    const droppedNames: string[] = [];
    for (const p of best.zone.places) {
      if (usedIds.has(p.id) || p.isPinned) continue;
      usedIds.add(p.id);
      droppedNames.push(p.name);
    }

    if (debug) {
      decisions.push(
        'DAY ' + dayNumber + ' SELECTED area=' + best.zone.hub.name
          + ' score=' + best.score.toFixed(0),
      );
      decisions.push(...best.packed.decisions);
      if (droppedNames.length) {
        decisions.push(
          'Area closed after day ' + dayNumber + ' — no return trip for: '
            + droppedNames.join(', '),
        );
      }
      const chosenIds = new Set(best.packed.stops.map((s) => s.id));
      for (const p of pool) {
        if (chosenIds.has(p.id) || usedIds.has(p.id)) continue;
        decisions.push(
          'Rejected: ' + p.name + ' reason: OUTSIDE_SELECTED_EXCURSION'
            + ' (' + best.zone.hub.name + ' area chosen for day ' + dayNumber + ', '
            + nearestDistanceTo(p, best.packed.stops).toFixed(1) + 'km away)',
        );
      }
      decisions.push('DAY ' + dayNumber + ' END ' + last.name);
      debugLog.push(...decisions);
    }

    plannedDays.push({
      dayNumber,
      dayStart,
      dayEnd,
      regionAnchorId: best.zone.hub.id,
      regionAnchorName: best.zone.hub.name,
      stops: best.packed.stops,
      decisions,
    });
    previousDayEnd = dayEnd;
  }

  // Any place the user explicitly pinned must appear somewhere.
  const leftoverPins = pool.filter((p) => p.isPinned && !usedIds.has(p.id));
  for (const pin of leftoverPins) {
    if (days.length < options.days) {
      const zone = zones.find((z) => z.places.some((p) => p.id === pin.id));
      if (!zone) continue;
      const packed = packDay(zone, zones, usedIds, previousDayEnd, {
        days: options.days,
        maxStopsPerDay: options.maxStopsPerDay,
        maxMinutesPerDay: options.maxMinutesPerDay,
        speedKmh,
        tierFloor: membershipMinTier(options.days),
        allowCompactBonus,
        debug,
      });
      if (!packed.stops.length) continue;
      for (const stop of packed.stops) usedIds.add(stop.id);
      days.push(packed.stops);
      const last = packed.stops[packed.stops.length - 1];
      plannedDays.push({
        dayNumber: days.length,
        dayStart: previousDayEnd,
        dayEnd: { lat: last.latitude, lng: last.longitude, label: last.name },
        regionAnchorId: pin.id,
        regionAnchorName: pin.name,
        stops: packed.stops,
        decisions: ['forced leftover pin'],
      });
      previousDayEnd = { lat: last.latitude, lng: last.longitude, label: last.name };
    } else {
      let target = 0;
      for (let i = 1; i < days.length; i++) {
        if (days[i].length < days[target].length) target = i;
      }
      days[target] = [...days[target], pin];
      usedIds.add(pin.id);
      if (plannedDays[target]) {
        plannedDays[target].stops = days[target];
        plannedDays[target].dayEnd = { lat: pin.latitude, lng: pin.longitude, label: pin.name };
      }
      if (debug) debugLog.push('FORCED leftover pin ' + pin.name + ' onto day ' + (target + 1));
    }
  }

  if (debug && debugLog.length) {
    for (const line of debugLog) {
      console.log('[itineraryZones] ' + line);
    }
  }

  return { days, plannedDays, debugLog };
}
