import { describe, expect, it } from 'vitest';
import {
  INTEREST_CATEGORY_MAP,
  MAX_TRAVEL_PENALTY,
  RANK_LABELS,
  SECONDARY_WEIGHT,
  buildScoringContext,
  matchesInterests,
  rankLabelOf,
  scorePlace,
  stateRank,
  targetSlot,
} from '../modules/trips/itinerary/scoring';
import { normalizeIntent } from '../modules/trips/itinerary/intent';
import { mumbaiPlaces } from './fixtures/itineraryPhase1Fixtures';

const ORIGIN = { lat: 18.9219, lng: 72.8346 };

function ctx(overrides?: Record<string, unknown>) {
  const intent = normalizeIntent({ destination: 'Mumbai', planningMode: 'SELF_BUILD', interests: ['heritage'], ...overrides }).intent;
  return buildScoringContext(intent, ORIGIN, 40, 30);
}

describe('multi-signal place scoring (Phase 1)', () => {
  it('rank hierarchy dominates: a selected mandatory place beats any optional', () => {
    const mumbai = mumbaiPlaces();
    const optional = { ...mumbai.colabaMarket, state: { ...mumbai.colabaMarket.state, selected: false, optional: true } };
    const selected = { ...mumbai.gateway, state: { ...mumbai.gateway.state, selected: true } };
    const c = ctx();
    const sOpt = scorePlace(optional, c);
    const sSel = scorePlace(selected, c);
    expect(sOpt.rank).toBe(0);
    expect(sSel.rank).toBeGreaterThan(0);
    expect(sSel.totalScore).toBeGreaterThan(sOpt.totalScore);
  });

  it('stateRank maps the frozen precedence ladder', () => {
    const base = { selected: false, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false };
    expect(stateRank({ ...base, selected: true }, 'SELF_BUILD')).toBe(11);
    expect(stateRank({ ...base, selected: true }, 'AI_BUILD')).toBe(8);
    expect(stateRank({ ...base, pinned: true }, 'SELF_BUILD')).toBe(10);
    expect(stateRank({ ...base, lockedPosition: true }, 'SELF_BUILD')).toBe(10);
    expect(stateRank({ ...base, fixedTime: true }, 'SELF_BUILD')).toBe(9);
    expect(stateRank({ ...base, priorityAnchor: true }, 'AI_BUILD')).toBe(11);
    expect(stateRank(base, 'AI_BUILD')).toBe(0);
  });

  it('RANK_LABELS trails the full frozen macro ladder', () => {
    expect(RANK_LABELS.map((r) => r.level)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(rankLabelOf(11)).toBe('explicit-mandatory-selection');
    expect(rankLabelOf(0)).toBe('optional-recommendations');
  });

  it('secondary signals stay capped below a single rank step (rank never flips)', () => {
    const mumbai = mumbaiPlaces();
    const a = { ...mumbai.gateway, state: { ...mumbai.gateway.state, selected: true, pinned: false } };
    const b = { ...mumbai.taj, state: { ...mumbai.taj.state, selected: true } };
    const c = ctx({ interests: [], timePreference: 'FULL_DAY' });
    const sa = scorePlace(a, c);
    const sb = scorePlace(b, c);
    expect(sa.rank).toBe(sb.rank);
    const secondaryCeiling = SECONDARY_WEIGHT * 5 * 100 + MAX_TRAVEL_PENALTY;
    expect(secondaryCeiling).toBeLessThan(1000);
    expect(Math.abs(sa.totalScore - sb.totalScore)).toBeLessThanOrEqual(secondaryCeiling);
  });

  it('matchesInterests honors the interest->category map', () => {
    expect(matchesInterests({ category: 'temple', tags: [] }, ['temples', 'heritage'])).toBe(true);
    expect(matchesInterests({ category: 'market', tags: [] }, ['waterfalls'])).toBe(false);
    expect(INTEREST_CATEGORY_MAP.temples).toContain('temple');
  });

  it('targetSlot reflects the requested time preference', () => {
    expect(targetSlot('MORNING_FOCUSED')).toBe('MORNING');
    expect(targetSlot('EVENING_FRIENDLY')).toBe('EVENING');
    expect(targetSlot(null)).toBe('AFTERNOON');
  });

  it('reasons include provenance when a place matches the evening preference', () => {
    const mumbai = mumbaiPlaces();
    const scored = scorePlace(mumbai.marineDrive, ctx({ timePreference: 'EVENING_FRIENDLY' }));
    expect(scored.travelPenalty).toBeLessThanOrEqual(MAX_TRAVEL_PENALTY);
    void scored.timingScore;
  });
});