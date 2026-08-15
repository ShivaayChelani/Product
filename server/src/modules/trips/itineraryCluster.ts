/**
 * Geographic regional-journey itinerary planner (pure, DB-free).
 *
 * Traveler model:
 *   ANCHOR → EXHAUST THAT AREA COMPLETELY → NEXT AREA
 *
 * Day planning now runs on the zone engine in ./itineraryZones: the pool is cut
 * into real sightseeing areas, one area is chosen per day, and every worthwhile
 * stop in it is visited before the traveler is allowed to drive elsewhere.
 * assignDaysByClusterValue() and buildDayCluster() are thin adapters over it.
 *
 * The scoring helpers below (journeyValueScore, scoreCandidateCluster,
 * scoreDayExcursion, isPrimaryClusterMember, …) remain the published
 * region-analysis API used by callers and the regression suite.
 *
 * PLACE VALUE ≠ JOURNEY VALUE. Region membership ≠ last-stop distance.
 * Debug: ITINERARY_CLUSTER_DEBUG=true.
 */

import {
  buildZoneAround,
  buildZones,
  categoryOf,
  clusterCenterOf,
  clusterDiameterKm,
  estimateTravelMinutes,
  haversineKm,
  importanceScore,
  isAnchorCandidate,
  membershipMinTier,
  packDay,
  planZoneItinerary,
  priorityTier,
  visitMinutes,
  type ClusterPlace,
  type PackOptions,
  type PlannedDayTrace,
} from './itineraryZones';

export {
  absoluteMinTier,
  buildZoneAround,
  buildZones,
  clusterCenterOf,
  clusterDiameterKm,
  experienceValue,
  importanceScore,
  isAnchorCandidate,
  membershipMinTier,
  minAllowedTier,
  priorityTier,
  resolveActiveTierFloor,
  visitMinutes,
  pickVariedCandidate,
  ADJACENT_FILL_MAX_KM,
  MAX_DAY_SPAN_KM,
  MAX_ZONE_DIAMETER_KM,
  NEAR_FREE_STOP_KM,
  ZONE_HUB_RADIUS_KM,
  ZONE_JOIN_RADIUS_KM,
} from './itineraryZones';

export type {
  ClusterPlace,
  PlannedDayTrace,
  Zone,
} from './itineraryZones';

export const ANCHOR_SEPARATION_KM = 12;
export const DIST_NEARBY_KM = 10;
export const DIST_MODERATE_KM = 20;
export const QUALITY_GATE_SCORE = 30;
/** Reject chain candidates beyond this straight-line distance (km). */
export const CHAIN_HARD_REJECT_KM = 25;
/**
 * Max distance from locked cluster geography for 4★/3★ support membership.
 * Separated geographic areas must not enter via last-stop chain scoring.
 */
export const CLUSTER_SUPPORT_KM = 12;
/**
 * Hard cap on pairwise span of a primary cluster. Blocks A→B→C chain growth
 * where ends are far apart even if each hop looks "near" the previous member.
 * Distinct from ANCHOR_SEPARATION_KM (per-anchor proximity semantics).
 */
export const MAX_PRIMARY_CLUSTER_DIAMETER_KM = 16;
/**
 * Max distance from the nearest existing cluster member for a 5★ to join.
 * Prevents two separate outings ~11 km apart from merging solely because each
 * is within ANCHOR_SEPARATION of the other, while still allowing co-5★ that
 * sit in a genuinely compact destination (~≤10 km nearest-neighbor).
 */
export const CO_FIVE_STAR_JOIN_KM = 10;
/**
 * 1-day excursion lock: expand the allow-list to pool places near the
 * selected outing's packed members (not every co-5★ within ANCHOR_SEPARATION).
 * Prevents Madan (~10 km) from crowding Chausath (~0.3 km) out of the lock,
 * while still admitting genuine Bhedaghat companions after time-packing.
 */
export const EXCURSION_LOCK_EXPAND_KM = 8;

export interface ClusterPlannerOptions {
  days: number;
  /** Max stops per day (from pace). */
  maxStopsPerDay: number;
  /** Max activity minutes per day (from pace). */
  maxMinutesPerDay: number;
  /** Trip start / destination centroid for Day 1 (and hotel fallback). */
  origin: { lat: number; lng: number };
  /** Assumed road speed (km/h). Travel TIME preferred over raw distance. */
  speedKmh?: number;
  /**
   * Optional hotel/base per night (1-based day number that STARTS from that base).
   * Example: hotelBaseByDay[2] = hotel after night 1 → Day 2 starts there.
   */
  hotelBaseByDay?: Record<number, { lat: number; lng: number; label?: string }>;
  /** When true, logs reject/select reasons (opt-in via ITINERARY_CLUSTER_DEBUG). */
  debug?: boolean;
  variationSeed?: number;
  avoidHubIds?: string[];
}

export interface DayClusterResult {
  days: ClusterPlace[][];
  plannedDays: PlannedDayTrace[];
  debugLog: string[];
}

