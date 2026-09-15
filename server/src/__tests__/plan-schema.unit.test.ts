import { describe, expect, it } from 'vitest';
import { planSchema } from '../modules/trips/trips.validation';

const base = {
  destination: 'Jaipur',
  mode: 'SELF_BUILD',
  selectedPlaceIds: ['jpr-amber-fort'],
};

function parse(body: Record<string, unknown>) {
  return planSchema.safeParse(body);
}

describe('planSchema', () => {
  it('accepts a minimal valid request', () => {
    const parsed = parse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.selectedPlaceIds).toEqual(['jpr-amber-fort']);
      expect(parsed.data.avoid).toEqual([]);
      expect(parsed.data.fixedTimePlaces).toEqual([]);
    }
  });

  it('requires destination and mode', () => {
    expect(parse({ ...base, destination: '' }).success).toBe(false);
    expect(parse({ ...base, mode: 'MANUAL' }).success).toBe(false);
    expect(parse({ destination: 'Jaipur' }).success).toBe(false);
  });

  it('coerces days / variationSeed / customBudgetAmount numbers from strings', () => {
    const parsed = parse({ ...base, days: '3', variationSeed: '7', budget: 'CUSTOM', customBudgetAmount: '5000' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.days).toBe(3);
      expect(parsed.data.variationSeed).toBe(7);
      expect(parsed.data.customBudgetAmount).toBe(5000);
    }
  });

  it('rejects days outside 1..21', () => {
    expect(parse({ ...base, days: 0 }).success).toBe(false);
    expect(parse({ ...base, days: 22 }).success).toBe(false);
  });

  it('accepts both SELF_BUILD and AI_BUILD modes', () => {
    expect(parse({ ...base, mode: 'SELF_BUILD' }).success).toBe(true);
    expect(parse({ ...base, mode: 'AI_BUILD' }).success).toBe(true);
  });

  it('accepts pace aliases via the shared preprocess', () => {
    expect(parse({ ...base, pace: 'fast' }).success).toBe(true);
    expect(parse({ ...base, pace: 'RELAXED' }).success).toBe(true);
    expect(parse({ ...base, pace: 'AWESOME' }).success).toBe(false);
  });

  it('accepts travelers aliases', () => {
    expect(parse({ ...base, travelers: 'couple' }).success).toBe(true);
    expect(parse({ ...base, travelers: 'FAMILY' }).success).toBe(true);
  });

  it('rejects CUSTOM budget without customBudgetAmount', () => {
    expect(parse({ ...base, budget: 'CUSTOM' }).success).toBe(false);
  });

  it('accepts CUSTOM budget with customBudgetAmount', () => {
    expect(parse({ ...base, budget: 'CUSTOM', customBudgetAmount: 100 }).success).toBe(true);
  });

  it('accepts fixedTimePlaces entries and validates shape', () => {
    expect(parse({ ...base, fixedTimePlaces: [{ placeId: 'x', startTime: '09:00' }] }).success).toBe(true);
    expect(parse({ ...base, fixedTimePlaces: [{ placeId: 'x' }] }).success).toBe(false);
  });

  it('is not strict: extra fields are stripped, not rejected', () => {
    const parsed = parse({ ...base, somethingElse: 42 });
    expect(parsed.success).toBe(true);
    expect((parsed.data as Record<string, unknown>).somethingElse).toBeUndefined();
  });

  it('accepts transportation enum values only', () => {
    expect(parse({ ...base, transportation: ['WALKING', 'CAR'] }).success).toBe(true);
    expect(parse({ ...base, transportation: ['TELEPORT'] }).success).toBe(false);
  });

  it('accepts regenerateDayNumber within 1..21', () => {
    expect(parse({ ...base, regenerateDayNumber: 2 }).success).toBe(true);
    expect(parse({ ...base, regenerateDayNumber: 25 }).success).toBe(false);
  });
});