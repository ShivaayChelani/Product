import type { Dispatch, SetStateAction } from 'react';
import type { TripPlanResult, TripPlanDay, TripPlanStop } from '../services/api/ai';
import type { TouristSpot, UserProfile } from '../types';
import { cacheItineraryPlace } from './itineraryPlacesCache';
import { canonicalizeDestination, formatDestinationLabel, placeBelongsToDestination } from './destination';
import { INDIA_CANONICAL_DESTINATIONS, INDIA_DESTINATION_ALIASES } from '../../shared/indiaDestinationAliases';
import { haversineDistanceKm } from '../services/location/distance';

/** Major India destinations for prompt/city inference — aliases + canonical cities. */
export const INDIA_DESTINATIONS = [
  ...new Set([
    ...Object.keys(INDIA_DESTINATION_ALIASES).map((k) => formatDestinationLabel(k)),
    ...INDIA_CANONICAL_DESTINATIONS.map((k) => formatDestinationLabel(k)),
  ]),
].sort((a, b) => b.length - a.length);

const INTEREST_CATEGORY_MAP: Record<string, string[]> = {
  temples: ['temple', 'church', 'mosque', 'gurudwara', 'spiritual', 'ghat'],
  heritage: ['heritage', 'fort', 'palace', 'museum', 'history', 'monument', 'cultural'],
  waterfalls: ['waterfall'],
  nature: ['nature', 'park', 'garden', 'wildlife', 'lake', 'viewpoint', 'river', 'waterfall'],
  food: ['food', 'market', 'local_experience', 'restaurant', 'cafe'],
  adventure: ['adventure', 'waterfall', 'wildlife', 'trek', 'viewpoint'],
  shopping: ['market', 'shopping', 'bazaar', 'local_experience'],
  'hidden gems': [],
  'local culture': ['cultural', 'museum', 'heritage', 'palace', 'local_experience', 'market'],
  // Legacy UI labels kept for backwards-compat with older suggested-trip presets.
  spiritual: ['spiritual', 'temple', 'church', 'ghat', 'mosque'],
  beaches: ['beach', 'nature', 'lake'],
  culture: ['cultural', 'museum', 'heritage', 'palace', 'local_experience'],
};

function normalizeInterestKey(label: string): string {
  return label.trim().toLowerCase();
}

export function inferTripDestination(prompt: string, selectedInterests: string[] = []): string {
  const lower = `${prompt || ''}`.toLowerCase();

  // Prefer longer names first (e.g. "Mahabalipuram" before "a")
  const ranked = [...INDIA_DESTINATIONS].sort((a, b) => b.length - a.length);
  for (const city of ranked) {
    if (lower.includes(city.toLowerCase())) {
      return formatDestinationLabel(canonicalizeDestination(city) || city);
    }
  }

  // "trip to X" / "visit X" / "in X"
  const patterns = [
    /(?:trip|travel|visit|tour|explore|itinerary|holiday|vacation)\s+(?:to|in|around|for)\s+([a-zA-Z\s]{3,30})/i,
    /(?:to|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m?.[1]) {
      const candidate = m[1].trim().replace(/[.!,].*$/, '');
      const known = INDIA_DESTINATIONS.find(c => c.toLowerCase() === candidate.toLowerCase());
      if (known) return formatDestinationLabel(canonicalizeDestination(known) || known);
      if (candidate.length >= 3 && candidate.length <= 24) {
        return formatDestinationLabel(candidate);
      }
    }
  }

  if (selectedInterests.includes('Beaches') || selectedInterests.includes('beaches')) return 'Goa';
  if (selectedInterests.includes('Spiritual') || selectedInterests.includes('temples')) return 'Varanasi';
  if (selectedInterests.includes('Heritage') || selectedInterests.includes('heritage')) return 'Jaipur';
  // Empty string forces the UI to ask for a city — never invent the wrong destination.
  return '';
}