function hasTooManySameCategory(stops: ClusterPlace[], candidate: ClusterPlace, maxSame = 2): boolean {
  const cat = categoryOf(candidate);
  const lowValueCats = new Set(['garden', 'park', 'viewpoint']);
  const limit = lowValueCats.has(cat) ? 1 : maxSame;
  return stops.filter((s) => categoryOf(s) === cat).length >= limit;
}

/**
 * Graduated proximity preference from the LAST stop (chain distance).
 * Used for ROUTE ORDERING only — not for cluster membership.
 */
export function proximityBonus(distKm: number): number {
  if (distKm <= 3) return 25;
  if (distKm <= 5) return 20;
  if (distKm <= 10) return 12;
  if (distKm <= 15) return 4;
  if (distKm <= 20) return -5;
  if (distKm <= CHAIN_HARD_REJECT_KM) return -15;
  return -999;
}

export function candidateScore(
  p: ClusterPlace,
  distFromLast: number,
  distFromAnchor: number,
): number {
  const tierScore = priorityTier(p) * 18;
  const proxBonus = proximityBonus(distFromLast);
  const sprawlPenalty = distFromAnchor > ANCHOR_SEPARATION_KM
    ? (distFromAnchor - ANCHOR_SEPARATION_KM) * 1.5
    : 0;
  return tierScore + proxBonus - sprawlPenalty;
}

/** True if adding `candidate` keeps the cluster within the diameter budget. */
export function remainsCompactAfterAdding(
  clusterPlaces: ClusterPlace[],
  candidate: ClusterPlace,
): boolean {
  return clusterDiameterKm([...clusterPlaces, candidate]) <= MAX_PRIMARY_CLUSTER_DIAMETER_KM;
}

/** Distances of a candidate relative to the locked primary cluster. */
export function distanceToCluster(
  p: ClusterPlace,
  anchor: ClusterPlace,
  clusterPlaces: ClusterPlace[],
): {
  fromAnchor: number;
  fromCenter: number;
  fromNearest: number;
  best: number;
} {
  const fromAnchor = haversineKm(anchor.latitude, anchor.longitude, p.latitude, p.longitude);
  const center = clusterCenterOf(clusterPlaces.length ? clusterPlaces : [anchor]);
  const fromCenter = haversineKm(center.lat, center.lng, p.latitude, p.longitude);
  let fromNearest = fromAnchor;
  for (const m of clusterPlaces) {
    const d = haversineKm(m.latitude, m.longitude, p.latitude, p.longitude);
    if (d < fromNearest) fromNearest = d;
  }
  return {
    fromAnchor,
    fromCenter,
    fromNearest,
    best: Math.min(fromAnchor, fromCenter, fromNearest),
  };
}

/**
 * CLUSTER MEMBERSHIP (≠ route order).
 *
 * Requires BOTH proximity to the region AND whole-cluster compactness
 * (no A→B→C chain that stretches the outing).
 *
 * 5★: within ANCHOR_SEPARATION of anchor/center AND within CO_FIVE_STAR_JOIN_KM
 *     of the nearest existing member, AND resulting diameter ≤ max.
 *
 * 4★/3★: within CLUSTER_SUPPORT_KM of locked geography, AND diameter ≤ max.
 * Chain distance from the last stop is NEVER enough to grant membership.
 */
export function isPrimaryClusterMember(
  p: ClusterPlace,
  anchor: ClusterPlace,
  clusterPlaces: ClusterPlace[],
): boolean {
  const core = clusterPlaces.length ? clusterPlaces : [anchor];
  if (!remainsCompactAfterAdding(core, p)) return false;

  const d = distanceToCluster(p, anchor, core);
  if (isAnchorCandidate(p)) {
    const nearRegion =
      d.fromAnchor < ANCHOR_SEPARATION_KM || d.fromCenter < ANCHOR_SEPARATION_KM;
    // Nearest-member gate blocks separate ~11 km outings from merging via
    // mutual ANCHOR_SEPARATION alone (compactness of the outing, not hop chain).
    const nearMember = d.fromNearest <= CO_FIVE_STAR_JOIN_KM;
    return nearRegion && nearMember;
  }
  return d.best <= CLUSTER_SUPPORT_KM;
}

/**
 * Travel cost from the traveler's CURRENT day-start location to a region.
 * Day 2+ dayStart = previous day end (or hotel) — NOT the city centroid.
 */
export function originTravelPenalty(distKm: number, days: number, fromPreviousEndpoint = false): number {
  const travelMins = estimateTravelMinutes(distKm, 30);
  // From previous day's endpoint: strongly prefer nearby remaining regions
  if (fromPreviousEndpoint) {
    return travelMins * 0.9 + distKm * 1.35;
  }
  if (days <= 1) return travelMins * 0.4 + distKm * 0.55;
  // Multi-day Day 1 (city / trip origin): soft penalty so a richer complete
  // region can beat a thin landmark that is merely closer to the centroid.
  if (days <= 3) return travelMins * 0.22 + distKm * 0.28;
  return travelMins * 0.15 + distKm * 0.18;
}

