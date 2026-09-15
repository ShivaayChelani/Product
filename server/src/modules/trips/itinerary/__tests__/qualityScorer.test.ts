/**
 * Unit tests for the Phase 2 quality scorer: dominance invariant, feasibility
 * gating, and the deterministic selection tie-break order.
 */

import { describe, it, expect } from 'vitest';
import type { EnrichedPlace, ItineraryIntent } from '../types';
import { enrichPlace } from '../enrichment';
import { buildZones } from '../clustering';
import { generateCandidates } from '../candidateGenerator';
import {
  MANDATORY_DOMINANCE_WEIGHT,
  scoreCandidate,
  selectBestCandidate,
} from '../qualityScorer';
import type { ItineraryCandidate, ItineraryQuality } from '../phase2Types';
import { jaipurRecords, jprIntent, JAIPUR_IDS, JAIPUR_ORIGIN } from '../../../../__tests__/fixtures/itineraryPhase2Fixtures';

const RECORDS = new Map(jaipurRecords().map((r) => [r.id, r]));

function poolFor(intent: ItineraryIntent, ids: string[] = []): EnrichedPlace[] {
  const explicit = new Set([
    ...intent.selectedPlaceIds,
    ...intent.pinnedPlaceIds,
    ...intent.lockedPlaceIds,
    ...intent.fixedTimePlaces.map((f) => f.placeId),
    ...intent.priorityPlaceIds,
  ]);
  return (ids.length ? ids : [...explicit])
    .map((id) => RECORDS.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) =>
      enrichPlace(r, {
        travelerCount: 2,
        date: null,
        state: {
          selected: intent.selectedPlaceIds.includes(r.id),
          pinned: intent.pinnedPlaceIds.includes(r.id),
          lockedPosition: intent.lockedPlaceIds.includes(r.id),
          fixedTime: intent.fixedTimePlaces.some((f) => f.placeId === r.id),
          priorityAnchor: intent.planningMode === 'AI_BUILD' && intent.priorityPlaceIds.includes(r.id),
          complementary: intent.planningMode === 'AI_BUILD' && !explicit.has(r.id),
          optional: false,
        },
      }),
    );
}

function generate(intent: ItineraryIntent, ids?: string[]) {
  const resolved = ids ? poolFor(intent, ids) : poolFor(intent);
  const zones = buildZones(resolved, { includePlaceIds: [...intent.lockedPlaceIds, ...intent.pinnedPlaceIds] });
  return { resolved, zones, result: generateCandidates({ intent, resolved, zones, dayStart: JAIPUR_ORIGIN, speedKmh: 35 }) };
}

function q(totalScore: number, partial: Partial<ItineraryQuality> = {}): ItineraryQuality {
  return {
    totalScore,
    mandatoryCoverage: 1,
    components: [],
    penalties: [],
    strengths: [],
    weaknesses: [],
    feasible: true,
    ...partial,
  };
}

function fakeCandidate(id: string, quality: ItineraryQuality, stopIds: string[]): ItineraryCandidate {
  return {
    id,
    meta: { strategy: 'PRIORITY', variation: 0, label: id, description: '' },
    days: [],
    allStops: [],
    allStopIds: stopIds,
    zoneByPlaceId: new Map(),
    constraintResult: {
      feasible: quality.feasible,
      hardViolations: [],
      softWarnings: [],
      suggestedRepairs: [],
      validationWarnings: [],
    },
    quality,
    warnings: [],
    isRejected: !quality.feasible,
    rejectionReasons: [],
  };
}

