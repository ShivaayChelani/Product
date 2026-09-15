import { describe, expect, it } from 'vitest';
import { recoverCustomBudgetAmount } from '../modules/trips/customBudget';
import { aiGenerateSchema, planSchema } from '../modules/trips/trips.validation';

describe('recoverCustomBudgetAmount (BUG 3)', () => {
  it('A: CUSTOM + valid request amount succeeds', () => {
    expect(recoverCustomBudgetAmount({
      budget: 'CUSTOM',
      requestAmount: 12000,
    })).toBe(12000);
  });

  it('B: CUSTOM + saved column amount is reused when the request omits it', () => {
    expect(recoverCustomBudgetAmount({
      budget: 'CUSTOM',
      requestAmount: undefined,
      persistedAmount: 8500,
    })).toBe(8500);
  });

  it('B: CUSTOM + saved aiPreferences amount is reused after reload', () => {
    expect(recoverCustomBudgetAmount({
      budget: 'CUSTOM',
      requestAmount: undefined,
      persistedAmount: null,
      aiPreferences: { customBudgetAmount: 4500, budget: 'CUSTOM' },
    })).toBe(4500);
  });

  it('C: CUSTOM + genuinely missing amount stays undefined so the caller can 400', () => {
    expect(recoverCustomBudgetAmount({
      budget: 'CUSTOM',
      requestAmount: undefined,
      persistedAmount: null,
      aiPreferences: { budget: 'CUSTOM' },
    })).toBeUndefined();
  });

  it('D: NORMAL budget does not invent a custom amount', () => {
    expect(recoverCustomBudgetAmount({
      budget: 'MEDIUM',
      requestAmount: undefined,
      persistedAmount: 9999,
    })).toBeUndefined();
  });
});

describe('CUSTOM budget schema (BUG 3)', () => {
  const base = { destination: 'Jaipur', days: 3, pace: 'BALANCED', travelers: 'SOLO' };

  it('initial CUSTOM without amount is still rejected', () => {
    const parsed = aiGenerateSchema.safeParse({ ...base, budget: 'CUSTOM' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message.includes('customBudgetAmount is required'))).toBe(true);
    }
  });

  it('regeneration CUSTOM with tripId may omit the amount (service recovers it)', () => {
    expect(aiGenerateSchema.safeParse({
      ...base,
      tripId: 'trip_1',
      budget: 'CUSTOM',
    }).success).toBe(true);
    expect(planSchema.safeParse({
      destination: 'Jaipur',
      mode: 'AI_BUILD',
      tripId: 'trip_1',
      budget: 'CUSTOM',
    }).success).toBe(true);
  });

  it('MEDIUM is unchanged', () => {
    expect(aiGenerateSchema.safeParse({ ...base, budget: 'MEDIUM' }).success).toBe(true);
  });
});