/**
 * JOURNEY VALUE for the next stop — distinct from raw place priority.
 * Region continuity dominates: a close in-region 4★ beats a far out-of-region 5★.
 */
export function journeyValueScore(params: {
  place: ClusterPlace;
  distFromLastKm: number;
  distFromRegionKm: number;
  inRegion: boolean;
  remainingMinutes: number;
  visitMins: number;
  travelMins: number;
  categoryRepeat: boolean;
  /** True only after CURRENT_REGION has no valuable remaining places. */
  regionExhausted?: boolean;
}): { score: number; decision: 'IN_REGION' | 'NEW_REGION' | 'REJECTED'; reason: string } {
  const {
    place, distFromLastKm, distFromRegionKm, inRegion,
    remainingMinutes, visitMins, travelMins, categoryRepeat,
    regionExhausted = false,
  } = params;

  if (travelMins + visitMins > remainingMinutes) {
    return { score: -9999, decision: 'REJECTED', reason: 'day full' };
  }
  if (categoryRepeat) {
    return { score: -9999, decision: 'REJECTED', reason: 'category repetition' };
  }

  let score = importanceScore(place);
  score += Math.min(12, visitMins / 20);

  if (inRegion) {
    // Intra-region next-stop: geographic continuity outweighs small priority gaps.
    // Smooth (not binary): stronger last-stop affinity + continuous km penalty +
    // region-core distance. A nearby 4★ can beat a farther 5★; a distant 1★ cannot.
    score += proximityBonus(distFromLastKm) * 2.25;
    score -= distFromLastKm * 2.8;
    score += 50; // finish the geographic excursion before leaving
    score -= Math.max(0, distFromRegionKm - 1.5) * 2.0;
    if (priorityTier(place) >= 4) score += 8;
    return {
      score,
      decision: 'IN_REGION',
      reason: 'in-region journey value',
    };
  }

  // Outside CURRENT_REGION — never win on individual priority alone.
  // Route proximity still applies (weaker than in-region) for the rare secondary path.
  score += proximityBonus(distFromLastKm) * 1.15;
  if (!regionExhausted) {
    return {
      score: -9999,
      decision: 'REJECTED',
      reason: 'outside region',
    };
  }
  if (isAnchorCandidate(place)) {
    return {
      score: -9999,
      decision: 'REJECTED',
      reason: 'separated 5★ reserved for future region',
    };
  }

  score -= 20;
  score -= distFromRegionKm * 0.85;
  score -= Math.max(0, distFromLastKm - 6) * 0.9;
  // Productive use of remaining day after the locked region is done
  score += Math.min(35, remainingMinutes / 12);
  if (distFromLastKm > 18 && distFromRegionKm > 16) {
    score -= 22; // backtracking / long hop
  }

  if (score < QUALITY_GATE_SCORE) {
    return {
      score,
      decision: 'REJECTED',
      reason: 'low journey value / excessive travel',
    };
  }

  return {
    score,
    decision: 'NEW_REGION',
    reason: 'region exhausted; feasible secondary area',
  };
}

/**
 * Expand a candidate anchor into its geographic cluster members.
 * Nearby 5★ within ANCHOR_SEPARATION belong together; then nearby 4★/3★.
 */
export function buildCandidateClusterMembers(
  anchor: ClusterPlace,
  pool: ClusterPlace[],
  usedIds: Set<string>,
  days: number,
  maxStops: number,
): ClusterPlace[] {
  const minTier = membershipMinTier(days);
  const members: ClusterPlace[] = [anchor];
  const memberIds = new Set<string>([anchor.id]);

  // Co-5★ that geographically belong to this cluster
  const coFive = pool
    .filter((p) => !usedIds.has(p.id) && !memberIds.has(p.id) && isAnchorCandidate(p))
    .filter((p) => priorityTier(p) >= minTier)
    .filter((p) => isPrimaryClusterMember(p, anchor, members))
    .sort((a, b) => importanceScore(b) - importanceScore(a));

  for (const p of coFive) {
    if (members.length >= maxStops) break;
    members.push(p);
    memberIds.add(p.id);
  }

  // Supporting 4★/3★ inside cluster geography
  const supports = pool
    .filter((p) => !usedIds.has(p.id) && !memberIds.has(p.id))
    .filter((p) => !isAnchorCandidate(p))
    .filter((p) => priorityTier(p) >= minTier)
    .filter((p) => isPrimaryClusterMember(p, anchor, members))
    .sort((a, b) => {
      const tierDiff = priorityTier(b) - priorityTier(a);
      if (tierDiff !== 0) return tierDiff;
      const da = haversineKm(anchor.latitude, anchor.longitude, a.latitude, a.longitude);
      const db = haversineKm(anchor.latitude, anchor.longitude, b.latitude, b.longitude);
      return da - db;
    });

  for (const p of supports) {
    if (members.length >= maxStops) break;
    members.push(p);
    memberIds.add(p.id);
  }

  return members;
}

