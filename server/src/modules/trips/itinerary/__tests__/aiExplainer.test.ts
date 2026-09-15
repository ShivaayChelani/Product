/**
 * Unit tests for the Phase 2 deterministic explainer and the AI-narration guard.
 */

import { describe, it, expect } from 'vitest';
import { planTrip } from '../planner';
import { explainPlan, guardAiExplanation, MAX_AI_EXPLANATION_CHARS, type ExplainContext } from '../aiExplainer';
import type { PlanningResult } from '../phase2Types';
import { jaipurRecords, jaipurMemStore, jprIntent, JAIPUR_ORIGIN } from '../../../../__tests__/fixtures/itineraryPhase2Fixtures';
import { enrichPlace } from '../enrichment';

const store = jaipurMemStore();

async function ctxFor(intent: ReturnType<typeof jprIntent>): Promise<{ result: PlanningResult; ctx: ExplainContext }> {
  const result = await planTrip({ intent, store });
  expect(result.ok).toBe(true);
  const ctx: ExplainContext = {
    intent,
    candidate: result.chosen!,
    resolved: result.regions.pool,
    zones: result.regions.zones,
    dayStart: JAIPUR_ORIGIN,
    speedKmh: 35,
  };
  return { result, ctx };
}

describe('explainPlan', () => {
  it('produces a deterministic summary that keeps all selected places', async () => {
    const intent = jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-jantar-mantar', 'jpr-govind-dev-ji', 'jpr-jauhari-bazaar'],
    });
    const { ctx } = await ctxFor(intent);
    const explanation = explainPlan(ctx);
    expect(explanation.provider).toBe('deterministic');
    expect(explanation.summary).toContain('keeps all 5 selected places');
    expect(explanation.summary).toContain('No additional places were added.');
    expect(explanation.dayDetails).toHaveLength(ctx.candidate.days.length);
    expect(explanation.dayDetails[0].text).toContain('Day 1');
    expect(explanation.dayDetails[0].text).toContain('Hawa Mahal');
  });

  it('AI Build summaries say the priority anchors are covered', async () => {
    const intent = jprIntent({
      planningMode: 'AI_BUILD', days: 3, pace: 'QUICK',
      priorityPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'], fillWithAi: true,
    });
    const { ctx } = await ctxFor(intent);
    expect(explainPlan(ctx).summary).toContain('covers all 2 priority places');
    expect(explainPlan(ctx).summary).toContain('complementary place');
  });

  it('day detail text reflects the plan', async () => {
    const intent = jprIntent({
      planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK',
      selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'],
    });
    const { ctx } = await ctxFor(intent);
    const explanation = explainPlan(ctx);
    expect(explanation.dayDetails).toHaveLength(1);
    expect(explanation.dayDetails[0].text).toContain('2 stops');
    expect(explanation.notes).toContainEqual(expect.stringContaining('Haversine'));
  });
});

describe('guardAiExplanation', () => {
  it('accepts AI text consistent with the plan', async () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'] });
    const { ctx } = await ctxFor(intent);
    const guard = guardAiExplanation('A lovely morning at Hawa Mahal then a walk to City Palace.', ctx);
    expect(guard.accepted).toBe(true);
    expect(guard.conflictReasons).toEqual([]);
    expect(guard.explanation.provider).toBe('ai');
    expect(guard.explanation.summary).toBe('A lovely morning at Hawa Mahal then a walk to City Palace.');
    expect(guard.explanation.dayDetails).toHaveLength(ctx.candidate.days.length);
  });

  it('discards AI text that mentions a place absent from the plan', async () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace'] });
    const { ctx } = await ctxFor(intent);
    // Simulate the guard running with the FULL catalog resolved while the plan
    // only covers two stops: "Amber Fort" is in the pool but not the plan.
    const guardCtx: ExplainContext = {
      ...ctx,
      resolved: jaipurRecords().map((r) =>
        enrichPlace(r, {
          travelerCount: 2,
          date: null,
          state: { selected: false, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: false, optional: false },
        })),
    };
    const guard = guardAiExplanation('Amber Fort is a must-see on this trip.', guardCtx);
    expect(guard.accepted).toBe(false);
    expect(guard.conflictReasons.length).toBeGreaterThan(0);
    expect(guard.conflictReasons[0]).toContain('Amber Fort');
    expect(guard.explanation.provider).toBe('deterministic');
    expect(guard.explanation.summary).not.toContain('Amber Fort');
  });

  it('discards AI text referencing a day outside the trip range', async () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal'] });
    const { ctx } = await ctxFor(intent);
    const guard = guardAiExplanation('Day 5 is completely free.', ctx);
    expect(guard.accepted).toBe(false);
    expect(guard.conflictReasons[0]).toContain('day 5 outside the 1-day trip');
  });

  it('rejects empty AI text', async () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal'] });
    const { ctx } = await ctxFor(intent);
    const guard = guardAiExplanation('   ', ctx);
    expect(guard.accepted).toBe(false);
    expect(guard.conflictReasons[0]).toBe('no AI explanation text supplied');
    expect(guard.explanation.provider).toBe('deterministic');
  });

  it('rejects AI text longer than the cap', async () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal'] });
    const { ctx } = await ctxFor(intent);
    const guard = guardAiExplanation('x'.repeat(MAX_AI_EXPLANATION_CHARS + 1), ctx);
    expect(guard.accepted).toBe(false);
    expect(guard.conflictReasons[0]).toContain('exceeds');
    expect(guard.explanation.notes.join(' ')).toContain(String(MAX_AI_EXPLANATION_CHARS));
  });
});