/**
 * Canonical multi-signal priority scoring (Phase 1).
 *
 * Frozen scoring hierarchy (Phase 0 contract §5):
 *   1. Explicit mandatory user selection
 *   2. Pinned
 *   3. Fixed-time requirement
 *   4. Opening-hour feasibility
 *   5. Trip feasibility          (enforced by constraintValidator, not scored)
 *   6. Area coherence            (enforced by clustering / route optimizer)
 *   7. User interests
 *   8. Travel burden
 *   9. Experience quality
 *  10. Popularity / rating
 *  11. Optional recommendations
 *
 * Design guarantee: a mandatory user place MUST outrank every non-mandatory
 * place, and raw distance can NEVER dominate. State rank contributes a large
 * discrete bucket (1000 per rank step); the secondary signals (interests,
 * timing, quality, proximity, optional) are individually capped at 100 and
 * scaled by a weight whose total is provably smaller than a single rank step.
 *
 * SECONDARY_WEIGHT * maxComponents(5) + maxTravelPenalty(200)
 *      = 1.5 * 450 + 200 = 875 < 1000   -> rank ordering is strict.
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  PlanningMode,
  TimePreferenceInput,
  TimeOfDaySuitability,
} from './types';
import { estimateTravelMinutes } from './clustering';
import { haversineKm } from './clustering';

// ---------------------------------------------------------------------------
// Extracted interest map (mirrors legacy itineraryEngine.INTEREST_CATEGORY_MAP)
// ---------------------------------------------------------------------------

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

export function matchesInterests(place: { category: string; tags: string[] }, interests: string[]): boolean {
  if (interests.length === 0) return true;
  const cat = (place.category || '').toLowerCase();
  const tags = (place.tags || []).map((t) => t.toLowerCase());
  for (const interest of interests) {
    const key = interest.toLowerCase();
    const keywords = INTEREST_CATEGORY_MAP[key] || [];
    if (keywords.some((k) => cat.includes(k) || tags.some((t) => t.includes(k)))) return true;
    if (cat.includes(key) || tags.some((t) => t.includes(key))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Canonical state -> hierarchy rank
// ---------------------------------------------------------------------------

export type ScaleLevel = 'macro' | 'micro';

export interface RankLabel {
  level: number;
  label: string;
}

/** Freeze the hierarchy levels so tests and consumers share one numbering. */
export const RANK_LABELS: RankLabel[] = [
  { level: 11, label: 'explicit-mandatory-selection' },
  { level: 10, label: 'pinned' },
  { level: 9, label: 'fixed-time' },
  { level: 8, label: 'selected' },
  { level: 7, label: 'opening-hour-feasibility' },
  { level: 6, label: 'trip-feasibility' },
  { level: 5, label: 'area-coherence' },
  { level: 4, label: 'user-interests' },
  { level: 3, label: 'travel-burden' },
  { level: 2, label: 'experience-quality' },
  { level: 1, label: 'popularity-rating' },
  { level: 0, label: 'optional-recommendations' },
];

export function rankLabelOf(level: number): string {
  return RANK_LABELS.find((r) => r.level === level)?.label ?? 'unknown';
}

/**
 * Discrete priority rank from a place's state (macro scale 0..11).
 * Locked position implies at least pin strength.
 */
export function stateRank(state: { selected: boolean; pinned: boolean; lockedPosition: boolean; fixedTime: boolean; priorityAnchor: boolean }, mode: PlanningMode): number {
  if (mode === 'SELF_BUILD' && state.selected) return 11;
  if (state.priorityAnchor) return 11;
  if (state.pinned || state.lockedPosition) return 10;
  if (state.fixedTime) return 9;
  if (state.selected) return 8;
  return 0;
}

/** Weight applied to secondary (micro) signals. See module doc for safe bounds. */
export const SECONDARY_WEIGHT = 1.5;
export const MAX_TRAVEL_PENALTY = 200;

export interface ScoringContext {
  origin: GeoCoords;
  radiusKm: number;
  destination: string;
  planningMode: PlanningMode;
  interests: string[];
  pace: 'QUICK' | 'BALANCED' | 'RELAXED' | 'VERY_RELAXED';
  timePreference: TimePreferenceInput | null;
  speedKmh: number;
  wantsHiddenGems: boolean;
  avoidCrowded: boolean;
  /** Avoid LONG_TRAVEL adds a penalty for far-away stops. */
  avoidLongTravel: boolean;
}

export interface PlaceScore {
  totalScore: number;
  /** Discrete state bucket (rank * 1000). Higher rank NEVER beaten by lower rank. */
  priorityScore: number;
  rank: number;
  rankLabel: string;
  interestScore: number;
  proximityScore: number;
  qualityScore: number;
  timingScore: number;
  travelPenalty: number;
  optionalScore: number;
  /** Human-readable breakdown. */
  reasons: string[];
}

/** Neutral score when a slot's suitability is unknown (do not fabricate). */
export function targetSlot(timePreference: TimePreferenceInput | null): keyof TimeOfDaySuitability {
  if (timePreference === 'MORNING_FOCUSED') return 'MORNING';
  if (timePreference === 'EVENING_FRIENDLY') return 'EVENING';
  return 'AFTERNOON';
}

