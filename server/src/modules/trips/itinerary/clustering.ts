/**
 * Canonical geographic clustering (Phase 1).
 *
 * A ZONE is one real sightseeing area — the set of attractions a local would
 * describe with a single name. Thresholds mirror the legacy zone engine:
 *   hub radius        = 5 km     (place joins its hub's zone within one short drive)
 *   join radius       = 2.5 km   (place adjacent to any existing member may join)
 *   max diameter      = 6.5 km   (a zone can never chain-grow across a city)
 *
 * Phase 0 contract: "one zone per day" is a SOFT preference. Zones represent
 * places a human would naturally combine in one outing; adjacent zones may
 * share a day when that materially improves the itinerary (see
 * shouldCombineForDay). We NEVER artificially split naturally connected zones
 * purely to satisfy one-zone-per-day.
 *
 * Pure, DB-free. Distance computations use Haversine (ESTIMATED) — a
 * DistanceProvider seam is kept ready for future road-routing integration.
 */

import type { EnrichedPlace, GeoCoords, Zone } from './types';
import { estimateDurationMinutes, eveningAffinity, categoryOf } from './enrichment';

// ---------------------------------------------------------------------------
// Extracted pure geo/travel helpers (identical formulas to legacy engine)
// ---------------------------------------------------------------------------

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceBetween(a: EnrichedPlace, b: EnrichedPlace): number {
  return haversineKm(a.coordinates.lat, a.coordinates.lng, b.coordinates.lat, b.coordinates.lng);
}

export function distanceFromPoint(p: GeoCoords, place: EnrichedPlace): number {
  return haversineKm(p.lat, p.lng, place.coordinates.lat, place.coordinates.lng);
}

/** Travel time estimate including a fixed parking/walk-in buffer. */
export function estimateTravelMinutes(distKm: number, speedKmh: number): number {
  const speed = Math.max(4, speedKmh);
  return Math.round((distKm / speed) * 60) + 10;
}

export function clusterCenterOf(places: EnrichedPlace[]): GeoCoords {
  const n = Math.max(1, places.length);
  return {
    lat: places.reduce((s, p) => s + p.coordinates.lat, 0) / n,
    lng: places.reduce((s, p) => s + p.coordinates.lng, 0) / n,
  };
}