export function buildTripPrompt(options: {
  prompt?: string;
  location: string;
  days: number;
  pace: string;
  interests?: string[];
}): string {
  const { prompt, location, days, pace, interests = [] } = options;
  const interestText = interests.length ? interests.join(', ') : 'top attractions, local experiences';
  const base = `Plan a complete ${days}-day ${pace} trip to ${location}, India. Focus on: ${interestText}. Include morning, afternoon and evening stops each day with realistic travel flow across the destination.`;
  if (prompt?.trim()) {
    return `${prompt.trim()}\n\nAlso follow these parameters: destination=${location}, days=${days}, pace=${pace}, interests=${interestText}.`;
  }
  return base;
}

export function extractPlaceIdsFromAiPlan(aiPlan: TripPlanResult): string[] {
  const placeIds: string[] = [];
  const sortedDays = [...(aiPlan.days || [])].sort((a, b) => a.day - b.day);
  for (const day of sortedDays) {
    const sortedStops = [...(day.stops || [])].sort((a, b) => a.order - b.order);
    for (const stop of sortedStops) {
      if (stop.placeId) placeIds.push(stop.placeId);
    }
  }
  return placeIds;
}

function stopToSpot(stop: TripPlanStop, locationHint?: string): TouristSpot {
  return {
    id: stop.placeId,
    name: stop.name,
    city: locationHint || '',
    state: '',
    latitude: stop.latitude,
    longitude: stop.longitude,
    category: (stop.category as TouristSpot['category']) || 'heritage',
    difficulty: 'easy',
    description: stop.description || '',
    shortDescription: stop.description || '',
    imageUri: null,
    points: 50,
  };
}

/** Persist AI/local plan stops so ItineraryScreen can resolve them by id. */
export function applyAiPlanToLocalItinerary(
  aiPlan: TripPlanResult,
  setUser: Dispatch<SetStateAction<UserProfile>>,
  locationHint?: string,
) {
  const placeIds: string[] = [];
  const sortedDays = [...(aiPlan.days || [])].sort((a, b) => a.day - b.day);
  for (const day of sortedDays) {
    const sortedStops = [...(day.stops || [])].sort((a, b) => a.order - b.order);
    for (const stop of sortedStops) {
      if (!stop?.placeId) continue;
      placeIds.push(stop.placeId);
      cacheItineraryPlace(stopToSpot(stop, locationHint));
    }
  }

  setUser(prev => ({
    ...prev,
    currentItinerary: placeIds,
    completedItineraryStops: [],
  }));
}

function interestMatchesPlace(place: TouristSpot, interests: string[]): boolean {
  if (!interests.length) return true;
  const cat = (place.category || '').toLowerCase();
  const tags = (place.tags || []).map(t => t.toLowerCase());
  const blob = `${place.name} ${place.description || ''} ${place.shortDescription || ''}`.toLowerCase();

  return interests.some(label => {
    const key = normalizeInterestKey(label);
    const mapped = INTEREST_CATEGORY_MAP[key] || [key];
    return mapped.some(token =>
      cat.includes(token) ||
      tags.some(t => t.includes(token)) ||
      blob.includes(token)
    );
  });
}

function matchesDestination(place: TouristSpot, location: string): boolean {
  return placeBelongsToDestination(
    { city: place.city, state: place.state, name: place.name },
    location,
  );
}

function stopsPerDayForPace(pace: string): number {
  const key = (pace || '').toUpperCase();
  if (key === 'VERY_RELAXED') return 4;
  if (key === 'RELAXED') return 5;
  if (key === 'QUICK' || key === 'INTENSIVE') return 7;
  return 6;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const km = haversineDistanceKm(aLat, aLng, bLat, bLng);
  return Number.isFinite(km) ? km : Number.POSITIVE_INFINITY;
}

// ─── Distance thresholds (km) ────────────────────────────────────────────────
const DIST_VERY_CLOSE = 3;
const DIST_CLOSE = 5;
const DIST_NEARBY = 10;
const DIST_MODERATE = 20;

// ─── Estimated visit durations by category (minutes) ─────────────────────────
const CATEGORY_DURATION: Record<string, number> = {
  fort: 120,
  palace: 90,
  heritage: 90,
  museum: 75,
  temple: 60,
  church: 45,
  mosque: 45,
  spiritual: 60,
  waterfall: 60,
  nature: 75,
  park: 60,
  garden: 45,
  lake: 60,
  viewpoint: 45,
  adventure: 60,
  wildlife: 120,
  cultural: 75,
  market: 60,
  beach: 90,
  default: 60,
};