describe('scoreCandidate', () => {
  it('mandatory coverage dominates every other quality term', () => {
    const totalOtherWeights = [120, 100, 90, 80, 70, 60, 50, 40].reduce((a, b) => a + b, 0);
    expect(MANDATORY_DOMINANCE_WEIGHT).toBeGreaterThan(totalOtherWeights);
  });

  it('a candidate covering every mandatory place scores feasible', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'] });
    const { resolved, result } = generate(intent);
    const candidate = result.candidates[0];
    const quality = scoreCandidate(candidate, { intent, pool: resolved, dayStart: JAIPUR_ORIGIN, speedKmh: 35 });
    expect(quality.feasible).toBe(true);
    expect(quality.mandatoryCoverage).toBe(1);
  });

  it('a candidate missing a mandatory place is infeasible and scored very low', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'] });
    const { resolved } = generate(intent);
    // The pool holds BOTH selected places, but this candidate covers only one.
    const candidate = fakeCandidate('trimmed', q(100), ['jpr-hawa-mahal']);
    const quality = scoreCandidate(candidate, { intent, pool: resolved, dayStart: JAIPUR_ORIGIN, speedKmh: 35 });
    expect(quality.feasible).toBe(false);
    expect(quality.mandatoryCoverage).toBe(0.5);
    expect(quality.penalties.some((p) => p.key === 'MANDATORY_MISSING')).toBe(true);
    expect(quality.weaknesses.some((w) => w.startsWith('missing mandatory'))).toBe(true);
  });
});

describe('selectBestCandidate', () => {
  it('picks the feasible candidate with the highest totalScore', () => {
    const winner = fakeCandidate('c1', q(500), ['a']);
    const loser = fakeCandidate('c2', q(400), ['a']);
    expect(selectBestCandidate([loser, winner])!.id).toBe('c1');
  });

  it('ties resolve by mandatoryCoverage', () => {
    const low = fakeCandidate('low', q(500, { mandatoryCoverage: 0.5 }), ['a']);
    const high = fakeCandidate('high', q(500, { mandatoryCoverage: 1 }), ['a']);
    expect(selectBestCandidate([low, high])!.id).toBe('high');
  });

  it('ties resolve by fewer penalty points', () => {
    const penalized = fakeCandidate('p', q(500, { penalties: [{ key: 'X', points: 20, reason: 'r' }] }), ['a']);
    const clean = fakeCandidate('c', q(500), ['a']);
    expect(selectBestCandidate([penalized, clean])!.id).toBe('c');
  });

  it('ties resolve by fewer weaknesses then more stops then stable id', () => {
    const weak = fakeCandidate('weak', q(500, { weaknesses: ['w1'] }), ['a']);
    const clean = fakeCandidate('clean', q(500), ['a']);
    expect(selectBestCandidate([weak, clean])!.id).toBe('clean');

    const short = fakeCandidate('short', q(500), ['a']);
    const long = fakeCandidate('long', q(500), ['a', 'b']);
    expect(selectBestCandidate([short, long])!.id).toBe('long');

    const aa = fakeCandidate('a', q(500), ['a']);
    const bb = fakeCandidate('b', q(500), ['a']);
    expect(selectBestCandidate([bb, aa])!.id).toBe('a');
  });

  it('rejects infeasible or explicitly-rejected candidates outright', () => {
    const badFeasible = fakeCandidate('bad', q(500, { feasible: false }), ['a']);
    const rejected = {
      ...fakeCandidate('rej', q(500), ['a']),
      isRejected: true,
    };
    const good = fakeCandidate('good', q(400), ['a']);
    expect(selectBestCandidate([badFeasible, rejected, good])!.id).toBe('good');
  });

  it('returns null when nothing is feasible', () => {
    const bad = fakeCandidate('bad', q(100, { feasible: false }), ['a']);
    expect(selectBestCandidate([bad])).toBeNull();
  });

  it('ignores candidates without quality (still to be scored)', () => {
    const unscored = fakeCandidate('u', q(999), ['a']);
    (unscored as any).quality = null;
    const good = fakeCandidate('good', q(400), ['a']);
    expect(selectBestCandidate([unscored, good])!.id).toBe('good');
  });
});

// Guard: keep the JAIPUR_IDS import meaningful for future pool tweaks.
describe('pool helpers', () => {
  it('exposes the full synthetic catalog', () => {
    expect(JAIPUR_IDS.length).toBe(8);
  });
});