/** Widest pairwise distance in a set (km). */
export function clusterDiameterKm(places: EnrichedPlace[]): number {
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

function nearestDistanceTo(p: EnrichedPlace, set: EnrichedPlace[]): number {
  let best = Infinity;
  for (const m of set) {
    const d = distanceBetween(m, p);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Zone thresholds (canonical)
// ---------------------------------------------------------------------------

export const ZONE_HUB_RADIUS_KM = 5;
export const ZONE_JOIN_RADIUS_KM = 2.5;
export const MAX_ZONE_DIAMETER_KM = 6.5;
/** Centers within this distance are considered adjacent ("next area over"). */
export const ZONE_ADJACENT_CENTER_KM = 12;
/** Whole-day geographic span cap (excludes the approach from the day start). */
export const MAX_DAY_SPAN_KM = 22;
/** Places a single outing should realistically contain before it is "overfull". */
export const ONE_DAY_PLACE_BUDGET = 5;
/** Compact sightseeing clusters stay one area even on long trips. */
export const COMPACT_OUTING_DIAMETER_KM = 5.5;
/** Walking-scale shape used only when one genuinely sprawling area is split. */
export const TIGHT_ZONE_HUB_RADIUS_KM = 2.5;
export const TIGHT_ZONE_JOIN_RADIUS_KM = 1.2;
export const TIGHT_ZONE_MAX_DIAMETER_KM = 3.5;

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

export const TIGHT_ZONE_SHAPE: ZoneShape = {
  hubRadiusKm: TIGHT_ZONE_HUB_RADIUS_KM,
  joinRadiusKm: TIGHT_ZONE_JOIN_RADIUS_KM,
  maxDiameterKm: TIGHT_ZONE_MAX_DIAMETER_KM,
};

/**
 * Documented draw of a single place for clustering/ordering decisions.
 * Tier-first, then rating, then intrinsic appeal + explicit-state boosts.
 */
export function zoneValueOf(p: EnrichedPlace): number {
  const rating = p.rating ?? 0;
  const pop = Math.min(100, p.popularityScore ?? 20);
  let value = (p.editorialPriority ?? 3) * 15 + rating * 6 + pop * 0.3;
  if (p.state.pinned) value += 100;
  if (p.state.priorityAnchor) value += 90;
  if (p.state.selected) value += 40;
  return value;
}

function byValueDesc(a: EnrichedPlace, b: EnrichedPlace): number {
  if (a.state.pinned !== b.state.pinned) return a.state.pinned ? -1 : 1;
  return zoneValueOf(b) - zoneValueOf(a);
}

// ---------------------------------------------------------------------------
// Zone construction (extracted from legacy growZone/buildZones)
// ---------------------------------------------------------------------------

export interface BuildZonesOptions {
  shape?: ZoneShape;
  /** Place ids that must appear in SOME zone even when geographically remote (pins/locks). */
  includePlaceIds?: string[];
}

/**
 * Grow one zone outward from `hub`: first everything within the hub radius,
 * then adjacent stragglers, always bounded by the shape's diameter.
 */
function growZone(hub: EnrichedPlace, ordered: EnrichedPlace[], assigned: Set<string>, shape: ZoneShape): Zone {
  assigned.add(hub.id);
  const members: EnrichedPlace[] = [hub];

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
  const base: Zone = {
    id: 'zone:' + hub.id,
    hubPlaceId: hub.id,
    placeIds: members.map((m) => m.id),
    center: clusterCenterOf(members),
    diameterKm: clusterDiameterKm(members),
    totalValue: members.reduce((s, p) => s + zoneValueOf(p), 0),
    adjacentZoneIds: [],
    compact: clusterDiameterKm(members) <= COMPACT_OUTING_DIAMETER_KM,
  };
  return base;
}

/**
 * Group a candidate pool into geographic sightseeing zones.
 * Hubs are claimed strongest-first so the best attraction defines its area.
 * `includePlaceIds` places are force-appended to their nearest hub's zone even
 * when they sit outside the zone's geometry (explicit user places must survive).
 */
export function buildZones(pool: EnrichedPlace[], options: BuildZonesOptions = {}): Zone[] {
  const shape = options.shape ?? DEFAULT_ZONE_SHAPE;
  const ordered = [...pool].sort(byValueDesc);
  const assigned = new Set<string>();
  const zones: Zone[] = [];

  for (const hub of ordered) {
    if (assigned.has(hub.id)) continue;
    zones.push(growZone(hub, ordered, assigned, shape));
  }

  if (options.includePlaceIds && options.includePlaceIds.length) {
    const index = new Map(pool.map((p) => [p.id, p]));
    const includeIds = Array.from(new Set(options.includePlaceIds)).filter((id) => {
      const p = index.get(id);
      return p && !zones.some((z) => z.placeIds.includes(id));
    });
    for (const id of includeIds) {
      const place = index.get(id);
      if (!place) continue;
      // A user-choice place that lies outside its nearest area gets its own
      // concise zone rather than being silently swallowed by an unrelated one.
      zones.push({
        id: `zone:${place.id}:forced`,
        hubPlaceId: place.id,
        placeIds: [place.id],
        center: place.coordinates,
        diameterKm: 0,
        totalValue: zoneValueOf(place),
        adjacentZoneIds: [],
        compact: true,
      });
    }
  }

  computeAdjacency(zones);
  return zones;
}

/** Zone seeded at a caller-chosen place rather than the strongest hub. */
export function buildZoneAround(hub: EnrichedPlace, pool: EnrichedPlace[], options: BuildZonesOptions = {}): Zone {
  const ordered = [...pool].sort(byValueDesc);
  const assigned = new Set<string>();
  const zone = growZone(hub, ordered, assigned, options.shape ?? DEFAULT_ZONE_SHAPE);
  return zone;
}

// ---------------------------------------------------------------------------
// Adjacency + zone scoring
// ---------------------------------------------------------------------------

/**
 * Centers within ZONE_ADJACENT_CENTER_KM are "next area over" — the natural
 * candidate for a same-day top-up when the primary zone is exhausted.
 */
export function computeAdjacency(zones: Zone[]): Zone[] {
  for (const z of zones) {
    z.adjacentZoneIds = [];
    for (const other of zones) {
      if (other.id === z.id) continue;
      if (haversineKm(z.center.lat, z.center.lng, other.center.lat, other.center.lng) <= ZONE_ADJACENT_CENTER_KM) {
        z.adjacentZoneIds.push(other.id);
      }
    }
  }
  return zones;
}

export interface ZoneScore {
  zone: Zone;
  totalValue: number;
  density: number;
  compactnessBonus: number;
  originDistanceKm: number;
  originCost: number;
  memberCount: number;
  score: number;
  reason: string;
}

/**
 * Soft zone score for choosing which area gets a day. Richness (totalValue +
 * density + compactness) is the dominant term; travel FROM THE DAY START is a
 * penalty, never a veto. Mirrors the legacy cluster-first scoring philosophy.
 */
export function scoreZone(zone: Zone, poolById: Map<string, EnrichedPlace>, dayStart: GeoCoords, speedKmh = 30, fromPreviousEndpoint = false): ZoneScore {
  const members = zone.placeIds.map((id) => poolById.get(id)).filter((p): p is EnrichedPlace => !!p);
  const n = Math.max(1, members.length);

  let density = 0;
  if (members.length > 1) {
    const avgDist = members.reduce((s, p) => s + haversineKm(zone.center.lat, zone.center.lng, p.coordinates.lat, p.coordinates.lng), 0) / n;
    density = Math.max(0, 18 - avgDist * 1.5);
  }
  const diameter = zone.diameterKm;
  const compactnessBonus = diameter <= 5 ? 16 : diameter <= 8 ? 10 : diameter <= 12 ? 4 : 0;
  const sprawlPenalty = diameter > 12 ? (diameter - 12) * 2.5 : 0;

  const distFromDayStart = haversineKm(dayStart.lat, dayStart.lng, zone.center.lat, zone.center.lng);
  const travelMins = estimateTravelMinutes(distFromDayStart, speedKmh);
  const fromEndpoint = fromPreviousEndpoint ? 1 : 0;
  const originCost = travelMins * 0.2 + distFromDayStart * (fromEndpoint ? 1.1 : 0.3);

  const isolationPenalty = members.length <= 1 ? 22 : 0;
  const score = zone.totalValue + density + compactnessBonus - originCost - isolationPenalty - sprawlPenalty;

  return {
    zone,
    totalValue: zone.totalValue,
    density: Math.round(density),
    compactnessBonus,
    originDistanceKm: Math.round(distFromDayStart * 10) / 10,
    originCost: Math.round(originCost),
    memberCount: members.length,
    score: Math.round(score),
    reason: `value=${Math.round(zone.totalValue)} density=${Math.round(density)} `
      + `compact=${compactnessBonus} members=${members.length} `
      + `dayStartDist=${Math.round(distFromDayStart * 10) / 10}km originCost=${Math.round(originCost)}`,
  };
}

// ---------------------------------------------------------------------------
// Soft day-combination heuristic ("one zone/day" is a PREFERENCE)
// ---------------------------------------------------------------------------

export interface CombineDayContext {
  poolById: Map<string, EnrichedPlace>;
  dayStart: GeoCoords;
  speedKmh?: number;
  /** Cap on a combined day's geographic span. */
  maxDaySpanKm?: number;
  /** Minimum combined center-to-center proximity for a natural merge. */
  adjacentCenterKm?: number;
}

export interface CombineDecision {
  combine: boolean;
  reason: string;
  combinedSpanKm: number | null;
}

/**
 * Decide whether a secondary zone should share a day with the primary zone.
 * One-zone-per-day is deliberately NOT enforced here: adjacent zones combine
 * when their centers are close, the merged span stays inside a day's travel
 * budget, and the secondary materially improves the outing.
 */
export function shouldCombineForDay(primary: Zone, secondary: Zone, ctx: CombineDayContext): CombineDecision {
  const centerDist = haversineKm(primary.center.lat, primary.center.lng, secondary.center.lat, secondary.center.lng);
  const adjacentKm = ctx.adjacentCenterKm ?? ZONE_ADJACENT_CENTER_KM;
  if (centerDist > adjacentKm) {
    return { combine: false, reason: `secondary zone center ${centerDist.toFixed(1)}km away (adjacency threshold ${adjacentKm}km)`, combinedSpanKm: null };
  }

  const combinedMembers = [...primary.placeIds, ...secondary.placeIds]
    .map((id) => ctx.poolById.get(id))
    .filter((p): p is EnrichedPlace => !!p);
  const span = clusterDiameterKm(combinedMembers);
  const maxSpan = ctx.maxDaySpanKm ?? MAX_DAY_SPAN_KM;
  if (span > maxSpan) {
    return { combine: false, reason: `combined span ${span.toFixed(1)}km exceeds the ${maxSpan}km day cap`, combinedSpanKm: Math.round(span * 10) / 10 };
  }

  // Material improvement: the secondary must add real value, not filler.
  const maxSpanKm = Math.max(primary.diameterKm, secondary.diameterKm);
  const compactness = maxSpanKm <= COMPACT_OUTING_DIAMETER_KM;
  const value = secondary.totalValue;
  if (value < 30 && !compactness) {
    return { combine: false, reason: `secondary zone adds too little value (${Math.round(value)} < 30)`, combinedSpanKm: Math.round(span * 10) / 10 };
  }

  return {
    combine: true,
    reason: `adjacent zones (centers ${centerDist.toFixed(1)}km, combined span ${span.toFixed(1)}km) materially improve the outing`,
    combinedSpanKm: Math.round(span * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Splitting only genuinely sprawling overfull zones (never artificial)
// ---------------------------------------------------------------------------

/**
 * Split a zone ONLY when it is both overfull (> ONE_DAY_PLACE_BUDGET places)
 * AND sprawling (> COMPACT_OUTING_DIAMETER_KM). Naturally connected compact
 * clusters are never split — that would force a traveler back to the same
 * outing on another day.
 */
export function splitSprawlingOverfullZone(zone: Zone, pool: EnrichedPlace[], options: BuildZonesOptions = {}): Zone[] {
  const members = zone.placeIds.map((id) => pool.find((p) => p.id === id)).filter((p): p is EnrichedPlace => !!p);
  if (members.length <= ONE_DAY_PLACE_BUDGET || zone.diameterKm <= COMPACT_OUTING_DIAMETER_KM) {
    return [zone];
  }
  return buildZones(members, { ...options, shape: TIGHT_ZONE_SHAPE });
}

export { estimateDurationMinutes, eveningAffinity, categoryOf };

/** Group a city into day-areas using the canonical zone logic (soft rule aware). */
export function buildDayAreas(pool: EnrichedPlace[], _days: number, options: BuildZonesOptions = {}): Zone[] {
  const natural = buildZones(pool, options);
  const areas: Zone[] = [];
  for (const zone of natural) {
    const overfull = zone.placeIds.length > ONE_DAY_PLACE_BUDGET;
    const sprawling = zone.diameterKm > COMPACT_OUTING_DIAMETER_KM;
    if (overfull && sprawling) {
      areas.push(...buildZones(zone.placeIds.map((id) => pool.find((p) => p.id === id)).filter((p): p is EnrichedPlace => !!p), { ...options, shape: TIGHT_ZONE_SHAPE }));
    } else {
      areas.push(zone);
    }
  }
  computeAdjacency(areas);
  return areas;
}