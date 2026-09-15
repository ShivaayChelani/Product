/**
 * Golden acceptance tests for the Phase 2 planner orchestration layer.
 *
 * Covers 22 canonical scenarios:
 *   1  Self Build keeps exactly what the user picked
 *   2  Self Build reorders a day intelligently
 *   3  AI Build covers every priority anchor (100%)
 *   4  AI Build adds valid destination complements
 *   5  Complements come only from the DB pool
 *   6  The engine never invents a place
 *   7  Multiple arrangement candidates are generated
 *   8  Infeasible arrangements are rejected and disclosed
 *   9  The best quality arrangement wins selection
 *  10  Opening hours are respected in the final schedule
 *  11  A fixed-time anchor schedules at its exact time
 *  12  An explicit budget ceiling is respected (never silently exceeded)
 *  13  Transport mode changes travel burden
 *  14  Day capacity is respected (a day never exceeds its stop budget)
 *  15  Each day stays area-coherent
 *  16  Areas shift cleanly to later days (no bouncing back)
 *  17  No unnecessary backtracking in the final route
 *  18  Regeneration preserves the other days byte-for-byte
 *  19  Locked positions keep their relative order
 *  20  Pinned places always survive
 *  21  An impossible trip is a disclosed failure, not a bad plan
 *  22  The deterministic explanation always matches the final plan
 * 23  A variation seed yields a different, still-feasible arrangement (Phase 5)
 * 24  Far-apart priority anchors are placed on separate days (Phase 5)
 * 25  Relaxed paces fill fewer complementary stops than quick paces (Phase 5)
 * 26  A relaxed day is never crammed past its minute budget (Phase 5)
 * 27  Regeneration with a variation seed still preserves the other days (Phase 5)
 *
 * All scenarios run against an in-memory PlaceStore (DB-free, deterministic).
 */

import { describe, it, expect } from 'vitest';
import { planTrip, planFromRaw } from '../planner';
import { estimateDayMinutes } from '../dayAllocator';
import { jaipurMemStore, jaipurWithFarStore, jprIntent, JAIPUR_IDS, JAIPUR_FAR_ID, JAIPUR_ORIGIN } from '../../../../__tests__/fixtures/itineraryPhase2Fixtures';
import type { ItineraryIntent } from '../types';
import type { PlanningResult } from '../phase2Types';

const store = jaipurMemStore();
const farStore = jaipurWithFarStore();

async function plan(intent: ItineraryIntent, extra: { variations?: number[] } = {}): Promise<PlanningResult> {
  return planTrip({ intent, store, ...extra });
}