// ─── Travel speed assumption: 25 km/h in Indian cities/hilly terrain ──────────
const AVG_SPEED_KM_H = 25;

function estimateTravelMinutes(distKm: number): number {
  return Math.round((distKm / AVG_SPEED_KM_H) * 60) + 10; // +10 min buffer
}

function categoryOf(p: TouristSpot): string {
  return (p.category || 'default').toLowerCase();
}

function visitDuration(p: TouristSpot): number {
  const cat = categoryOf(p);
  const raw = p.estimatedDuration ?? CATEGORY_DURATION[cat] ?? CATEGORY_DURATION.default;
  if (cat === 'wildlife' || cat === 'trek') return raw;
  return Math.min(raw, 75);
}

/**
 * Composite importance score for a place.
 * Combines rating/mustVisit/points — NOT distance.
 */
function importanceScore(p: TouristSpot): number {
  const rating = p.rating ?? 0;          // 0–5
  const mustVisit = p.mustVisit ? 2 : 0;
  const pts = (p.points ?? 0) / 100;    // normalised bonus
  return rating * 10 + mustVisit * 5 + pts;
}

/**
 * Final placement score balancing importance + proximity.
 * proxKm is distance from the current context (anchor or previous stop).
 */
function placementScore(p: TouristSpot, proxKm: number): number {
  const imp = importanceScore(p);
  // Proximity bonus: up to +20 at 0 km, fades to 0 at ~30 km
  const proxBonus = Math.max(0, 20 - proxKm * 0.67);
  return imp + proxBonus;
}


// ─── Priority tier of a place (1=lowest, 5=highest) ──────────────────────────
// Based on importanceScore() → rating × 10 + mustVisit bonus
// 5-star: imp ≥ 45 (rating 4.5+) or mustVisit
// 4-star: imp ≥ 35 (rating 3.5–4.4)
// 3-star: imp ≥ 25 (rating 2.5–3.4)
// 2-star: imp ≥ 15 (rating 1.5–2.4)
// 1-star: imp <  15
function priorityTier(p: TouristSpot): number {
  if (p.mustVisit) return 5;
  const imp = importanceScore(p);
  if (imp >= 45) return 5;
  if (imp >= 35) return 4;
  if (imp >= 25) return 3;
  if (imp >= 15) return 2;
  return 1;
}

/** A place worthy of being a primary day anchor (5-star / must-visit). */
function isAnchorCandidate(p: TouristSpot): boolean {
  return priorityTier(p) >= 5;
}

/**
 * Minimum allowed tier based on trip length.
 * Short trips are strict — only top attractions.
 * Longer trips gradually open up to lower-priority places.
 */
function minAllowedTier(days: number): number {
  if (days <= 3) return 3; // only ★★★, ★★★★, ★★★★★
  if (days <= 4) return 2; // selective ★★ if very close + unique
  return 1;                 // ★ eligible for long trips
}

/** Max stops per day based on pace. */
function maxStopsForPace(pace: string): number {
  const key = (pace || '').toUpperCase();
  if (key === 'VERY_RELAXED') return 5;
  if (key === 'RELAXED') return 5;
  if (key === 'QUICK' || key === 'INTENSIVE') return 7;
  return 6;
}

/** Max available minutes of activity per day based on pace (~8h moderate). */
function maxDayMinutes(pace: string): number {
  const key = (pace || '').toUpperCase();
  if (key === 'VERY_RELAXED') return 390;
  if (key === 'RELAXED') return 420;
  if (key === 'QUICK' || key === 'INTENSIVE') return 540;
  return 480;
}

/** Prevent more than N same-category attractions per day. */
function hasTooManySameCategory(stops: TouristSpot[], candidate: TouristSpot, maxSame = 2): boolean {
  const cat = categoryOf(candidate);
  const lowValueCats = new Set(['garden', 'park', 'viewpoint']);
  const limit = lowValueCats.has(cat) ? 1 : maxSame;
  return stops.filter(s => categoryOf(s) === cat).length >= limit;
}

