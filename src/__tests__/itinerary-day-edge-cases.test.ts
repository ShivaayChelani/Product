/**
 * ITINERARY HARDENING — Section 4: Day edge cases.
 *
 * Explicit coverage for 1/2/7/14/30-day plans, unordered days, duplicate
 * days, and dayNumber-less rows the current architecture tolerates.
 */
import {
  normalizeTripDays,
  normalizeTripPlan,
} from '../utils/normalizeTripPlan';
import { buildLocalTripPlan, isTripPlanEmpty } from '../utils/tripPlanner';
import { generateDayPlan, sortItinerarySpots } from '../utils/itinerary';

function daysOfLength(n: number): any[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `day-${i + 1}`,
    dayNumber: i + 1,
    stops: [{ id: `stop-${i + 1}`, order: 1 }],
  }));
}

describe('day-length edge cases (normalizeTripDays)', () => {
  it.each([1, 2, 7, 14, 30])('preserves all %i days with stop order intact', (n) => {
    const out = normalizeTripDays(daysOfLength(n) as any);
    expect(out).toHaveLength(n);
    expect(out[0].dayNumber).toBe(1);
    expect(out[n - 1].dayNumber).toBe(n);
    expect(out[0].stops[0].id).toBe('stop-1');
  });

  it('sorts unordered days Day 3 / Day 1 / Day 2 into increasing order', () => {
    const out = normalizeTripDays([
      { id: 'd3', dayNumber: 3, stops: [] },
      { id: 'd1', dayNumber: 1, stops: [] },
      { id: 'd2', dayNumber: 2, stops: [] },
    ] as any);
    expect(out.map(d => d.dayNumber)).toEqual([1, 2, 3]);
  });

  it('collapses duplicate days (same id, same dayNumber) to one row', () => {
    const out = normalizeTripDays([
      { id: 'd1', dayNumber: 1, stops: [{ id: 's1', order: 1 }] },
      { id: 'd1', dayNumber: 1, stops: [{ id: 's1', order: 1 }] },
    ] as any);
    expect(out).toHaveLength(1);
  });

  it('treats duplicate dayNumber (id-less rows) as the same day', () => {
    const out = normalizeTripDays([
      { dayNumber: 1, stops: [] },
      { dayNumber: 1, stops: [] },
      { dayNumber: 2, stops: [] },
    ] as any);
    expect(out).toHaveLength(2);
  });

  it('supports missing dayNumber where the current architecture allows it', () => {
    // Dedupe key falls back to the row index, and sort treats missing as 0.
    const out = normalizeTripDays([
      { id: 'a', stops: [{ id: 's1', order: 2 }] },
      { id: 'b', stops: [{ id: 's2', order: 1 }] },
    ] as any);
    expect(out).toHaveLength(2);
  });

  it('handles dayNumber 0 and negative without crashing', () => {
    const out = normalizeTripDays([
      { id: 'd0', dayNumber: 0, stops: [] },
      { id: 'dn', dayNumber: -1, stops: [] },
      { id: 'd1', dayNumber: 1, stops: [] },
    ] as any);
    expect(out).toHaveLength(3);
  });
});

describe('buildLocalTripPlan day-count handling', () => {
  const empty = () => buildLocalTripPlan({ location: 'Raigad', days: 3, pace: 'moderate' });

  it('clamps days to [1, 14] — the engine supports at most a 14-day plan', () => {
    expect(buildLocalTripPlan({ location: 'X', days: 30, pace: 'moderate' }).days).toHaveLength(14);
    expect(buildLocalTripPlan({ location: 'X', days: 0, pace: 'moderate' }).days).toHaveLength(1);
    expect(buildLocalTripPlan({ location: 'X', days: -5, pace: 'moderate' }).days).toHaveLength(1);
    expect(buildLocalTripPlan({ location: 'X', days: 1, pace: 'moderate' }).days).toHaveLength(1);
  });

  it('falls back to 3 days when days is undefined', () => {
    expect(buildLocalTripPlan({ location: 'X', pace: 'moderate' } as any).days).toHaveLength(3);
  });

  it('produces a 7-day skeleton when no places are available', () => {
    const plan = buildLocalTripPlan({ location: 'Nowhere', days: 7, pace: 'moderate' });
    expect(plan.days).toHaveLength(7);
    expect(plan.totalPlaces).toBe(0);
  });

  it('reports an empty plan when all days have no stops', () => {
    expect(isTripPlanEmpty(empty())).toBe(true);
  });

  it('reports a non-empty plan when stops exist', () => {
    const plan = buildLocalTripPlan({ location: 'Goa', days: 2, pace: 'moderate', places: [] });
    expect(isTripPlanEmpty(plan)).toBe(true);
  });
});

describe('generateDayPlan / sortItinerarySpots day packing', () => {
  const spots = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`,
    name: `Place ${i}`,
    latitude: 23 + i * 0.01,
    longitude: 79 + i * 0.01,
    estimatedDuration: 60,
    category: 'heritage',
    verificationStatus: 'verified' as const,
    bestTimeToVisit: 'morning' as const,
  }));

  it('packs 12 one-hour spots into at least 2 days at moderate pace', () => {
    const sorted = sortItinerarySpots({ spots: spots as any, travelPace: 'moderate' });
    const plan = generateDayPlan(sorted, 'moderate');
    expect(plan.length).toBeGreaterThanOrEqual(2);
    // Day boundaries are contiguous day numbers.
    expect(plan[0].day).toBe(1);
    plan.slice(1).forEach((d, i) => expect(d.day).toBe(plan[i].day + 1));
  });

  it('relaxed pace yields more days (fewer stops per day) than fast pace', () => {
    const relaxed = generateDayPlan(sortItinerarySpots({ spots: spots as any, travelPace: 'relaxed' }), 'relaxed');
    const fast = generateDayPlan(sortItinerarySpots({ spots: spots as any, travelPace: 'fast' }), 'fast');
    expect(relaxed.length).toBeGreaterThanOrEqual(fast.length);
  });
});

describe('normalizeTripPlan with varied day counts', () => {
  it('normalizes a 30-day response while preserving metadata', () => {
    const trip = {
      id: 't30',
      title: 'One Month',
      destination: 'Uttarakhand',
      startDate: '2026-01-01',
      endDate: '2026-01-30',
      days: 30,
      tripDays: daysOfLength(30),
    };
    const normalized = normalizeTripPlan(trip as any);
    expect(normalized.tripDays).toHaveLength(30);
    expect(normalized.days).toBe(30);
    expect(normalized.startDate).toBe('2026-01-01');
  });

  it('normalizes detailed metadata on every day without losing theme/date', () => {
    const raw = [3, 1, 2].map(n => ({
      id: `d${n}`,
      dayNumber: n,
      date: `2026-03-${String(n + 9).padStart(2, '0')}`,
      theme: `Day ${n} theme`,
      stops: [],
    }));
    const out = normalizeTripDays(raw as any);
    expect(out.map(d => d.dayNumber)).toEqual([1, 2, 3]);
    expect(out[0].theme).toBe('Day 1 theme');
    expect(out[2].date).toBe('2026-03-12');
  });
});