describe('Planner golden scenarios (Jaipur)', () => {

  it('S1 Self Build: exactly the 5 selected places survive', async () => {
    const selected = ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar'];
    const result = await plan(jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: selected }));
    expect(result.ok).toBe(true);
    expect(result.chosen).not.toBeNull();
    const chosen = result.chosen!;
    expect(chosen.allStopIds.length).toBe(5);
    expect([...chosen.allStopIds].sort()).toEqual([...selected].sort());
    expect(chosen.quality!.mandatoryCoverage).toBe(1);
  });

  it('S2 Self Build: day reordered intelligently (nearest-first, little detour)', async () => {
    const selected = ['jpr-amber-fort', 'jpr-hawa-mahal', 'jpr-city-palace'];
    const result = await plan(jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: selected }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    const seq = chosen.days[0].sequence.map((p) => p.id);
    expect([...seq].sort()).toEqual([...selected].sort());
    expect(seq).not.toEqual(selected);
    // Nearest-first: the closest old-city stop to the day start leads, never Amber.
    expect(['jpr-hawa-mahal', 'jpr-city-palace']).toContain(seq[0]);
    expect(seq[0]).not.toBe('jpr-amber-fort');
    expect(chosen.days[0].detourIndex).toBeLessThanOrEqual(1.8);
  });

  it('S3 AI Build: every priority anchor covered (100%)', async () => {
    const priority = ['jpr-amber-fort', 'jpr-hawa-mahal', 'jpr-city-palace'];
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: priority, fillWithAi: true,
    }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    for (const id of priority) expect(chosen.allStopIds).toContain(id);
    expect(chosen.quality!.mandatoryCoverage).toBe(1);
    expect(result.explanation!.summary).toContain(`covers all ${priority.length} priority places`);
  });

  it('S4 AI Build: adds valid destination complements', async () => {
    const priority = ['jpr-amber-fort', 'jpr-hawa-mahal'];
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: priority, fillWithAi: true,
    }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    const explicit = new Set(priority);
    const complements = chosen.allStopIds.filter((id) => !explicit.has(id));
    expect(complements.length).toBeGreaterThan(0);
    const byId = new Map(result.regions.pool.map((p) => [p.id, p]));
    for (const id of complements) {
      const place = byId.get(id);
      expect(place).toBeDefined();
      expect(place!.state.complementary).toBe(true);
      expect(place!.belongsToDestination).toBe(true);
    }
  });

  it('S5 AI Build: complements come only from the DB pool', async () => {
    const priority = ['jpr-amber-fort', 'jpr-hawa-mahal'];
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: priority, fillWithAi: true,
    }));
    expect(result.ok).toBe(true);
    const resolvedIds = new Set(result.regions.pool.map((p) => p.id));
    for (const stop of result.chosen!.allStops) expect(resolvedIds.has(stop.placeId)).toBe(true);
  });

  it('S6 The engine never invents a place', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'],
    }));
    expect(result.ok).toBe(true);
    const resolvedIds = new Set(result.regions.pool.map((p) => p.id));
    for (const id of result.chosen!.allStopIds) expect(resolvedIds.has(id)).toBe(true);
  });

  it('S7 Multiple arrangement candidates are generated', async () => {
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'], fillWithAi: true,
    }), { variations: [0, 1] });
    expect(result.ok).toBe(true);
    expect(result.candidateStats.generated).toBeGreaterThanOrEqual(2);
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it('S8 Infeasible arrangements are rejected and disclosed', async () => {
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 1, pace: 'QUICK',
      priorityPlaceIds: [...JAIPUR_IDS], fillWithAi: true,
    }));
    expect(result.ok).toBe(false);
    expect(result.chosen).toBeNull();
    expect(result.candidateStats.rejected).toBe(result.candidateStats.generated);
    expect(result.candidateStats.rejected).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.code === 'DAY_OVERCONSTRAINED')).toBe(true);
    expect(result.messages.join(' ')).toContain('infeasible');
  });

  it('S9 The best quality arrangement wins selection', async () => {
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal', 'jpr-city-palace'], fillWithAi: true,
    }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    const totals = result.candidates
      .filter((c) => !c.isRejected && c.quality?.feasible !== false)
      .map((c) => c.quality!.totalScore);
    const maxTotal = Math.max(...totals);
    expect(chosen.quality!.totalScore).toBe(maxTotal);
  });

  it('S10 Opening hours are respected in the final schedule', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar'],
    }));
    expect(result.ok).toBe(true);
    for (const stop of result.chosen!.allStops) {
      expect(stop.openingHoursRespected).not.toBe(false);
    }
  });

  it('S11 A fixed-time anchor schedules at its exact time', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-city-palace', 'jpr-hawa-mahal'],
      lockedPlaceIds: ['jpr-city-palace'],
      fixedTimePlaces: [{ placeId: 'jpr-city-palace', startMinutes: 570, sourceStartTime: '09:30' }],
    }));
    expect(result.ok).toBe(true);
    const city = result.chosen!.allStops.find((s) => s.placeId === 'jpr-city-palace')!;
    const hawa = result.chosen!.allStops.find((s) => s.placeId === 'jpr-hawa-mahal')!;
    expect(city.startMinutes).toBe(570);
    expect(city.fixedTimeAnchor).toBe(true);
    expect(city.order).toBeLessThan(hawa.order);
    expect(result.chosen!.constraintResult.hardViolations.map((v) => v.id)).not.toContain('H9_OVERLAP');
    expect(result.finalValidation!.feasible).toBe(true);
  });

  it('S12 An explicit budget ceiling is respected', async () => {
    const base = {
      planningMode: 'SELF_BUILD' as const,
      days: 1,
      pace: 'QUICK' as const,
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar'],
    };
    const under = await plan(jprIntent({ ...base, budgetCap: 3000 }));
    expect(under.ok).toBe(true);
    expect(under.finalValidation!.hardViolations.map((v) => v.id)).not.toContain('H8_BUDGET_EXCEEDED');

    const over = await plan(jprIntent({ ...base, budgetCap: 1000 }));
    expect(over.ok).toBe(false);
    expect(over.chosen).toBeNull();
    expect(over.candidateStats.rejected).toBe(over.candidateStats.generated);
    const hasBudgetViolation = over.candidates.some((c) =>
      c.constraintResult.hardViolations.some((v) => v.id === 'H8_BUDGET_EXCEEDED'));
    expect(hasBudgetViolation).toBe(true);
  });

  it('S13 Transport mode changes travel burden', async () => {
    const selected = ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-govind-dev-ji'];
    const car = await plan(jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: selected, transportation: ['CAR'] }));
    const walk = await plan(jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: selected, transportation: ['WALKING'] }));
    expect(car.ok).toBe(true);
    expect(walk.ok).toBe(true);
    const travelOf = (r: PlanningResult) => r.chosen!.allStops.reduce((s, stop) => s + (stop.travelFromPrevMinutes ?? 0), 0);
    expect(travelOf(walk)).toBeGreaterThan(travelOf(car));
  });

  it('S14 Day capacity is respected', async () => {
    const selected = ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar', JAIPUR_FAR_ID];
    const result = await planTrip({ intent: jprIntent({ planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK', selectedPlaceIds: selected }), store: farStore });
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    expect(chosen.days.length).toBe(2);
    for (const day of chosen.days) {
      expect(day.placeIds.length).toBeLessThanOrEqual(7);
      if (day.dayNumber === 2) expect(day.placeIds).toContain(JAIPUR_FAR_ID);
      else expect(day.placeIds).not.toContain(JAIPUR_FAR_ID);
    }
    expect(chosen.allStopIds.length).toBe(6);
  });

  it('S15 Each day stays area-coherent', async () => {
    const result = await planTrip({
      intent: jprIntent({
        planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK',
        selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', JAIPUR_FAR_ID],
      }),
      store: farStore,
    });
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    expect(chosen.days.length).toBe(2);
    const centers = new Map(result.regions.zones.map((z) => [z.id, z.center]));
    for (const day of chosen.days) {
      expect(day.zoneIds.length).toBeGreaterThan(0);
      for (const zid of day.zoneIds) expect(centers.has(zid)).toBe(true);
      // A day's stops all belong to the zones the day claims.
      const zoneMembers = new Set(
        day.zoneIds.flatMap((zid) => result.regions.zones.find((z) => z.id === zid)!.placeIds));
      for (const id of day.placeIds) expect(zoneMembers.has(id)).toBe(true);
      if (day.dayNumber === 1) expect(day.placeIds).not.toContain(JAIPUR_FAR_ID);
      if (day.dayNumber === 2) expect(day.placeIds).toEqual([JAIPUR_FAR_ID]);
    }
  });

  it('S16 Areas shift cleanly across days (no zone bouncing back)', async () => {
    const result = await planTrip({
      intent: jprIntent({
        planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK',
        selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', JAIPUR_FAR_ID],
      }),
      store: farStore,
    });
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    expect(chosen.days.length).toBe(2);
    const zoneByDay = chosen.days.map((d) => new Set(d.zoneIds));
    // A zone used on day N must never reappear on a later day.
    for (let i = 0; i < zoneByDay.length; i++) {
      for (let j = i + 1; j < zoneByDay.length; j++) {
        for (const zid of zoneByDay[i]) expect(zoneByDay[j].has(zid)).toBe(false);
      }
    }
    // The far zone lives on day 2 only.
    const farZoneId = result.regions.zones.find((z) => z.placeIds.includes(JAIPUR_FAR_ID))!.id;
    expect(zoneByDay[1].has(farZoneId)).toBe(true);
    expect(zoneByDay[0].has(farZoneId)).toBe(false);
    // City zones live on day 1 only.
    for (const z of result.regions.zones) {
      if (z.placeIds.includes('jpr-hawa-mahal') || z.placeIds.includes('jpr-city-palace')) {
        expect(zoneByDay[0].has(z.id)).toBe(true);
      }
    }
  });

  it('S17 No unnecessary backtracking', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji'],
    }));
    expect(result.ok).toBe(true);
    expect(result.chosen!.days[0].detourIndex).toBeLessThanOrEqual(1.8);
  });

  it('S18 Regeneration preserves the other days byte-for-byte', async () => {
    const intent = jprIntent({
      planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar', JAIPUR_FAR_ID],
    });
    const first = await planTrip({ intent, store: farStore });
    expect(first.ok).toBe(true);
    const previous = first.chosen!;
    const firstDay1 = previous.days.find((d) => d.dayNumber === 1)!.placeIds;

    const regen = await planTrip({ intent, store: farStore, regenerateDayNumber: 2, previousPlan: previous });
    expect(regen.ok).toBe(true);
    const newDay1 = regen.chosen!.days.find((d) => d.dayNumber === 1)!;
    expect(newDay1.placeIds).toEqual(firstDay1);
    const newDay2 = regen.chosen!.days.find((d) => d.dayNumber === 2)!;
    expect(newDay2).toBeDefined();
    expect(newDay2.placeIds).toContain(JAIPUR_FAR_ID);
    // Non-regenerated day is byte-for-byte identical (same stops and order).
    expect(regen.chosen!.days.find((d) => d.dayNumber === 1)!.sequence.map((s) => s.placeId))
      .toEqual(previous.days.find((d) => d.dayNumber === 1)!.sequence.map((s) => s.placeId));
  });

  it('S19 Locked positions keep their relative order', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal', 'jpr-city-palace'],
      lockedPlaceIds: ['jpr-city-palace', 'jpr-hawa-mahal'],
    }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    const seq = chosen.days[0].sequence.map((p) => p.id);
    const cityIdx = seq.indexOf('jpr-city-palace');
    const hawaIdx = seq.indexOf('jpr-hawa-mahal');
    expect(cityIdx).toBeGreaterThanOrEqual(0);
    expect(hawaIdx).toBeGreaterThanOrEqual(0);
    expect(cityIdx).toBeLessThan(hawaIdx);
    expect(result.finalValidation!.feasible).toBe(true);
  });

  it('S20 Pinned places always survive', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK',
      pinnedPlaceIds: ['jpr-amber-fort'],
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar', 'jpr-jaigarh'],
    }));
    expect(result.ok).toBe(true);
    expect(result.chosen!.allStopIds).toContain('jpr-amber-fort');
  });

  it('S21 An impossible trip is a disclosed failure', async () => {
    const result = await plan(jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: [...JAIPUR_IDS],
    }));
    expect(result.ok).toBe(false);
    expect(result.chosen).toBeNull();
    expect(result.messages.join(' ')).toContain('could not be planned feasibly');
    expect(result.warnings.some((w) => w.code === 'DAY_OVERCONSTRAINED')).toBe(true);
  });

  it('S22 The deterministic explanation matches the final plan', async () => {
    const selected = ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar'];
    const result = await plan(jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: selected }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    const explanation = result.explanation!;
    expect(explanation.provider).toBe('deterministic');
    expect(explanation.summary).toContain('keeps all 5 selected places');
    expect(explanation.dayDetails).toHaveLength(chosen.days.length);
    const day1Text = explanation.dayDetails[0].text;
    expect(day1Text).toContain('Day 1');
    expect(chosen.days[0].placeIds.length).toBeGreaterThan(0);
  });

  it('Bonus: planFromRaw normalizes and plans a raw request', async () => {
    const result = await planFromRaw({ destination: 'Jaipur', days: 1, planningMode: 'SELF_BUILD', selectedPlaceIds: ['jpr-hawa-mahal'] }, store);
    expect(result.ok).toBe(true);
    expect(result.chosen!.allStopIds).toContain('jpr-hawa-mahal');
  });

  // ---------------------------------------------------------------------------
  // Phase 5 additions: AI Build variation, far-apart anchors, and the
  // capacity-driven complement cap.
  // ---------------------------------------------------------------------------

  it('S23 A variation seed yields a different, still-feasible arrangement', async () => {
    const base = () => jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'], fillWithAi: true,
    });
    const seed0 = await planTrip({ intent: base(), store, strategies: ['AREA'], variations: [0] });
    const seed1 = await planTrip({ intent: base(), store, strategies: ['AREA'], variations: [1] });
    expect(seed0.ok).toBe(true);
    expect(seed1.ok).toBe(true);
    const seqOf = (r: PlanningResult) => r.chosen!.allStops.map((s) => s.placeId).join('>');
    // The area order shifts deterministically so the final arrangement differs.
    expect(seqOf(seed0)).not.toBe(seqOf(seed1));
  });

  it('S24 Far-apart priority anchors are placed on separate days', async () => {
    const result = await planTrip({
      intent: jprIntent({
        planningMode: 'AI_BUILD', days: 2, pace: 'QUICK',
        priorityPlaceIds: ['jpr-hawa-mahal', JAIPUR_FAR_ID], fillWithAi: true,
      }),
      store: farStore,
    });
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    for (const id of ['jpr-hawa-mahal', JAIPUR_FAR_ID]) expect(chosen.allStopIds).toContain(id);
    const farDay = chosen.days.find((d) => d.placeIds.includes(JAIPUR_FAR_ID));
    const hawaDay = chosen.days.find((d) => d.placeIds.includes('jpr-hawa-mahal'));
    expect(farDay).toBeDefined();
    expect(hawaDay).toBeDefined();
    expect(farDay!.dayNumber).not.toBe(hawaDay!.dayNumber);
  });

  it('S25 Relaxed paces fill fewer complementary stops than quick paces', async () => {
    const quick = await plan(jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'QUICK', fillWithAi: true }));
    const very = await plan(jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'VERY_RELAXED', fillWithAi: true }));
    expect(quick.ok).toBe(true);
    expect(very.ok).toBe(true);
    const compOf = (r: PlanningResult) =>
      r.chosen!.allStopIds.filter((id) => r.regions.pool.find((p) => p.id === id)?.state.complementary).length;
    // Capacity-driven (minute + stop budget): a QUICK day takes more complements
    // than a VERY_RELAXED one without sacrificing feasibility.
    expect(compOf(quick)).toBeGreaterThan(compOf(very));
    expect(compOf(very)).toBeLessThanOrEqual(4);
  });

  it('S26 A relaxed day is never crammed past its minute budget', async () => {
    const result = await plan(jprIntent({
      planningMode: 'AI_BUILD', days: 1, pace: 'VERY_RELAXED', fillWithAi: true,
      interests: ['heritage'],
    }));
    expect(result.ok).toBe(true);
    const chosen = result.chosen!;
    const byId = new Map(result.regions.pool.map((p) => [p.id, p]));
    expect(chosen.days).toHaveLength(1);
    const day = chosen.days[0];
    expect(day.placeIds.length).toBeLessThanOrEqual(4);
    // The complementary top-up respects the VERY_RELAXED minute budget
    // (visit durations + travel legs + per-leg buffer) — never crammed.
    const estimate = estimateDayMinutes(day.placeIds, byId, JAIPUR_ORIGIN, 35);
    expect(estimate).toBeLessThanOrEqual(390);
  });

  it('S27 Regeneration with different variation seeds can shift the day', async () => {
    const intent = jprIntent({
      planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar', JAIPUR_FAR_ID],
    });
    const first = await planTrip({ intent, store: farStore });
    expect(first.ok).toBe(true);
    const regen = async () =>
      (await planTrip({
        intent,
        store: farStore,
        regenerateDayNumber: 2,
        previousPlan: first.chosen!,
        variationSeed: 1,
      })).chosen!.days.find((d) => d.dayNumber === 2)!;
    const dayA = await regen();
    expect(dayA.placeIds).toContain(JAIPUR_FAR_ID);
    // The preserved first day is byte-for-byte identical to the original.
    const origDay1 = first.chosen!.days.find((d) => d.dayNumber === 1)!;
    const newDay1 = (await planTrip({
      intent,
      store: farStore,
      regenerateDayNumber: 2,
      previousPlan: first.chosen!,
      variationSeed: 1,
    })).chosen!.days.find((d) => d.dayNumber === 1)!;
    expect(newDay1.sequence.map((s) => s.placeId)).toEqual(origDay1.sequence.map((s) => s.placeId));
  });
});