export interface CandidateClusterScore {
  anchor: ClusterPlace;
  score: number;
  members: ClusterPlace[];
  /** Stable signature of 5★ members for deduplicating the same geographic cluster. */
  clusterKey: string;
  experienceValue: number;
  originCost: number;
  routeCost: number;
  reason: string;
}

/**
 * CLUSTER-FIRST score: aggregate experience of the whole geographic cluster.
 *
 * Do NOT let a single place's rating dominate. A rich 5★+5★+4★+3★ cluster
 * must beat an isolated 5★ even if that isolated place has a slightly higher
 * individual score.
 */
export function scoreCandidateCluster(
  anchor: ClusterPlace,
  pool: ClusterPlace[],
  usedIds: Set<string>,
  days: number,
  maxStops: number,
  /** Current day start — Day 1 origin or previous day end / hotel. */
  dayStart: { lat: number; lng: number },
  speedKmh = 30,
  /** Day 2+: dayStart is previous endpoint — weight proximity harder. */
  fromPreviousEndpoint = false,
): CandidateClusterScore {
  const members = buildCandidateClusterMembers(anchor, pool, usedIds, days, maxStops);
  const fiveStarMembers = members.filter((p) => isAnchorCandidate(p));
  const clusterKey = fiveStarMembers
    .map((p) => p.id)
    .sort()
    .join('|') || anchor.id;

  const dayMembers = [...members]
    .sort((a, b) => importanceScore(b) - importanceScore(a))
    .slice(0, maxStops);

  let experienceValue = 0;
  for (const m of dayMembers) {
    experienceValue += importanceScore(m);
    if (isAnchorCandidate(m) && m.id !== anchor.id) {
      experienceValue += 22;
    } else if (priorityTier(m) >= 4 && m.id !== anchor.id) {
      experienceValue += 10;
    } else if (priorityTier(m) === 3 && m.id !== anchor.id) {
      experienceValue += 4;
    }
  }

  experienceValue += Math.min(dayMembers.length, maxStops) * 6;
  const uniqueCats = new Set(dayMembers.map((p) => categoryOf(p)));
  experienceValue += uniqueCats.size * 8;

  // Multi-5★ compact outings are complete-day destinations, not single landmarks
  const destinationQualityBonus =
    fiveStarMembers.length >= 3 ? 28 : fiveStarMembers.length >= 2 ? 14 : 0;
  experienceValue += destinationQualityBonus;

  let regionalDensity = 0;
  const diameter = clusterDiameterKm(dayMembers);
  if (dayMembers.length > 1) {
    const center = clusterCenterOf(dayMembers);
    const avgDist =
      dayMembers.reduce(
        (s, p) => s + haversineKm(center.lat, center.lng, p.latitude, p.longitude),
        0,
      ) / dayMembers.length;
    regionalDensity = Math.max(0, 18 - avgDist * 1.5);
    experienceValue += regionalDensity;
  }
  // Prefer geographically tight regions; soft penalty if span grows
  const compactBonus =
    diameter <= 5 ? 16 : diameter <= 8 ? 10 : diameter <= 12 ? 4 : 0;
  experienceValue += compactBonus;
  const diameterSprawl = diameter > 12 ? (diameter - 12) * 2.5 : 0;

  // currentDayStartProximity — NEVER recompute from city centroid on Day 2+
  const distFromDayStart = haversineKm(dayStart.lat, dayStart.lng, anchor.latitude, anchor.longitude);
  const originCost = originTravelPenalty(distFromDayStart, days, fromPreviousEndpoint);

  let routeOrdered = [anchor, ...dayMembers.filter((m) => m.id !== anchor.id)];
  routeOrdered = routeOptimize(routeOrdered);
  let routeCostKm = 0;
  for (let i = 1; i < routeOrdered.length; i++) {
    routeCostKm += haversineKm(
      routeOrdered[i - 1].latitude,
      routeOrdered[i - 1].longitude,
      routeOrdered[i].latitude,
      routeOrdered[i].longitude,
    );
  }
  const routeCost = routeCostKm * 1.1 + estimateTravelMinutes(routeCostKm, speedKmh) * 0.15;

  const pinBoost = anchor.isPinned ? 40 : 0;

  let isolationPenalty = 0;
  if (dayMembers.length <= 1 && !anchor.isPinned) {
    isolationPenalty = days <= 1 ? 35 : 22;
  } else if (fiveStarMembers.length <= 1 && dayMembers.length <= 2 && days <= 1) {
    isolationPenalty = 12;
  } else if (fiveStarMembers.length <= 1 && dayMembers.length <= 2 && days >= 2) {
    isolationPenalty = 10;
  }

  const backtrackingCost = fromPreviousEndpoint && distFromDayStart > 25
    ? (distFromDayStart - 25) * 1.1
    : 0;
  const sprawlCost = routeCostKm > 40 ? (routeCostKm - 40) * 0.8 : 0;

  const score =
    experienceValue
    + pinBoost
    - originCost
    - routeCost
    - isolationPenalty
    - backtrackingCost
    - sprawlCost
    - diameterSprawl;

  const reason =
    `exp=${experienceValue.toFixed(0)} density=${regionalDensity.toFixed(0)} `
    + `members=${dayMembers.length} five★=${fiveStarMembers.length} `
    + `diameter=${diameter.toFixed(1)}km compact=${compactBonus} `
    + `dayStartDist=${distFromDayStart.toFixed(1)}km originCost=${originCost.toFixed(0)} `
    + `routeCost=${routeCost.toFixed(0)} backtrack=${backtrackingCost.toFixed(0)} `
    + `sprawl=${sprawlCost.toFixed(0)} diamSprawl=${diameterSprawl.toFixed(0)} `
    + `=> ${score.toFixed(0)}`;

  return {
    anchor,
    score,
    members: dayMembers,
    clusterKey,
    experienceValue,
    originCost,
    routeCost,
    reason,
  };
}