/**
 * Nearest-neighbor route optimizer.
 * Keeps the anchor (first stop) fixed; re-orders the rest to minimize travel.
 */
function routeOptimize(stops: TouristSpot[]): TouristSpot[] {
  if (stops.length <= 2) return stops;
  const ordered: TouristSpot[] = [stops[0]]; // anchor is always first
  const remaining = stops.slice(1);
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(last.latitude, last.longitude, remaining[i].latitude, remaining[i].longitude);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}


// ─── Anchor separation threshold ──────────────────────────────────────────────
// A 5-star place must be at least this far from BOTH the current anchor AND
// the last stop before it is reserved as a separate day's anchor.
// Being far from only one does NOT automatically disqualify it.
const ANCHOR_SEPARATION_KM = 12; // km — soft preference, used in combination

/**
 * Graduated proximity bonus based on distance from the LAST added stop.
 * These are STRONG PREFERENCES, not hard cutoffs.
 *
 *  0– 3 km  = excellent  +25
 *  3– 5 km  = very good  +20
 *  5–10 km  = good       +12
 * 10–15 km  = possible   + 4
 * 15–20 km  = avoid      − 5
 * 20–25 km  = last resort −15
 *  25+ km   = reject     −999
 */
function proximityBonus(distKm: number): number {
  if (distKm <= 3)  return 25;
  if (distKm <= 5)  return 20;
  if (distKm <= 10) return 12;
  if (distKm <= 15) return 4;
  if (distKm <= 20) return -5;
  if (distKm <= 25) return -15;
  return -999; // effectively reject
}

/**
 * Composite score for adding a candidate to the current day.
 *
 * Formula:
 *   score = (tier × 18) + proximityBonus(distFromLast) − anchorSprawlPenalty
 *
 * - Tier dominates when distances are similar.
 * - Proximity (chain distance) beats a small tier advantage.
 * - A large cluster sprawl (distFromAnchor >> 12km) is discouraged.
 */
function candidateScore(
  p: TouristSpot,
  distFromLast: number,   // chain distance from last added stop
  distFromAnchor: number, // distance from day anchor (cluster coherence check)
): number {
  const tierScore = priorityTier(p) * 18;           // 18–90 range
  const proxBonus = proximityBonus(distFromLast);    // −999 to +25
  // Soft penalty for cluster sprawl: kicks in beyond 12 km from anchor
  const sprawlPenalty = distFromAnchor > 12 ? (distFromAnchor - 12) * 1.5 : 0;
  return tierScore + proxBonus - sprawlPenalty;
}

/**
 * Builds one day's stops using step-by-step greedy selection.
 *
 * KEY IMPROVEMENTS over the previous version:
 *
 * 1. Chain distance: Each step uses distFromLast, not just distFromAnchor.
 *    A→B (8 km) → C (8 km from B, 16 km from A) is still efficient.
 *
 * 2. A nearby 5-star stays in the cluster.
 *    A = 5★ anchor, B = 5★ at 2 km → B is included in Day 1, NOT saved for Day 2.
 *    Only a 5-star that is far from BOTH the anchor AND the last stop is reserved.
 *
 * 3. Soft thresholds, not hard cutoffs.
 *    candidateScore() produces a score; we pick the highest-scoring valid candidate.
 *    No place is hard-rejected solely because it crossed an arbitrary km boundary.
 *
 * 4. Quality-over-quantity stopping.
 *    If the best remaining candidate scores below a minimum threshold,
 *    the day ends early rather than padding with low-value attractions.
 *
 * 5. Eligibility ≠ inclusion.
 *    A lower-tier place must earn inclusion through score; it is not auto-added.
 */
