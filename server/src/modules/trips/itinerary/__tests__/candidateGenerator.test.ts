/**
 * Unit tests for the Phase 2 candidate generator: multi-strategy generation,
 * mode contracts (Self Build exactly-selected / AI Build anchors), rejection
 * disclosure, and the single-day regeneration contract skip.
 */

import { describe, it, expect } from 'vitest';
import type { EnrichedPlace, ItineraryIntent } from '../types';
import { enrichPlace } from '../enrichment';
import { buildZones } from '../clustering';
import {
  generateCandidates,
  evaluateSelfBuildContract,
  evaluateAiBuildContract,
  complementaryPlaceIds,
} from '../candidateGenerator';
import { jaipurRecords, jprIntent, JAIPUR_IDS, JAIPUR_ORIGIN } from '../../../../__tests__/fixtures/itineraryPhase2Fixtures';

function poolFor(intent: ItineraryIntent): EnrichedPlace[] {
  const explicit = new Set([
    ...intent.selectedPlaceIds,
    ...intent.pinnedPlaceIds,
    ...intent.lockedPlaceIds,
    ...intent.fixedTimePlaces.map((f) => f.placeId),
    ...intent.priorityPlaceIds,
  ]);
  return jaipurRecords()
    .filter((r) => explicit.has(r.id) || intent.planningMode === 'AI_BUILD')
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

function run(intent: ItineraryIntent, extra: Partial<Parameters<typeof generateCandidates>[0]> = {}) {
  const resolved = extra.resolved ?? poolFor(intent);
  const zones = buildZones(resolved, { includePlaceIds: [...intent.lockedPlaceIds, ...intent.pinnedPlaceIds] });
  return generateCandidates({ intent, resolved, zones, dayStart: JAIPUR_ORIGIN, speedKmh: 35, ...extra });
}

const AI_3DAY = jprIntent({
  planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
  priorityPlaceIds: [JAIPUR_IDS[0], JAIPUR_IDS[3]], fillWithAi: true,
});

describe('generateCandidates', () => {
  it('deduplicates identical arrangements across strategies', () => {
    // All strategies produce the SAME stop set for this intent, so the
    // signature dedup keeps exactly one candidate (PRIORITY-v0, first written).
    const result = run(AI_3DAY);
    expect(result.candidates).toHaveLength(1);
    expect(result.feasible).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.candidates[0].meta.strategy).toBe('PRIORITY');
    const signatures = result.candidates.map((c) => c.allStopIds.join('|'));
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('different variations produce distinct arrangements', () => {
    const result = run(AI_3DAY, { variations: [0, 1] });
    expect(result.candidates.length).toBeGreaterThan(1);
    const signatures = new Set(result.candidates.map((c) => c.allStopIds.join('|')));
    expect(signatures.size).toBe(result.candidates.length);
    expect(result.feasible + result.rejected).toBe(result.candidates.length);
  });

  it('never invents places: every stop is a member of the resolved pool', () => {
    const resolved = poolFor(AI_3DAY);
    const result = run(AI_3DAY, { resolved });
    const poolIds = new Set(resolved.map((p) => p.id));
    for (const c of result.candidates) {
      for (const id of c.allStopIds) expect(poolIds.has(id)).toBe(true);
    }
  });

  it('marks every arrangement infeasible when capacity cannot hold the anchors (AI)', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'QUICK', priorityPlaceIds: [...JAIPUR_IDS], fillWithAi: true });
    const result = run(intent);
    expect(result.rejected).toBe(result.candidates.length);
    for (const c of result.candidates) expect(c.isRejected).toBe(true);
    const codes = new Set(result.warnings.map((w) => w.code));
    expect(codes.has('DAY_OVERCONSTRAINED')).toBe(true);
  });

  it('skips the mode contract during single-day regeneration', () => {
    // A reduced pool (fewer stops than the selected set) would violate SELF_BUILD
    // on a full plan, but is legal for a single rebuilt day.
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'] });
    const reduced = poolFor(intent).slice(0, 1);
    const result = run(intent, { resolved: reduced, singleDay: 1 });
    for (const c of result.candidates) expect(c.isRejected).toBe(false);
  });
});

describe('Mode contracts', () => {
  it('SELF_BUILD rejects any candidate containing a non-explicit place', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', selectedPlaceIds: ['jpr-hawa-mahal'] });
    const { isRejected, rejectionReasons } = evaluateSelfBuildContract(
      intent, poolFor(intent), ['jpr-hawa-mahal', 'jpr-city-palace'], [],
    );
    expect(isRejected).toBe(true);
    expect(rejectionReasons.join(' ')).toContain('added unselected places');
  });

  it('SELF_BUILD rejects a plan that drops a selected place', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'] });
    const warnings: any[] = [];
    const { isRejected, rejectionReasons } = evaluateSelfBuildContract(intent, poolFor(intent), ['jpr-hawa-mahal'], warnings);
    expect(isRejected).toBe(true);
    expect(rejectionReasons.join(' ')).toContain('dropped selected place');
    expect(warnings.some((w) => w.code === 'SELECTED_PLACE_DROPPED')).toBe(true);
  });

  it('AI_BUILD rejects when a priority anchor is missing from the plan', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', priorityPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'], fillWithAi: true });
    const warnings: any[] = [];
    const { isRejected, rejectionReasons } = evaluateAiBuildContract(intent, poolFor(intent), ['jpr-hawa-mahal'], warnings);
    expect(isRejected).toBe(true);
    expect(rejectionReasons.join(' ')).toContain('dropped mandatory anchor');
    expect(warnings.some((w) => w.code === 'PRIORITY_PLACE_DROPPED')).toBe(true);
  });

  it('complementaryPlaceIds reports only non-explicit stops', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', priorityPlaceIds: ['jpr-amber-fort'], fillWithAi: true });
    const all = ['jpr-amber-fort', 'jpr-hawa-mahal', 'jpr-jantar-mantar'];
    const complements = complementaryPlaceIds(intent, all);
    expect(complements).toEqual(['jpr-hawa-mahal', 'jpr-jantar-mantar']);
  });
});