/** @deprecated Use scoreCandidateCluster — kept as thin wrapper for older call sites/tests. */
export function scoreAnchorCluster(
  anchor: ClusterPlace,
  pool: ClusterPlace[],
  usedIds: Set<string>,
  days: number,
  maxStops: number,
  origin: { lat: number; lng: number },
  fromPreviousEndpoint = false,
): number {
  return scoreCandidateCluster(
    anchor, pool, usedIds, days, maxStops, origin, 30, fromPreviousEndpoint,
  ).score;
}

/**
 * Pick the best geographic cluster among candidates (CLUSTER-FIRST).
 * Overlapping hubs that share the same 5★ membership collapse to one cluster.
 */
export function selectBestCandidateCluster(
  candidates: ClusterPlace[],
  pool: ClusterPlace[],
  usedIds: Set<string>,
  days: number,
  maxStops: number,
  dayStart: { lat: number; lng: number },
  speedKmh = 30,
  fromPreviousEndpoint = false,
): CandidateClusterScore | null {
  if (!candidates.length) return null;

  const scored = candidates.map((p) =>
    scoreCandidateCluster(p, pool, usedIds, days, maxStops, dayStart, speedKmh, fromPreviousEndpoint),
  );

  const bestByKey = new Map<string, CandidateClusterScore>();
  for (const row of scored) {
    const prev = bestByKey.get(row.clusterKey);
    if (!prev || row.score > prev.score) {
      bestByKey.set(row.clusterKey, row);
    }
  }

  const unique = Array.from(bestByKey.values()).sort((a, b) => b.score - a.score);
  const winner = unique[0] || null;
  if (!winner) return null;

  const fiveInCluster = winner.members.filter((p) => isAnchorCandidate(p));
  if (fiveInCluster.length > 1) {
    const bestHub = fiveInCluster
      .map((hub) => ({
        hub,
        score: scoreCandidateCluster(
          hub, pool, usedIds, days, maxStops, dayStart, speedKmh, fromPreviousEndpoint,
        ).score,
      }))
      .sort((a, b) => b.score - a.score)[0]?.hub;
    if (bestHub && bestHub.id !== winner.anchor.id) {
      return scoreCandidateCluster(
        bestHub, pool, usedIds, days, maxStops, dayStart, speedKmh, fromPreviousEndpoint,
      );
    }
  }

  return winner;
}

export interface DayExcursionScore {
  anchor: ClusterPlace;
  score: number;
  members: ClusterPlace[];
  clusterKey: string;
  fiveStarCount: number;
  fourStarCount: number;
  threeStarCount: number;
  totalPriorityValue: number;
  totalExperienceValue: number;
  totalVisitMinutes: number;
  originTravelMinutes: number;
  totalRouteMinutes: number;
  routeDistanceKm: number;
  experienceDensity: number;
  reason: string;
}

/**
 * Soft origin travel for 1-day excursions — travel is a penalty, never a veto.
 * A destination ~30 min farther with 4× the attractions must still be able to win.
 */
export function excursionOriginTravelCost(distKm: number, speedKmh = 30): number {
  const travelMins = estimateTravelMinutes(distKm, speedKmh);
  return travelMins * 0.18 + distKm * 0.22;
}

/**
 * 1-DAY ONLY: score a complete day excursion around an anchor.
 * Aggregates ALL valuable attractions that fit a realistic day — not single-place score.
 */