function buildDayStops(
  anchor: TouristSpot,
  pool: TouristSpot[],
  pace: string,
  totalDays: number,
  usedIds: Set<string>,
): TouristSpot[] {
  const maxStops = maxStopsForPace(pace);
  const maxMins  = maxDayMinutes(pace);
  const minTier  = minAllowedTier(totalDays);

  const stops: TouristSpot[] = [anchor];
  usedIds.add(anchor.id);
  let usedMins = visitDuration(anchor);

  // ── Phase 1: pull in nearby co-5★ that belong to this cluster ───────────
  let fiveExpanded = true;
  while (fiveExpanded && stops.length < maxStops) {
    fiveExpanded = false;
    let bestFive: TouristSpot | null = null;
    let bestFiveScore = -Infinity;
    let bestFiveTravel = 0;
    let bestFiveVisit = 0;
    const last = stops[stops.length - 1];
    for (const p of pool) {
      if (usedIds.has(p.id) || !isAnchorCandidate(p)) continue;
      if (priorityTier(p) < minTier) continue;
      const distFromAnchor = haversineKm(anchor.latitude, anchor.longitude, p.latitude, p.longitude);
      if (distFromAnchor >= ANCHOR_SEPARATION_KM) continue;
      if (hasTooManySameCategory(stops, p)) continue;
      const distFromLast = haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
      const travel = estimateTravelMinutes(distFromLast);
      const visit = visitDuration(p);
      if (usedMins + travel + visit > maxMins) continue;
      const score = candidateScore(p, distFromLast, distFromAnchor) + 40;
      if (score > bestFiveScore) {
        bestFiveScore = score;
        bestFive = p;
        bestFiveTravel = travel;
        bestFiveVisit = visit;
      }
    }
    if (bestFive && bestFiveScore >= 30) {
      stops.push(bestFive);
      usedIds.add(bestFive.id);
      usedMins += bestFiveVisit + bestFiveTravel;
      fiveExpanded = true;
    }
  }

  // ── Phase 2: supporting 4★/3★ — must belong to locked cluster geography ─
  while (stops.length < maxStops) {
    const last = stops[stops.length - 1];

    let bestScore  = -Infinity;
    let bestPlace: TouristSpot | null = null;
    let bestTravel = 0;
    let bestVisit  = 0;

    for (const p of pool) {
      if (usedIds.has(p.id)) continue;

      const tier = priorityTier(p);
      if (tier < minTier) continue;

      const distFromLast   = haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
      const distFromAnchor = haversineKm(anchor.latitude, anchor.longitude, p.latitude, p.longitude);

      // 5★: reserved if outside primary cluster (anchor distance)
      if (isAnchorCandidate(p) && distFromAnchor >= ANCHOR_SEPARATION_KM) continue;

      // CLUSTER LOCK: supporting places must be near the cluster (anchor or any stop),
      // not merely close to the last stop of a wandering chain.
      let distNearest = distFromAnchor;
      for (const s of stops) {
        const d = haversineKm(s.latitude, s.longitude, p.latitude, p.longitude);
        if (d < distNearest) distNearest = d;
      }
      if (distNearest > ANCHOR_SEPARATION_KM) continue;

      if (hasTooManySameCategory(stops, p)) continue;

      const travel = estimateTravelMinutes(distFromLast);
      const visit  = visitDuration(p);
      if (usedMins + travel + visit > maxMins) continue;

      const score = candidateScore(p, distFromLast, distFromAnchor);
      if (score < -900) continue;

      if (score > bestScore) {
        bestScore = score;
        bestPlace = p;
        bestTravel = travel;
        bestVisit  = visit;
      }
    }

    if (!bestPlace || bestScore < 30) break;

    stops.push(bestPlace);
    usedIds.add(bestPlace.id);
    usedMins += bestVisit + bestTravel;
  }

  // Re-order stops (keeping anchor first) to minimise backtracking
  return routeOptimize(stops);
}

/** Human-readable day theme based on categories visited. */
function dayTheme(stops: TouristSpot[], location: string, dayNum: number): string {
  if (!stops.length) return `Day ${dayNum} · Explore ${location}`;
  const cats = [...new Set(stops.map(s => categoryOf(s)))];
  const catLabel = cats.slice(0, 2).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' & ');
  return `Day ${dayNum} · ${catLabel} in ${location}`;
}

/**
 * Scores a potential anchor by the quality of the geographic cluster
 * it can form around itself from the remaining unused pool.
 *
 * AnchorScore =
 *   anchorImportance × 1.5
 *   + nearby4★/5★ value  (closer = more valuable)
 *   + nearby3★ value
 *   + clusterDensityBonus
 *   + categoryDiversityBonus
 *   − originTravelCost        (1-day heavily punishes far isolated 5★)
 *   − estimatedRouteTravelCost
 */
