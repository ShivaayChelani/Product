/**
 * Canonical route optimizer (Phase 1).
 *
 * Extracts nearestNeighborOrder / twoOptImprove / routeDetourIndex from the
 * legacy engine and adds constraint-aware day ordering on top:
 *   - locked positions   (relative order of a "backbone" is preserved)
 *   - fixced-time anchors(>= fixed-time places come first, sorted by start)
 *   - opening-hour constraints (penalty for orders that violate trusted hours)
 *   - evening affinity    (sunset/aarti-style stops drift toward the end)
 *   - area coherence      (zone switches are penalized softly)
 *
 * Distance is NEVER the only objective: the sequence score balances priority,
 * travel burden, timing, and opening hours. Travel estimates are Haversine and
 * therefore always ESTIMATED — this module never pretends they are road truth.
 * The `distanceProvider` seam is ready for a future road-routing provider.
 */

import type { EnrichedPlace, GeoCoords } from './types';
import { estimateTravelMinutes, haversineKm } from './clustering';
import { eveningAffinity } from './enrichment';
import { isPlaceOpenAt, nextOpenMinuteAt, normalizeOpeningHours } from './enrichment';

// ---------------------------------------------------------------------------
// Extracted pure route primitives (identical to legacy engine)
// ---------------------------------------------------------------------------