export function interestScoreOf(place: EnrichedPlace, interests: string[]): number {
  if (interests.length === 0) return 50; // neutral — no preference asserted
  const meaningful = interests.filter((i) => (INTEREST_CATEGORY_MAP[i] || []).length > 0);
  if (!meaningful.length) return 50;
  return matchesInterests(place, meaningful) ? 100 : 20;
}

export function qualityScoreOf(place: EnrichedPlace, wantsHiddenGems: boolean, avoidCrowded: boolean): number {
  const editorialT = Math.min(1, (place.editorialPriority ?? 3) / 5);
  const ratingT = Math.min(1, (place.rating ?? 3) / 5);
  const pop = Math.min(100, place.popularityScore ?? 20);
  const popularityT = avoidCrowded ? 1 - pop / 100 : pop / 100;
  const hiddenT = wantsHiddenGems ? Math.min(1, (place.hiddenGemScore ?? 0) / 100) : 0;
  return Math.round(45 * editorialT + 30 * ratingT + 15 * popularityT + 10 * hiddenT);
}

export function proximityScoreOf(place: EnrichedPlace, origin: GeoCoords, radiusKm: number): number {
  const distKm = haversineKm(origin.lat, origin.lng, place.coordinates.lat, place.coordinates.lng);
  return Math.round(100 * Math.max(0, 1 - distKm / Math.max(radiusKm, 1)));
}

export interface TravelPenaltyInput {
  distanceKm: number;
  travelMinutes: number;
  avoidLongTravel: boolean;
}

export function travelPenaltyOf(input: TravelPenaltyInput): number {
  let penalty = Math.round(input.travelMinutes * 0.5 + input.distanceKm * 0.8);
  if (input.avoidLongTravel && input.distanceKm > 25) penalty += 80;
  return Math.min(MAX_TRAVEL_PENALTY, penalty);
}

export function buildScoringContext(intent: ItineraryIntent, origin: GeoCoords, radiusKm: number, speedKmh: number): ScoringContext {
  return {
    origin,
    radiusKm,
    destination: intent.destination,
    planningMode: intent.planningMode,
    interests: intent.interests,
    pace: intent.pace,
    timePreference: intent.timePreference,
    speedKmh,
    wantsHiddenGems: intent.interests.some((i) => i.toLowerCase().includes('hidden')),
    avoidCrowded: intent.avoid.includes('CROWDED'),
    avoidLongTravel: intent.avoid.includes('LONG_TRAVEL'),
  };
}

/**
 * Core multi-signal score for one place. Pure and deterministic.
 */
export function scorePlace(place: EnrichedPlace, ctx: ScoringContext): PlaceScore {
  const rank = stateRank(place.state, ctx.planningMode);
  const priorityScore = rank * 1000;

  const interestScore = interestScoreOf(place, ctx.interests);
  const qualityScore = qualityScoreOf(place, ctx.wantsHiddenGems, ctx.avoidCrowded);
  const proximityScore = proximityScoreOf(place, ctx.origin, ctx.radiusKm);
  const timingScore = place.timeOfDaySuitability[targetSlot(ctx.timePreference)] * 100;

  const distKm = haversineKm(ctx.origin.lat, ctx.origin.lng, place.coordinates.lat, place.coordinates.lng);
  const travelMinutes = estimateTravelMinutes(distKm, ctx.speedKmh);
  const penalty = travelPenaltyOf({ distanceKm: distKm, travelMinutes, avoidLongTravel: ctx.avoidLongTravel });

  let optionalScore = 0;
  if (place.state.complementary) optionalScore = 50;
  else if (place.state.optional) optionalScore = 25;

  const secondary = interestScore + timingScore + qualityScore + proximityScore + optionalScore;
  const totalScore = Math.round(priorityScore + secondary * SECONDARY_WEIGHT - penalty);

  const reasons: string[] = [];
  if (rank >= 11) reasons.push('explicit mandatory user selection');
  else if (rank === 10) reasons.push('pinned/locked — unremovable');
  else if (rank === 9) reasons.push('fixed-time anchor');
  else if (rank === 8) reasons.push('user selected');
  if (interestScore === 100) reasons.push('fits requested interests');
  if (qualityScore >= 70) reasons.push('high experience quality');
  if (place.rating != null && place.rating >= 4.5) reasons.push(`well-rated (${place.rating.toFixed(1)}★)`);
  if (place.hiddenGemScore != null && place.hiddenGemScore > 60) reasons.push('hidden gem worth discovering');
  if (proximityScore >= 80) reasons.push('close to the day base');
  if (timingScore >= 80) reasons.push('open time matches the preferred day slot');

  return {
    totalScore,
    priorityScore,
    rank,
    rankLabel: rankLabelOf(rank),
    interestScore,
    proximityScore,
    qualityScore,
    timingScore,
    travelPenalty: penalty,
    optionalScore,
    reasons,
  };
}

/** Rank a set of places (descending). Strictly by totalScore. */
export function rankByScore(scored: Array<{ place: EnrichedPlace; score: PlaceScore }>): Array<{ place: EnrichedPlace; score: PlaceScore }> {
  return [...scored].sort(
    (a, b) => b.score.totalScore - a.score.totalScore || b.score.rank - a.score.rank,
  );
}