export function scoreDayExcursion(
  anchor: ClusterPlace,
  pool: ClusterPlace[],
  usedIds: Set<string>,
  options: {
    maxStops: number;
    maxMinutes: number;
    origin: { lat: number; lng: number };
    speedKmh?: number;
  },
): DayExcursionScore {
  const speed = options.speedKmh ?? 30;
  const members = buildCandidateClusterMembers(
    anchor, pool, usedIds, 1, options.maxStops,
  );

  // Prefer visiting high-value members first when packing the day
  const orderedCandidates = [...members].sort((a, b) => {
    const tierDiff = priorityTier(b) - priorityTier(a);
    if (tierDiff !== 0) return tierDiff;
    return importanceScore(b) - importanceScore(a);
  });

  // Build a feasible route: origin → anchor → greedy in-region NN by journey value
  const route: ClusterPlace[] = [anchor];
  const inRoute = new Set<string>([anchor.id]);
  let usedMins = visitMinutes(anchor);
  const distOrigin = haversineKm(
    options.origin.lat, options.origin.lng, anchor.latitude, anchor.longitude,
  );
  const originTravelMinutes = estimateTravelMinutes(distOrigin, speed);
  usedMins += originTravelMinutes; // travel to region counts against the day

  while (route.length < options.maxStops) {
    const last = route[route.length - 1];
    let best: ClusterPlace | null = null;
    let bestScore = -Infinity;
    let bestTravel = 0;
    let bestVisit = 0;

    for (const p of orderedCandidates) {
      if (inRoute.has(p.id) || usedIds.has(p.id)) continue;
      if (!isPrimaryClusterMember(p, anchor, route)) continue;
      if (hasTooManySameCategory(route, p)) continue;

      const dist = haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
      const travel = estimateTravelMinutes(dist, speed);
      const visit = visitMinutes(p);
      if (usedMins + travel + visit > options.maxMinutes) continue;

      // Prefer high priority + close + route efficient within excursion
      const s = importanceScore(p) + proximityBonus(dist) + (priorityTier(p) >= 5 ? 25 : priorityTier(p) >= 4 ? 12 : 0);
      if (s > bestScore) {
        bestScore = s;
        best = p;
        bestTravel = travel;
        bestVisit = visit;
      }
    }
    if (!best) break;
    route.push(best);
    inRoute.add(best.id);
    usedMins += bestTravel + bestVisit;
  }

  const dayMembers = routeOptimize(route);
  let routeDistanceKm = 0;
  for (let i = 1; i < dayMembers.length; i++) {
    routeDistanceKm += haversineKm(
      dayMembers[i - 1].latitude, dayMembers[i - 1].longitude,
      dayMembers[i].latitude, dayMembers[i].longitude,
    );
  }
  // Include origin → first stop in total travel accounting
  routeDistanceKm += distOrigin;
  const totalRouteMinutes = estimateTravelMinutes(routeDistanceKm, speed);

  let totalPriorityValue = 0;
  let totalVisitMinutes = 0;
  let fiveStarCount = 0;
  let fourStarCount = 0;
  let threeStarCount = 0;
  for (const m of dayMembers) {
    totalPriorityValue += importanceScore(m);
    totalVisitMinutes += visitMinutes(m);
    const t = priorityTier(m);
    if (t >= 5) fiveStarCount += 1;
    else if (t >= 4) fourStarCount += 1;
    else if (t >= 3) threeStarCount += 1;
  }

  // Absolute experience — multi-5★ regions dominate sparse nearby singles
  let totalExperienceValue = totalPriorityValue;
  totalExperienceValue += Math.max(0, fiveStarCount - 1) * 42; // co-5★ richness
  totalExperienceValue += fourStarCount * 14;
  totalExperienceValue += threeStarCount * 5;
  totalExperienceValue += dayMembers.length * 8;

  const uniqueCats = new Set(dayMembers.map((p) => categoryOf(p)));
  const categoryDiversityBonus = uniqueCats.size * 10;

  let geographicDensityBonus = 0;
  if (dayMembers.length > 1) {
    const center = clusterCenterOf(dayMembers);
    const avgDist =
      dayMembers.reduce(
        (s, p) => s + haversineKm(center.lat, center.lng, p.latitude, p.longitude),
        0,
      ) / dayMembers.length;
    geographicDensityBonus = Math.max(0, 22 - avgDist * 1.6);
  }

  const routeEfficiencyBonus = Math.max(0, 18 - Math.max(0, routeDistanceKm - distOrigin - 8) * 0.7);
  const destinationQualityBonus = fiveStarCount >= 3 ? 35 : fiveStarCount >= 2 ? 18 : 0;

  const originTravelCost = excursionOriginTravelCost(distOrigin, speed);
  const totalTravelTimePenalty = totalRouteMinutes * 0.12;
  const routeSprawlPenalty = routeDistanceKm > 45 ? (routeDistanceKm - 45) * 0.9 : 0;
  const backtrackingPenalty = 0; // NN route already minimizes; reserved for future road routing

  const pinBoost = anchor.isPinned ? 80 : 0;

  // Thin nearby "excursions" lose hard on 1-day
  let thinPenalty = 0;
  if (fiveStarCount <= 1 && dayMembers.length <= 2 && !anchor.isPinned) {
    thinPenalty = 40;
  }

  const denom = Math.max(30, originTravelMinutes + totalVisitMinutes);
  const experienceDensity = totalExperienceValue / denom;
  const densityBonus = Math.min(40, experienceDensity * 8);

  const score =
    totalPriorityValue
    + totalExperienceValue * 0.55
    + fiveStarCount * 28
    + geographicDensityBonus
    + categoryDiversityBonus
    + routeEfficiencyBonus
    + destinationQualityBonus
    + densityBonus
    + pinBoost
    - originTravelCost
    - totalTravelTimePenalty
    - routeSprawlPenalty
    - backtrackingPenalty
    - thinPenalty;

  const fiveIds = dayMembers.filter((p) => isAnchorCandidate(p)).map((p) => p.id).sort();
  const clusterKey = fiveIds.join('|') || anchor.id;

  const reason =
    `5★=${fiveStarCount} 4★=${fourStarCount} 3★=${threeStarCount} `
    + `exp=${totalExperienceValue.toFixed(0)} visit=${totalVisitMinutes}m `
    + `originTravel=${originTravelMinutes}m route=${routeDistanceKm.toFixed(1)}km `
    + `routeMins=${totalRouteMinutes} density=${experienceDensity.toFixed(2)} `
    + `=> ${score.toFixed(0)}`;

  return {
    anchor,
    score,
    members: dayMembers,
    clusterKey,
    fiveStarCount,
    fourStarCount,
    threeStarCount,
    totalPriorityValue,
    totalExperienceValue,
    totalVisitMinutes,
    originTravelMinutes,
    totalRouteMinutes,
    routeDistanceKm,
    experienceDensity,
    reason,
  };
}