export interface RoutablePoint {
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
      if (d < bestDist) { bestDist = d; bestIdx = i; }
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

/** Chain-vs-direct span ratio for one stop sequence. 1.0 = straight line. */
export function routeDetourIndex(points: Array<{ latitude: number; longitude: number }>): number {
  if (points.length < 3) return 1;
  let chain = 0;
  for (let i = 1; i < points.length; i++) {
    chain += haversineKm(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
  }
  const p0 = points[0];
  const pn = points[points.length - 1];
  const direct = haversineKm(p0.latitude, p0.longitude, pn.latitude, pn.longitude);
  if (direct < 0.5) return chain > 2 ? 1.5 : 1;
  return Math.round((chain / direct) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Enriched-place adapters
// ---------------------------------------------------------------------------

function toRoutable(p: EnrichedPlace): RoutablePoint {
  return { id: p.id, latitude: p.coordinates.lat, longitude: p.coordinates.lng };
}

function routeSegment(places: EnrichedPlace[], start: GeoCoords, byId: Map<string, EnrichedPlace>): EnrichedPlace[] {
  const pts = places.map(toRoutable);
  const ordered = twoOptImprove(nearestNeighborOrder(pts, { latitude: start.lat, longitude: start.lng }), { latitude: start.lat, longitude: start.lng }, 40);
  return ordered.map((r) => byId.get(r.id) as EnrichedPlace);
}

// ---------------------------------------------------------------------------
// Sequence scoring (balance, not distance-only)
// ---------------------------------------------------------------------------

export interface SequenceScoreContext {
  byId: Map<string, EnrichedPlace>;
  speedKmh: number;
  /** Approximate day start used for opening-hour feasibility checks. */
  earliestStartMinutes: number;
  date?: Date | null;
  /** placeId -> zoneId, to softly penalize bouncing between areas. */
  zoneByPlaceId?: Map<string, string>;
  /** backbone ids (locked/fixed-time) — never reordered. */
  backbone: string[];
}

export interface SequenceScore {
  score: number;
  travelBurden: number;
  priorityTotal: number;
  timingPenalty: number;
  coherencePenalty: number;
  eveningBonus: number;
  totalKm: number;
  totalTravelMinutes: number;
  openingHoursFeasible: boolean;
  reasons: string[];
}

function placePriorityWeight(p: EnrichedPlace): number {
  let w = (p.editorialPriority ?? 3) * 8 + (p.rating ?? 0) * 6;
  if (p.state.pinned || p.state.lockedPosition) w += 120;
  if (p.state.priorityAnchor) w += 110;
  if (p.state.selected) w += 60;
  return w;
}

/** Cumulative approximate scheduling used ONLY for feasibility scoring. */
function approximateStartTimes(order: EnrichedPlace[], dayStart: GeoCoords, speedKmh: number, earliestStartMinutes: number): number[] {
  const starts: number[] = [];
  let cursor = earliestStartMinutes;
  let prev = dayStart;
  for (const p of order) {
    const legKm = haversineKm(prev.lat, prev.lng, p.coordinates.lat, p.coordinates.lng);
    cursor += estimateTravelMinutes(legKm, speedKmh);
    starts.push(cursor);
    cursor += p.durationMinutes;
    prev = p.coordinates;
  }
  return starts;
}

export function computeSequenceScore(order: EnrichedPlace[], ctx: SequenceScoreContext, dayStart: GeoCoords): SequenceScore {
  if (!order.length) {
    return { score: 0, travelBurden: 0, priorityTotal: 0, timingPenalty: 0, coherencePenalty: 0, eveningBonus: 0, totalKm: 0, totalTravelMinutes: 0, openingHoursFeasible: true, reasons: [] };
  }

  const starts = approximateStartTimes(order, dayStart, ctx.speedKmh, ctx.earliestStartMinutes);

  let travelBurden = 0;
  let totalKm = 0;
  let totalTravelMinutes = 0;
  let priorityTotal = 0;
  let timingPenalty = 0;
  let coherencePenalty = 0;
  let prev = dayStart;
  let prevZone: string | null = null;

  order.forEach((p, i) => {
    const legKm = haversineKm(prev.lat, prev.lng, p.coordinates.lat, p.coordinates.lng);
    const travelMins = estimateTravelMinutes(legKm, ctx.speedKmh);
    totalKm += legKm;
    totalTravelMinutes += travelMins;
    travelBurden += Math.min(120, travelMins * 0.8 + legKm * 0.6);
    priorityTotal += placePriorityWeight(p);

    const zoneId = ctx.zoneByPlaceId?.get(p.id);
    if (zoneId && prevZone != null && zoneId !== prevZone) coherencePenalty += 25;
    if (zoneId) prevZone = zoneId;

    // Opening-hour feasibility: trusted hours must be respected (or shiftable).
    const hours = normalizeOpeningHours(p.openingHours);
    if (hours) {
      const atNow = isPlaceOpenAt(hours, ctx.date ?? null, starts[i]);
      if (atNow === false) {
        const shifted = nextOpenMinuteAt(hours, ctx.date ?? null, starts[i]);
        if (shifted == null) {
          timingPenalty += 120; // cannot open in time — bad fit
        } else {
          timingPenalty += 25; // feasible only by shifting later
        }
      }
    }
    prev = p.coordinates;
  });

  // Evening affinity: prefer a sunset/aarti-style stop at the end.
  let eveningBonus = 0;
  const last = order[order.length - 1];
  if (eveningAffinity(last) >= 6) eveningBonus = 20;

  const openingHoursFeasible = timingPenalty === 0;
  const score = Math.round(priorityTotal - travelBurden - timingPenalty - coherencePenalty + eveningBonus);

  const reasons: string[] = [];
  reasons.push(`priority=${Math.round(priorityTotal)} travel=${Math.round(travelBurden)} timing=${Math.round(timingPenalty)} coherence=${Math.round(coherencePenalty)}`);
  reasons.push(`total=${(totalKm * 10 / 10).toFixed(1)}km / ${totalTravelMinutes}m travel (Haversine estimate)`);
  if (!openingHoursFeasible) reasons.push('some stops fall outside trusted opening hours');

  return {
    score,
    travelBurden: Math.round(travelBurden),
    priorityTotal: Math.round(priorityTotal),
    timingPenalty: Math.round(timingPenalty),
    coherencePenalty: Math.round(coherencePenalty),
    eveningBonus,
    totalKm: Math.round(totalKm * 10) / 10,
    totalTravelMinutes,
    openingHoursFeasible,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Day ordering
// ---------------------------------------------------------------------------

export interface OptimizeDayOrderOptions {
  dayStart: GeoCoords;
  speedKmh?: number;
  /** Required relative order: locked place ids first, then fixed-time anchors sorted by time. */
  backboneOrder: string[];
  /** Earliest day start for opening-hour feasibility (minutes-of-day). */
  earliestStartMinutes?: number;
  date?: Date | null;
  preferEveningFinish?: boolean;
  zoneByPlaceId?: Map<string, string>;
  distanceProvider?: 'haversine';
}

export interface OptimizeDayOrderResult {
  order: EnrichedPlace[];
  sequenceScore: SequenceScore;
  totalKm: number;
  totalTravelMinutes: number;
  detourIndex: number;
  openingHoursFeasible: boolean;
}

/**
 * Optimize one day's stop sequence. Backbone (locked/fixed-time) relative order
 * is honored; the rest is routed as segments between the spine. Distance is a
 * soft signal — priority/timing/coherence participate in the score.
 */
export function optimizeDayOrder(places: EnrichedPlace[], options: OptimizeDayOrderOptions): OptimizeDayOrderResult {
  const byId = new Map(places.map((p) => [p.id, p]));
  const speedKmh = options.speedKmh ?? 30;
  const backbone = options.backboneOrder.filter((id) => byId.has(id));
  const backboneSet = new Set(backbone);
  const backbonePlaces = backbone.map((id) => byId.get(id) as EnrichedPlace);
  const free = places.filter((p) => !backboneSet.has(p.id));
  const earliest = options.earliestStartMinutes ?? 9 * 60;

  let order: EnrichedPlace[];
  if (!backbonePlaces.length) {
    order = routeSegment(free, options.dayStart, byId);
  } else {
    const anchors: GeoCoords[] = [options.dayStart, ...backbonePlaces.map((p) => p.coordinates)];
    const n = backbonePlaces.length;
    const buckets: EnrichedPlace[][] = Array.from({ length: n + 1 }, () => []);
    for (const p of free) {
      let best = 0;
      let bestCost = Infinity;
      for (let i = 0; i <= n; i++) {
        const inCost = haversineKm(anchors[i].lat, anchors[i].lng, p.coordinates.lat, p.coordinates.lng);
        const outCost = i < n
          ? haversineKm(p.coordinates.lat, p.coordinates.lng, backbonePlaces[i].coordinates.lat, backbonePlaces[i].coordinates.lng)
          : 0;
        const cost = inCost + outCost;
        if (cost < bestCost) { bestCost = cost; best = i; }
      }
      buckets[best].push(p);
    }
    const result: EnrichedPlace[] = [];
    for (let i = 0; i < n; i++) {
      result.push(...routeSegment(buckets[i], anchors[i], byId), backbonePlaces[i]);
    }
    result.push(...routeSegment(buckets[n], backbonePlaces[n - 1].coordinates, byId));
    order = result;
  }

  if (options.preferEveningFinish !== false && order.length >= 2) {
    order = promoteEveningFinish(order, byId, options.dayStart);
  }

  const scoreCtx: SequenceScoreContext = {
    byId,
    speedKmh,
    earliestStartMinutes: earliest,
    date: options.date ?? null,
    zoneByPlaceId: options.zoneByPlaceId,
    backbone,
  };
  const seqScore = computeSequenceScore(order, scoreCtx, options.dayStart);
  const pts = order.map(toRoutable);
  const detour = routeDetourIndex(pts);

  return {
    order,
    sequenceScore: seqScore,
    totalKm: seqScore.totalKm,
    totalTravelMinutes: seqScore.totalTravelMinutes,
    detourIndex: detour,
    openingHoursFeasible: seqScore.openingHoursFeasible,
  };
}

/** Move a higher-affinity stop to the end when the detour cost is small. */
function promoteEveningFinish(order: EnrichedPlace[], byId: Map<string, EnrichedPlace>, dayStart: GeoCoords): EnrichedPlace[] {
  const last = order[order.length - 1];
  const lastAffinity = eveningAffinity(last);
  const baseLen = order.length > 1
    ? order.reduce((sum, p, i) => {
      const prev = i === 0 ? dayStart : order[i - 1].coordinates;
      return sum + haversineKm(prev.lat, prev.lng, p.coordinates.lat, p.coordinates.lng);
    }, 0)
    : 0;

  let bestOrder = order;
  let bestAffinity = lastAffinity;
  for (let i = 0; i < order.length - 1; i++) {
    const candidatePlace = order[i];
    if (candidatePlace.state.pinned || candidatePlace.state.lockedPosition || candidatePlace.state.fixedTime) continue;
    const affinity = eveningAffinity(candidatePlace);
    if (affinity <= bestAffinity + 2) continue;
    const candidate = [...order.slice(0, i), ...order.slice(i + 1), candidatePlace];
    const len = candidate.reduce((sum, p, idx) => {
      const prev = idx === 0 ? dayStart : candidate[idx - 1].coordinates;
      return sum + haversineKm(prev.lat, prev.lng, p.coordinates.lat, p.coordinates.lng);
    }, 0);
    if (len <= baseLen * 1.12 + 0.5) {
      bestOrder = candidate;
      bestAffinity = affinity;
    }
  }
  return bestOrder;
}

/** Build the backbone spec for a set of places from locked + fixed-time state. */
export function buildBackboneOrder(places: EnrichedPlace[], lockedPlaceIds: readonly string[], fixedTimePlaces: ReadonlyArray<{ placeId: string; startMinutes: number }>): string[] {
  const backbone: string[] = [];
  const seen = new Set<string>();
  for (const id of lockedPlaceIds) {
    if (seen.has(id) && places.some((p) => p.id === id)) continue;
    if (!places.some((p) => p.id === id)) continue;
    if (seen.has(id)) continue;
    backbone.push(id);
    seen.add(id);
  }
  const anchors = [...fixedTimePlaces]
    .filter((f) => places.some((p) => p.id === f.placeId))
    .filter((f) => !seen.has(f.placeId))
    .sort((a, b) => a.startMinutes - b.startMinutes);
  for (const f of anchors) {
    backbone.push(f.placeId);
    seen.add(f.placeId);
  }
  return backbone;
}