function originTravelPenalty(distKm: number, days: number): number {
  const travelMins = estimateTravelMinutes(distKm);
  // Soft for 1-day: farther rich regions must still be able to win
  if (days <= 1) return travelMins * 0.2 + distKm * 0.25;
  if (days <= 3) return travelMins * 0.85 + distKm * 1.1;
  return travelMins * 0.25 + distKm * 0.35;
}

function scoreAnchorCluster(
  anchor: TouristSpot,
  pool: TouristSpot[],
  usedIds: Set<string>,
  totalDays: number,
  pace: string,
  origin: { lat: number; lng: number },
): number {
  const minTier = minAllowedTier(totalDays);

  // Base: anchor's own importance (dominant signal)
  let score = importanceScore(anchor) * 1.5;
  if (anchor.mustVisit) score += 35;

  const distFromOrigin = haversineKm(origin.lat, origin.lng, anchor.latitude, anchor.longitude);
  score -= originTravelPenalty(distFromOrigin, totalDays);

  // Find unused eligible candidates within DIST_MODERATE of this anchor
  const nearby = pool
    .filter(p => !usedIds.has(p.id) && p.id !== anchor.id)
    .map(p => ({
      p,
      dist: haversineKm(anchor.latitude, anchor.longitude, p.latitude, p.longitude),
      tier: priorityTier(p),
    }))
    .filter(({ dist, tier }) => dist <= DIST_MODERATE && tier >= minTier)
    .sort((a, b) => a.dist - b.dist); // closest first

  // Value of nearby places — 4★ within 10 km is the strongest signal
  for (const { dist, tier } of nearby.slice(0, 8)) {
    if (tier >= 5) {
      if (dist < ANCHOR_SEPARATION_KM) score += dist <= DIST_NEARBY ? 22 : 12;
    } else if (tier >= 4) {
      score += dist <= DIST_NEARBY ? 20 : 10;
    } else if (tier === 3) {
      score += dist <= DIST_NEARBY ? 8 : 3;
    }
  }

  // Category diversity bonus: reward clusters with varied experiences
  const uniqueCats = new Set(nearby.slice(0, 6).map(({ p }) => categoryOf(p)));
  score += uniqueCats.size * 5; // up to +25 for 5 different categories

  // Cluster density bonus: tighter packing of nearby places = more efficient day
  if (nearby.length > 0) {
    const sample = nearby.slice(0, Math.min(nearby.length, 5));
    const avgDist = sample.reduce((s, { dist }) => s + dist, 0) / sample.length;
    score += Math.max(0, 20 - avgDist * 1.2); // up to +20 for very tight clusters
  } else if (!anchor.mustVisit) {
    score -= totalDays <= 1 ? 28 : 12;
  }

  // Estimated route travel cost: simulate nearest-neighbor route through top stops
  // and penalise anchors that would require a lot of travel within the day.
  const maxStops = maxStopsForPace(pace);
  let last = anchor;
  let travelCost = 0;
  // Greedily pick nearest next stop (simple route simulation)
  const simPool = nearby.slice(0, maxStops - 1).map(x => x.p);
  const visited = new Set<string>();
  for (let i = 0; i < simPool.length; i++) {
    let bestDist = Infinity;
    let bestP: TouristSpot | null = null;
    for (const p of simPool) {
      if (visited.has(p.id)) continue;
      const d = haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
      if (d < bestDist) { bestDist = d; bestP = p; }
    }
    if (!bestP) break;
    travelCost += bestDist;
    visited.add(bestP.id);
    last = bestP;
  }
  score -= travelCost * 0.45; // penalty: points per km of travel

  return score;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * buildLocalTripPlan — Final Geographically Intelligent Itinerary Engine
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Core philosophy:
 *   PRIORITY selects the ANCHOR.
 *   DISTANCE + CHAIN ROUTE builds the CLUSTER.
 *   TRIP DURATION gates which TIERS are ELIGIBLE.
 *   QUALITY SCORE decides what is actually INCLUDED.
 *
 * Anchor selection (new — cluster-quality based):
 *   For each day, score every unused 5★ by the cluster it can form:
 *     AnchorScore = importanceScore + nearby4★ + nearby3★
 *                 + clusterDensity + diversity − travelCost
 *   Pick the anchor with the BEST cluster potential, not just the farthest.
 *   Naturally deprioritises areas already covered (fewer unused places nearby).
 *
 * Cluster rules:
 *   ─ A close 5★ (< ANCHOR_SEPARATION_KM from anchor OR last stop) stays in cluster.
 *   ─ A far 5★ (≥ ANCHOR_SEPARATION_KM from BOTH anchor AND last stop) is reserved.
 *   ─ candidateScore() governs inclusion — proximity beats small tier differences.
 *   ─ Day ends when no candidate scores above the quality threshold.
 */
export function buildLocalTripPlan(options: {
  location: string;
  days: number;
  pace: string;
  interests?: string[];
  places?: TouristSpot[];
}): TripPlanResult {
  const days      = Math.min(14, Math.max(1, options.days || 3));
  const pace      = options.pace || 'moderate';
  const interests = options.interests || [];
  const location  = options.location || '';

  // ── 1. Deduplicate and validate coordinates ─────────────────────────────
  const byId = new Map<string, TouristSpot>();
  (options.places || []).forEach(p => {
    if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
  });
  const allPlaces = Array.from(byId.values()).filter(
    p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  );

  // ── 2. Filter to destination ─────────────────────────────────────────────
  let cityPlaces = allPlaces.filter(p => matchesDestination(p, location));
  if (cityPlaces.length < 4) {
    const token = location.split(/\s+/)[0].toLowerCase();
    cityPlaces = allPlaces.filter(p =>
      (p.city  || '').toLowerCase().includes(token) ||
      (p.state || '').toLowerCase().includes(token)
    );
  }

  // ── 3. Interest filter (soft — falls back to all city places) ───────────
  let eligible = cityPlaces.filter(p => interestMatchesPlace(p, interests));
  if (eligible.length < Math.min(days * 2, 6)) {
    eligible = cityPlaces;
  }

  if (eligible.length === 0) {
    return {
      title: `${days}-Day Trip in ${location}`,
      days: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        theme: 'No places available',
        stops: [],
      })),
      totalPlaces: 0,
      totalDistance: 0,
      note: `We don't have offline places for "${location}". Connect to the server or try another city.`,
    };
  }

  // ── 4. Priority-gate the pool based on trip duration ────────────────────
  const minTier    = minAllowedTier(days);
  const tieredPool = eligible.filter(p => priorityTier(p) >= minTier);
  // Safety: if tier gating removes too many places, relax to full eligible set
  const pool = tieredPool.length >= Math.min(days * 2, 4) ? tieredPool : eligible;

  // Sort pool by importance descending (anchor selection order)
  const sortedPool = [...pool].sort((a, b) => importanceScore(b) - importanceScore(a));

  // Destination origin ≈ geographic mean of eligible places (travel-cost reference)
  const origin = sortedPool.length
    ? {
        lat: sortedPool.reduce((s, p) => s + p.latitude, 0) / sortedPool.length,
        lng: sortedPool.reduce((s, p) => s + p.longitude, 0) / sortedPool.length,
      }
    : { lat: 0, lng: 0 };

  // Prefer denser local core as origin when a far outlier skews the mean
  const localCore = sortedPool.filter(
    p => haversineKm(origin.lat, origin.lng, p.latitude, p.longitude) <= DIST_MODERATE,
  );
  const tripOrigin = localCore.length >= 3
    ? {
        lat: localCore.reduce((s, p) => s + p.latitude, 0) / localCore.length,
        lng: localCore.reduce((s, p) => s + p.longitude, 0) / localCore.length,
      }
    : origin;

  // ── 5. Classify anchors ──────────────────────────────────────────────────
  // 5-star anchors will become primary day hubs.
  // Each is only used as an anchor if it was NOT already consumed as a companion stop.
  const fiveStarAnchors = sortedPool.filter(isAnchorCandidate);
  const mustVisitAnchors = sortedPool.filter(p => p.mustVisit);
  const fallbackAnchors = sortedPool.filter(p => !isAnchorCandidate(p));

  // ── 6. Build days ────────────────────────────────────────────────────────
  const usedIds      = new Set<string>();
  const dayPlans: TripPlanDay[] = [];
  let   totalDistance = 0;
  let dayOrigin = tripOrigin;

  for (let d = 0; d < days; d++) {

    // ── Pick next anchor via cluster-quality scoring ───────────────────────
    let anchor: TouristSpot | undefined;

    const unusedMust = mustVisitAnchors.filter(p => !usedIds.has(p.id));
    const eligibleFiveStars = fiveStarAnchors.filter(p => !usedIds.has(p.id));
    const strongHubs = sortedPool.filter(p => !usedIds.has(p.id) && priorityTier(p) >= 4);
    const candidates = unusedMust.length > 0
      ? unusedMust
      : Array.from(new Map([...eligibleFiveStars, ...strongHubs].map(p => [p.id, p])).values());

    if (candidates.length > 0) {
      anchor = candidates
        .map(p => ({
          p,
          clusterScore: scoreAnchorCluster(p, sortedPool, usedIds, days, pace, dayOrigin),
        }))
        .sort((a, b) => b.clusterScore - a.clusterScore)[0].p;
    }

    // Fall back to best unused non-5-star (when 5-stars exhausted)
    if (!anchor) {
      const rest = fallbackAnchors.filter(p => !usedIds.has(p.id));
      if (rest.length) {
        anchor = rest
          .map(p => ({
            p,
            clusterScore: scoreAnchorCluster(p, sortedPool, usedIds, days, pace, dayOrigin),
          }))
          .sort((a, b) => b.clusterScore - a.clusterScore)[0].p;
      } else {
        anchor = sortedPool.find(p => !usedIds.has(p.id));
      }
    }

    if (!anchor) break; // All places consumed


    // ── Build this day's stops ─────────────────────────────────────────────
    const dayStops = buildDayStops(anchor, sortedPool, pace, days, usedIds);
    if (!dayStops.length) break;

    const lastStop = dayStops[dayStops.length - 1];
    dayOrigin = { lat: lastStop.latitude, lng: lastStop.longitude };

    // ── Map TouristSpot[] → TripPlanStop[] ────────────────────────────────
    const stops: TripPlanStop[] = dayStops.map((p, i) => {
      const distKm = i === 0
        ? 0
        : haversineKm(
            dayStops[i - 1].latitude, dayStops[i - 1].longitude,
            p.latitude, p.longitude,
          );
      const distM = Math.round(distKm * 1000);
      totalDistance += distM;

      const slot: TripPlanStop['timeSlot'] =
        i < Math.ceil(dayStops.length / 3)
          ? 'morning'
          : i < Math.ceil((2 * dayStops.length) / 3)
            ? 'afternoon'
            : 'evening';

      return {
        placeId:          p.id,
        name:             p.name,
        category:         String(p.category || 'heritage'),
        latitude:         p.latitude,
        longitude:        p.longitude,
        timeSlot:         slot,
        order:            i + 1,
        distanceFromPrev: distM,
        description:      p.shortDescription || p.description || `${p.name} in ${p.city || location}`,
      };
    });

    dayPlans.push({
      day:   d + 1,
      theme: dayTheme(dayStops, location, d + 1),
      stops,
    });
  }

  // ── 7. Ensure at least one day ───────────────────────────────────────────
  if (!dayPlans.length) {
    dayPlans.push({ day: 1, theme: `Explore ${location}`, stops: [] });
  }

  const totalPlaces  = dayPlans.reduce((n, d) => n + d.stops.length, 0);
  const interestNote = interests.length
    ? `Focused on ${interests.join(', ')}.`
    : 'Balanced mix of top attractions.';

  return {
    title: `${days}-Day ${pace.charAt(0).toUpperCase()}${pace.slice(1)} Trip to ${location}`,
    days:  dayPlans,
    totalPlaces,
    totalDistance,
    note: `${interestNote} Pace: ${pace}. Geographic anchor+cluster routing for ${location}, India.`,
  };
}





export function isTripPlanEmpty(plan: TripPlanResult | null | undefined): boolean {
  if (!plan?.days?.length) return true;
  return plan.days.every(d => !d.stops?.length);
}
