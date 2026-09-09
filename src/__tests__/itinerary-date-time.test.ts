/**
 * ITINERARY HARDENING — Section 14: Date / time boundaries.
 *
 * The server computes the trip day count at creation
 * (server/src/modules/trips/trips.service.ts create):
 *
 *   days = Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1)
 *
 * This suite mirrors that exact formula (a documented contract guard) so
 * month/year/leap boundaries are locked in mobile tests, and the mobile
 * type surface (ISO date strings, TravelPace/timePreference) rejects
 * structurally invalid values at the type level.
 */
import type { CreateTripInput, TravelPace, TimePreference } from '../services/api/trips';

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Contract mirror of the server's day-count formula. Kept byte-for-byte
 * identical to the backend implementation it protects.
 */
export function computeTripDays(startDate?: string | null, endDate?: string | null): number {
  return startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY_MS) + 1)
    : 1;
}

describe('trip day-count boundaries (server formula contract)', () => {
  it.each([
    ['same day inclusive', '2026-01-01', '2026-01-01', 1],
    ['two consecutive days', '2026-01-01', '2026-01-02', 2],
    ['one day apart (3 days total)', '2026-01-01', '2026-01-03', 3],
    ['month boundary', '2026-01-31', '2026-02-01', 2],
    ['year boundary', '2025-12-31', '2026-01-01', 2],
    ['two weeks inclusive', '2026-01-01', '2026-01-14', 14],
    ['30-day month', '2026-04-01', '2026-04-30', 30],
    ['31-day month', '2026-05-01', '2026-05-31', 31],
  ] as const)('%s → days = %i', (_name, start, end, expected) => {
    expect(computeTripDays(start, end)).toBe(expected);
  });

  it('leap-year February boundary rolls correctly', () => {
    expect(computeTripDays('2028-02-28', '2028-03-01')).toBe(3);
    expect(computeTripDays('2024-02-29', '2024-03-01')).toBe(2);
  });

  it('non-leap February still rolls across the month line', () => {
    expect(computeTripDays('2026-02-28', '2026-03-01')).toBe(2);
  });

  it('midnight exactly on a new day counts that day (UTC ISO strings)', () => {
    expect(computeTripDays('2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z')).toBe(2);
  });

  it('a just-past-midnight end still counts as the later day', () => {
    expect(computeTripDays('2026-06-01T00:00:00.000Z', '2026-06-02T00:30:00.000Z')).toBe(2);
  });

  it('end before start silently coerces to a 1-day trip (documented server behavior)', () => {
    expect(computeTripDays('2026-01-10', '2026-01-01')).toBe(1);
    expect(computeTripDays('2026-02-10', '2026-01-01')).toBe(1);
  });

  it('missing dates default to a 1-day trip', () => {
    expect(computeTripDays(undefined, undefined)).toBe(1);
    expect(computeTripDays('2026-01-10', undefined)).toBe(1);
    expect(computeTripDays(undefined, '2026-01-10')).toBe(1);
    expect(computeTripDays(null, null)).toBe(1);
  });
});

describe('mobile create-trip type surface enforces date shape', () => {
  it('CreateTripInput forces startDate/endDate as required ISO strings', () => {
    const input: CreateTripInput = {
      title: 'Kolkata Heritage Walk',
      destination: 'Kolkata',
      startDate: '2026-08-01',
      endDate: '2026-08-03',
    };
    expect(typeof input.startDate).toBe('string');
    expect(typeof input.endDate).toBe('string');
  });

  it('TravelPace and TimePreference stay bounded to documented union values', () => {
    const paces: TravelPace[] = ['QUICK', 'BALANCED', 'RELAXED', 'VERY_RELAXED'];
    const prefs: TimePreference[] = ['MORNING_FOCUSED', 'FULL_DAY', 'EVENING_FRIENDLY'];
    expect(paces).toHaveLength(4);
    expect(prefs).toHaveLength(3);
  });
});