/**
 * 1-DAY ONLY: compare complete day excursions and pick the best outing.
 * Pinned places force their excursion. Soft origin distance — richness wins.
 */
export function selectBestDayExcursion(
  candidates: ClusterPlace[],
  pool: ClusterPlace[],
  usedIds: Set<string>,
  options: {
    maxStops: number;
    maxMinutes: number;
    origin: { lat: number; lng: number };
    speedKmh?: number;
    debug?: boolean;
  },
  debugLog: string[] = [],
): DayExcursionScore | null {
  if (!candidates.length) return null;

  const pins = candidates.filter((p) => p.isPinned);
  const hubs = pins.length ? pins : candidates;

  const scored = hubs.map((h) =>
    scoreDayExcursion(h, pool, usedIds, {
      maxStops: options.maxStops,
      maxMinutes: options.maxMinutes,
      origin: options.origin,
      speedKmh: options.speedKmh,
    }),
  );

  // Collapse overlapping hubs that describe the same 5★ set
  const bestByKey = new Map<string, DayExcursionScore>();
  for (const row of scored) {
    const prev = bestByKey.get(row.clusterKey);
    if (!prev || row.score > prev.score) bestByKey.set(row.clusterKey, row);
  }
  const unique = Array.from(bestByKey.values()).sort((a, b) => b.score - a.score);

  if (options.debug || process.env.ITINERARY_CLUSTER_DEBUG === 'true') {
    for (const row of unique.slice(0, 8)) {
      const line =
        'EXCURSION: ' + row.anchor.name
        + ' region=' + row.members.map((m) => m.name).join('+')
        + ' | ' + row.reason;
      debugLog.push(line);
    }
  }

  const winner = unique[0] || null;
  if (!winner) return null;

  // Within winning excursion, prefer densest / highest-value 5★ as the displayed anchor
  const five = winner.members.filter((p) => isAnchorCandidate(p));
  if (five.length > 1 && !winner.anchor.isPinned) {
    const center = clusterCenterOf(winner.members);
    const bestHub = [...five].sort((a, b) => {
      const ia = importanceScore(a);
      const ib = importanceScore(b);
      if (Math.abs(ib - ia) > 2) return ib - ia;
      const da = haversineKm(center.lat, center.lng, a.latitude, a.longitude);
      const db = haversineKm(center.lat, center.lng, b.latitude, b.longitude);
      return da - db;
    })[0];
    if (bestHub && bestHub.id !== winner.anchor.id) {
      const rescored = scoreDayExcursion(bestHub, pool, usedIds, {
        maxStops: options.maxStops,
        maxMinutes: options.maxMinutes,
        origin: options.origin,
        speedKmh: options.speedKmh,
      });
      if (options.debug || process.env.ITINERARY_CLUSTER_DEBUG === 'true') {
        debugLog.push('SELECTED EXCURSION: ' + rescored.anchor.name + ' score=' + rescored.score.toFixed(1));
      }
      return rescored;
    }
  }

  if (options.debug || process.env.ITINERARY_CLUSTER_DEBUG === 'true') {
    debugLog.push('SELECTED EXCURSION: ' + winner.anchor.name + ' score=' + winner.score.toFixed(1));
  }

  return winner;
}

