import { describe, expect, it } from 'vitest';
import { placePassesBudgetFilter, LOW_BUDGET_ENTRY_FEE_CAP } from '../modules/trips/budgetFilter';
import { aiGenerateSchema } from '../modules/trips/trips.validation';

const base = {
  destination: 'Jaipur',
  days: 3,
  pace: 'BALANCED',
  travelers: 'SOLO',
  interests: ['heritage'],
};

describe('itinerary budget filter (business logic)', () => {
  it('LOW rejects adult tickets above the existing cap', () => {
    expect(LOW_BUDGET_ENTRY_FEE_CAP).toBe(200);
    expect(placePassesBudgetFilter(500, { budgetTier: 'LOW', avoid: [] })).toBe(false);
    expect(placePassesBudgetFilter(50, { budgetTier: 'LOW', avoid: [] })).toBe(true);
    expect(placePassesBudgetFilter(null, { budgetTier: 'LOW', avoid: [] })).toBe(true);
  });

  it('HIGH and MEDIUM do not apply the LOW entry cap', () => {
    expect(placePassesBudgetFilter(500, { budgetTier: 'HIGH', avoid: [] })).toBe(true);
    expect(placePassesBudgetFilter(500, { budgetTier: 'MEDIUM', avoid: [] })).toBe(true);
  });

  it('CUSTOM (null tier) does not apply the LOW entry cap', () => {
    expect(placePassesBudgetFilter(500, { budgetTier: null, avoid: [] })).toBe(true);
  });

  it('EXPENSIVE_ENTRY avoid still filters high fees even on MEDIUM', () => {
    expect(placePassesBudgetFilter(500, { budgetTier: 'MEDIUM', avoid: ['EXPENSIVE_ENTRY'] })).toBe(false);
  });
});

describe('ai-generate budget validation', () => {
  it('accepts LOW and HIGH without a custom amount', () => {
    expect(aiGenerateSchema.safeParse({ ...base, budget: 'LOW' }).success).toBe(true);
    expect(aiGenerateSchema.safeParse({ ...base, budget: 'HIGH' }).success).toBe(true);
  });

  it('rejects CUSTOM when customBudgetAmount is missing', () => {
    const parsed = aiGenerateSchema.safeParse({ ...base, budget: 'CUSTOM' });
    expect(parsed.success).toBe(false);
  });

  it('accepts CUSTOM with a numeric customBudgetAmount', () => {
    const parsed = aiGenerateSchema.safeParse({
      ...base,
      budget: 'CUSTOM',
      customBudgetAmount: 85000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.budget).toBe('CUSTOM');
      expect(parsed.data.customBudgetAmount).toBe(85000);
    }
  });

  it('rejects a negative customBudgetAmount', () => {
    const parsed = aiGenerateSchema.safeParse({
      ...base,
      budget: 'CUSTOM',
      customBudgetAmount: -1,
    });
    expect(parsed.success).toBe(false);
  });
});
