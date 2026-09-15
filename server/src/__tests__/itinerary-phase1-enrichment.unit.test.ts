import { describe, expect, it } from 'vitest';
import {
  MAX_SIGHTSEEING_SLICE_MINUTES,
  computeTimeOfDaySuitability,
  estimateDurationMinutes,
  eveningAffinity,
  isPlaceOpenAt,
  nextOpenMinuteAt,
  normalizeOpeningHours,
  parseEntryFee,
  resolveEntryCost,
} from '../modules/trips/itinerary/enrichment';

const HOURS = {
  daily: [{ open: 9 * 60, close: 18 * 60 }],
};

describe('enrichment (Phase 1)', () => {
  it('estimateDurationMinutes honors catalog duration, capped to a sightseeing slice', () => {
    expect(estimateDurationMinutes({ category: 'museum', estimatedDurationMinutes: 240 })).toBe(
      MAX_SIGHTSEEING_SLICE_MINUTES,
    );
    expect(estimateDurationMinutes({ category: 'museum', estimatedDurationMinutes: 45 })).toBe(45);
    expect(estimateDurationMinutes({ category: 'landmark' })).toBe(60); // default duration
    expect(estimateDurationMinutes({ category: 'wildlife' })).toBe(150); // uncapped
  });

  it('parseEntryFee reads adult>foreigner>child precedence', () => {
    expect(parseEntryFee({ adult: 100, child: 50 })).toBe(100);
    expect(parseEntryFee({ foreigner: 300, child: 50 })).toBe(300);
    expect(parseEntryFee({ child: 50 })).toBe(50);
    expect(parseEntryFee(null)).toBeNull();
  });

  it('resolveEntryCost multiplies PER_PERSON for the whole party', () => {
    expect(resolveEntryCost({ basis: 'FREE' }, 2)).toMatchObject({ amount: 0, basis: 'FREE', trust: 'VERIFIED' });
    expect(resolveEntryCost({ adult: 100 }, 4)).toMatchObject({ amount: 400, basis: 'PER_PERSON' });
    expect(resolveEntryCost({ basis: 'PER_VEHICLE', adult: 500 }, 4)).toMatchObject({ amount: 500, basis: 'PER_VEHICLE' });
    const unknown = resolveEntryCost({}, 2);
    expect(unknown.trust).toBe('UNKNOWN');
    expect(unknown.unknownFee).toBe(false);
  });

  it('normalizeOpeningHours handles canonical minute-windows and legacy strings', () => {
    const normalized = normalizeOpeningHours(HOURS);
    expect(normalized).not.toBeNull();
    expect(normalized!.daily).toEqual([{ open: 9 * 60, close: 18 * 60 }]);
    expect(normalizeOpeningHours({ daily: [{ open: '09:00', close: '18:00' }] })!.daily).toEqual([
      { open: 9 * 60, close: 18 * 60 },
    ]);
    expect(normalizeOpeningHours(null)).toBeNull();
    expect(normalizeOpeningHours('always open')).toBeNull(); // not a calendar shape — treated unknown
  });

  it('isPlaceOpenAt decides inside/outside trusted hours; unknown -> null', () => {
    expect(isPlaceOpenAt(HOURS, null, 10 * 60)).toBe(true);
    expect(isPlaceOpenAt(HOURS, null, 19 * 60)).toBe(false);
    expect(isPlaceOpenAt(null, null, 10 * 60)).toBeNull();
  });

  it('nextOpenMinuteAt returns the next feasible open minute later the same day', () => {
    const next = nextOpenMinuteAt(HOURS, null, 8 * 60 + 15);
    expect(next).not.toBeNull();
    expect(next!).toBe(9 * 60);
    // A fully-closed day (19:00 with 9-18 hours) has no LATER opening today.
    expect(nextOpenMinuteAt(HOURS, null, 18 * 60 + 30)).toBeNull();
  });

  it('eveningAffinity is documented, category-based and deterministic', () => {
    expect(eveningAffinity({ category: 'ghat' })).toBe(10);
    expect(eveningAffinity({ category: 'viewpoint' })).toBe(8);
    expect(eveningAffinity({ category: 'market' })).toBe(7);
    expect(eveningAffinity({ category: 'waterfall' })).toBe(5);
    expect(eveningAffinity({ category: 'museum' })).toBe(0);
  });

  it('computeTimeOfDaySuitability is deterministic and within 0..1', () => {
    const suitability = computeTimeOfDaySuitability(HOURS, 'museum', null);
    for (const slot of ['MORNING', 'AFTERNOON', 'EVENING'] as const) {
      expect(suitability[slot]).toBeGreaterThanOrEqual(0);
      expect(suitability[slot]).toBeLessThanOrEqual(1);
    }
  });
});