/**
 * Final intra-day order: keep region anchor first, then greedily pick the next
 * stop by local journey value (last-stop proximity + mild tourist value +
 * affinity to the region anchor). Pure distance-only NN can chain away from
 * the region core toward a string of middling places.
 */
function routeOptimize(stops: ClusterPlace[]): ClusterPlace[] {
  if (stops.length <= 2) return stops;
  const ordered: ClusterPlace[] = [stops[0]];
  const remaining = stops.slice(1);
  const anchor = stops[0];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const dLast = haversineKm(
        last.latitude, last.longitude,
        p.latitude, p.longitude,
      );
      const dAnchor = haversineKm(
        anchor.latitude, anchor.longitude,
        p.latitude, p.longitude,
      );
      // Current stop dominates; anchor affinity breaks near-ties toward the core.
      const s =
        proximityBonus(dLast) * 2.25
        - dLast * 2.8
        - dAnchor * 2.2
        + importanceScore(p) * 0.35;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

/**
 * Build one day around a caller-chosen anchor.
 *
 * The anchor's zone is exhausted first — every worthwhile place in that area is
 * visited before the day is allowed to move on — and only leftover time can be
 * spent on an immediately adjacent area. `allowedPlaceIds` narrows the pool;
 * `lockToAllowedSet` additionally forbids the adjacent-area top-up.
 */
export function buildDayCluster(
  anchor: ClusterPlace,
  pool: ClusterPlace[],
  usedIds: Set<string>,
  options: Pick<ClusterPlannerOptions, 'days' | 'maxStopsPerDay' | 'maxMinutesPerDay' | 'speedKmh' | 'debug'> & {
    allowedPlaceIds?: Set<string>;
    lockToAllowedSet?: boolean;
  },
  debugLog: string[],
): ClusterPlace[] {
  const debug = !!options.debug || process.env.ITINERARY_CLUSTER_DEBUG === 'true';
  const allowed = options.allowedPlaceIds;
  const scoped = allowed
    ? pool.filter((p) => p.id === anchor.id || p.isPinned || allowed.has(p.id))
    : pool;

  if (debug && allowed) {
    for (const p of pool) {
      if (scoped.some((s) => s.id === p.id)) continue;
      debugLog.push('Rejected: ' + p.name + ' reason: OUTSIDE_SELECTED_EXCURSION');
    }
  }

  const baseZone = buildZoneAround(anchor, scoped, usedIds);
  // A place the user pinned must be reachable even when it sits outside the
  // anchor's geography — user intent outranks the zone boundary.
  const forcedPins = scoped.filter(
    (p) => p.isPinned && !usedIds.has(p.id) && !baseZone.places.some((z) => z.id === p.id),
  );
  const zone = forcedPins.length
    ? { ...baseZone, places: [...baseZone.places, ...forcedPins] }
    : baseZone;

  const zoneIds = new Set(zone.places.map((p) => p.id));
  const neighbours = options.lockToAllowedSet
    ? []
    : buildZones(scoped.filter((p) => !zoneIds.has(p.id) && !usedIds.has(p.id)));

  const packOptions: PackOptions = {
    days: options.days,
    maxStopsPerDay: options.maxStopsPerDay,
    maxMinutesPerDay: options.maxMinutesPerDay,
    speedKmh: options.speedKmh ?? 30,
    tierFloor: membershipMinTier(options.days),
    allowCompactBonus: true,
    seedId: anchor.id,
    debug,
  };

  const packed = packDay(
    zone,
    [zone, ...neighbours],
    usedIds,
    { lat: anchor.latitude, lng: anchor.longitude },
    packOptions,
  );

  for (const stop of packed.stops) usedIds.add(stop.id);

  if (debug) {
    debugLog.push(
      'REGION ' + anchor.name + ' — zone of ' + zone.places.length
        + ' places, span ' + zone.diameterKm.toFixed(1) + 'km',
    );
    debugLog.push(...packed.decisions);
    debugLog.push('DAY STOPS: ' + packed.stops.map((s) => s.name).join(' → '));
  }

  return packed.stops;
}

/**
 * Assign every day of the trip to a geographic zone and route it.
 *
 * Day 1 starts at the trip origin; Day N starts from where Day N-1 ended (or the
 * night's hotel), so the plan progresses area by area instead of bouncing back
 * across the map. See ./itineraryZones for the algorithm.
 */
export function assignDaysByClusterValue(
  pool: ClusterPlace[],
  options: ClusterPlannerOptions,
): DayClusterResult {
  return planZoneItinerary(pool, {
    days: options.days,
    maxStopsPerDay: options.maxStopsPerDay,
    maxMinutesPerDay: options.maxMinutesPerDay,
    origin: options.origin,
    speedKmh: options.speedKmh,
    hotelBaseByDay: options.hotelBaseByDay,
    debug: options.debug,
    variationSeed: options.variationSeed,
    avoidHubIds: options.avoidHubIds,
  });
}

