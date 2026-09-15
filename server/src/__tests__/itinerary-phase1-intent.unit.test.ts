import { describe, expect, it } from 'vitest';
import {
  daysBetweenInclusive,
  normalizeIntent,
  parseStartTimeToMinutes,
  resolveTravelerCount,
} from '../modules/trips/itinerary/intent';

describe('intent normalization (Phase 1)', () => {
  it('parseStartTimeToMinutes parses 12h/24h inputs', () => {
    expect(parseStartTimeToMinutes('09:00')).toBe(9 * 60);
    expect(parseStartTimeToMinutes('9:30 PM')).toBe(21 * 60 + 30);
    expect(parseStartTimeToMinutes('12:00 AM')).toBe(0);
    expect(parseStartTimeToMinutes('12:30pm')).toBe(12 * 60 + 30);
    expect(parseStartTimeToMinutes('25:00')).toBeNull();
    expect(parseStartTimeToMinutes('garbage')).toBeNull();
  });

  it('daysBetweenInclusive counts both endpoints', () => {
    expect(daysBetweenInclusive('2025-12-01', '2025-12-05')).toBe(5);
    expect(daysBetweenInclusive('2025-12-01', '2025-12-01')).toBe(1);
  });

  it('resolveTravelerCount mirrors the legacy app', () => {
    expect(resolveTravelerCount('SOLO')).toBe(1);
    expect(resolveTravelerCount('COUPLE')).toBe(2);
    expect(resolveTravelerCount('FAMILY')).toBe(3);
    expect(resolveTravelerCount('FRIENDS')).toBe(3);
    expect(resolveTravelerCount(4)).toBe(4);
    expect(resolveTravelerCount(null)).toBe(1);
  });

  it('derives days from dates when explicit days are omitted', () => {
    const result = normalizeIntent({
      destination: 'Jabalpur',
      planningMode: 'SELF_BUILD',
      startDate: '2025-12-01',
      endDate: '2025-12-03',
    });
    expect(result.ok).toBe(true);
    expect(result.intent.days).toBe(3);
    expect(result.intent.startDate).toBe('2025-12-01');
    expect(result.intent.endDate).toBe('2025-12-03');
  });

  it('clamps days into 1..21 and flags errors', () => {
    const result = normalizeIntent({ destination: 'Jaipur', planningMode: 'AI_BUILD', days: 40 });
    expect(result.intent.days).toBe(21);
    expect(result.errors).toContain('days must be between 1 and 21 (got 40).');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed fixed times but keeps valid ones', () => {
    const result = normalizeIntent({
      destination: 'Mumbai',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['mum-gateway'],
      fixedTimePlaces: [
        { placeId: 'mum-gateway', startTime: '07:00 PM' },
        { placeId: 'mum-museum', startTime: 'o-clock' },
      ],
    });
    expect(result.intent.fixedTimePlaces).toHaveLength(1);
    expect(result.intent.fixedTimePlaces[0].startMinutes).toBe(19 * 60);
    expect(result.errors).toContain('Invalid fixed time "o-clock" for place mum-museum. Expected HH:MM.');
  });

  it('deduplicates ids and interests', () => {
    const result = normalizeIntent({
      destination: 'Jabalpur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['a', 'a', 'b'],
      interests: ['Waterfalls', 'waterfalls', '  food  '],
    });
    expect(result.intent.selectedPlaceIds).toEqual(['a', 'b']);
    expect(result.intent.interests).toEqual(['waterfalls', 'food']);
  });

  it('SELF_BUILD never fills with AI complements; AI_BUILD defaults to fill', () => {
    const selfBuild = normalizeIntent({ destination: 'Mumbai', planningMode: 'SELF_BUILD' });
    expect(selfBuild.intent.fillWithAi).toBe(false);
    const aiBuild = normalizeIntent({ destination: 'Mumbai', planningMode: 'AI_BUILD' });
    expect(aiBuild.intent.fillWithAi).toBe(true);
  });

  it('computes budgetCap only from a positive custom amount', () => {
    const noCap = normalizeIntent({ destination: 'Mumbai', planningMode: 'SELF_BUILD', budgetTier: 'LOW' });
    expect(noCap.intent.budgetCap).toBeNull();
    const withCap = normalizeIntent({ destination: 'Mumbai', planningMode: 'SELF_BUILD', customBudgetAmount: 4000 });
    expect(withCap.intent.budgetCap).toBe(4000);
  });

  it('clamps earliest start into 05:00-18:00', () => {
    const result = normalizeIntent({ destination: 'Jaipur', planningMode: 'AI_BUILD', earliestStartMinutes: 4 * 60 });
    expect(result.intent.earliestStartMinutes).toBe(5 * 60);
    expect(result.warnings.some((w) => w.code === 'EARLIEST_START_CLAMPED')).toBe(true);
  });

  it('warns when a fixed-time place is not among selected/priority', () => {
    const result = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort'],
      fixedTimePlaces: [{ placeId: 'jpr-nahargarh', startTime: '17:30' }],
    });
    expect(result.warnings.some((w) => w.code === 'FIXED_TIME_NOT_SELECTED')).toBe(true);
  });
});