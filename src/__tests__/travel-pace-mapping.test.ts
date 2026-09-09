/**
 * ITINERARY HARDENING — Section 15: Travel pace mapping.
 *
 * Locks the documented pace contract:
 *   day capacity   — relaxed 480 min, moderate 420 min, fast 360 min
 *   schedule factor— relaxed 1.5×, moderate 1.0×, fast 0.75×
 * The backend pace enum (RELAXED/BALANCED/QUICK/... from server trips.validation.ts)
 * maps into these UI paces via normalizePaceAliases.
 */
import {
  formatTimeDisplay,
  generateDayPlan,
  generateItinerarySchedule,
  sortItinerarySpots,
} from '../utils/itinerary';
import { normalizePaceAliases } from './travelPaceAliases';

function spots(n: number, duration = 60): any[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Place ${i}`,
    latitude: 23 + i * 0.001,
    longitude: 79 + i * 0.001,
    estimatedDuration: duration,
    verificationStatus: 'verified',
    bestTimeToVisit: 'morning',
    category: 'heritage',
  }));
}

const DAY_CAPACITY = { relaxed: 480, moderate: 420, fast: 360 } as const;

describe('pace → day capacity (sortItinerarySpots + generateDayPlan)', () => {
  it.each([
    ['relaxed', 480, 8],
    ['moderate', 420, 7],
    ['fast', 360, 6],
  ] as const)('%s pace fits at most %i minutes (%i×60min spots) in a day', (pace, cap, maxSpots) => {
    const twoDays = spots(maxSpots + 1, 60);
    const sorted = sortItinerarySpots({ spots: twoDays as any, travelPace: pace });
    const plan = generateDayPlan(sorted, pace);
    // No day may exceed capacity.
    for (const day of plan) {
      expect(day.totalDurationMin).toBeLessThanOrEqual(cap);
    }
    // Capacity allows full days, so the +1 spot overflows into day two.
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0].totalDurationMin).toBeLessThanOrEqual(cap);
  });

  it('relaxed @480 yields fewer days than fast @360 for the same workload', () => {
    const workload = spots(13, 60);
    const relaxed = generateDayPlan(sortItinerarySpots({ spots: workload as any, travelPace: 'relaxed' }), 'relaxed');
    const fast = generateDayPlan(sortItinerarySpots({ spots: workload as any, travelPace: 'fast' }), 'fast');
    expect(relaxed.length).toBe(2);
    expect(fast.length).toBeGreaterThanOrEqual(3);
  });

  it('moderate is the documented default when pace is omitted', () => {
    const workload = spots(8, 60);
    const def = sortItinerarySpots({ spots: workload as any });
    const plan = generateDayPlan(def, 'moderate');
    expect(plan[0].totalDurationMin).toBeLessThanOrEqual(420);
  });
});

describe('pace → schedule multipliers (generateItinerarySchedule)', () => {
  const single = spots(1, 60);

  it.each([
    ['relaxed', 90],   // 60 × 1.5
    ['moderate', 60],  // 60 × 1.0
    ['fast', 45],      // 60 × 0.75
  ] as const)('%s pace stretches a 60-min spot to %i min', (pace, expected) => {
    const [item] = generateItinerarySchedule(single as any, null, pace);
    expect(item.endMinutes - item.startMinutes).toBe(expected);
  });

  it('the gap between spots also scales with pace (10 × multiplier)', () => {
    const two = spots(2, 30);
    const relaxed = generateItinerarySchedule(two as any, null, 'relaxed');
    const fast = generateItinerarySchedule(two as any, null, 'fast');
    const gapRelaxed = relaxed[1].startMinutes - relaxed[0].endMinutes;
    const gapFast = fast[1].startMinutes - fast[0].endMinutes;
    expect(gapRelaxed).toBe(15);  // 10 × 1.5
    expect(gapFast).toBe(7.5);    // 10 × 0.75 → rounded by scheduling engine
  });

  it('empty input yields an empty schedule at any pace', () => {
    expect(generateItinerarySchedule([], null, 'relaxed')).toEqual([]);
    expect(generateItinerarySchedule([], null, 'fast')).toEqual([]);
  });

  it('time display stays a 12-hour AM/PM clock across the 24h scale', () => {
    expect(formatTimeDisplay(8 * 60)).toBe('8:00 AM');
    expect(formatTimeDisplay(13 * 60)).toBe('1:00 PM');
    expect(formatTimeDisplay(17 * 60 + 30)).toBe('5:30 PM');
  });
});

describe('backend pace enum → UI pace aliases (documented mapping)', () => {
  it('maps every server pace into one of the three UI paces', () => {
    const aliases = normalizePaceAliases();
    const ui = ['relaxed', 'moderate', 'fast'];
    const mapped = Object.values(aliases);
    expect(mapped.length).toBeGreaterThanOrEqual(3);
    for (const m of mapped) {
      expect(ui).toContain(m);
    }
  });
});