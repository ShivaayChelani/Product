import {
  computeTripBudget,
  TRANSPORT_COST_PER_KM,
  parseEntryFee,
  getStopEntryFee,
} from '../utils/tripBudget';
import type { TripPlan } from '../services/api/trips';

function makeStop(id: string, name: string, entryFee: number, km: number) {
  return {
    id,
    dayNumber: 1,
    order: 0,
    placeId: `place-${id}`,
    place: { name, city: 'Jaipur', ticketPrice: { adult: entryFee, basis: 'PER_PERSON' } },
    entryFee,
    distanceFromPrev: km,
  };
}

const baseTrip = {
  id: 'trip_a',
  destination: 'Jaipur',
  travelers: 'COUPLE',
  collaborators: [],
  transportation: ['CAR'],
  totalDistance: null,
  tripDays: [
    {
      id: 'day1',
      dayNumber: 1,
      stops: [
        makeStop('s1', 'Hawa Mahal', 50, 5),
        makeStop('s2', 'Amber Fort', 200, 12),
      ],
    },
    { id: 'day2', dayNumber: 2, stops: [] },
  ],
} as unknown as TripPlan;

describe('computeTripBudget authoritative total (entry + transport)', () => {
  it('grandTotal = entryTotal(per-person × travellers) + transport, food excluded', () => {
    const b = computeTripBudget(baseTrip);
    expect(b.travellerCount).toBe(2);
    expect(b.entryTotalPerPerson).toBe(250);
    expect(b.entryTotal).toBe(500);
    expect(b.transportTotal).toBe((5 + 12) * TRANSPORT_COST_PER_KM);
    expect(b.foodTotal).toBe(600 * 2);
    expect(b.grandTotal).toBe(b.entryTotal + b.transportTotal);
    expect(b.grandTotal).toBe(500 + 136);
    expect(b.grandTotal + b.foodTotal).toBeGreaterThan(b.grandTotal);
    expect(b.scopeLabel).toBe('Entry + transport');
  });

  it('dayTotal = dayEntry × travellers + transport, food kept separate', () => {
    const b = computeTripBudget(baseTrip);
    const d1 = b.byDay.find(d => d.dayNumber === 1)!;
    expect(d1.entryTotalPerPerson).toBe(250);
    expect(d1.entryTotal).toBe(500);
    expect(d1.transportTotal).toBe(136);
    expect(d1.dayTotal).toBe(636);
    expect(d1.foodEstimate).toBe(1200);
    expect(d1.items).toHaveLength(2);

    const d2 = b.byDay.find(d => d.dayNumber === 2)!;
    expect(d2.dayTotal).toBe(0);
    expect(d2.foodEstimate).toBe(0);
  });

  it('counts paid and free stops', () => {
    const b = computeTripBudget(baseTrip);
    expect(b.paidStops).toBe(2);
    expect(b.freeStops).toBe(0);
  });
});

describe('computeTripBudget pricing edge cases', () => {
  it('free / zero-fee stops count as free and add no entry', () => {
    const trip = {
      ...baseTrip,
      tripDays: [
        { id: 'day1', dayNumber: 1, stops: [makeStop('s1', 'Public Garden', 0, 3)] },
      ],
    } as unknown as TripPlan;
    const b = computeTripBudget(trip);
    expect(b.freeStops).toBe(1);
    expect(b.paidStops).toBe(0);
    expect(b.entryTotal).toBe(0);
    expect(b.transportTotal).toBe(3 * TRANSPORT_COST_PER_KM);
    expect(b.grandTotal).toBe(b.transportTotal);
  });

  it('unknown fees are omitted but transport still counts', () => {
    const trip = {
      ...baseTrip,
      tripDays: [
        {
          id: 'day1',
          dayNumber: 1,
          stops: [{ ...makeStop('s1', 'No Price Listed', 0, 7), entryFee: null as unknown as number, place: undefined }],
        },
      ],
    } as unknown as TripPlan;
    const b = computeTripBudget(trip);
    expect(b.entryTotal).toBe(0);
    expect(b.transportTotal).toBe(7 * TRANSPORT_COST_PER_KM);
    expect(b.grandTotal).toBe(b.transportTotal);
  });

  it('local traveller (walking/bike only) drops transport from totals', () => {
    const trip = { ...baseTrip, transportation: ['WALKING', 'BIKE'] } as unknown as TripPlan;
    const b = computeTripBudget(trip);
    expect(b.isLocal).toBe(true);
    expect(b.transportTotal).toBe(0);
    expect(b.scopeLabel).toBe('Entry fees');
    expect(b.grandTotal).toBe(b.entryTotal);
    expect(b.lineItems.every(i => i.transportKm === 0 && i.transportCost === 0)).toBe(true);
  });
});

describe('getStopEntryFee', () => {
  it('number entryFee wins', () => {
    expect(getStopEntryFee(makeStop('x', 'X', 42, 0))).toBe(42);
  });

  it('string entryFee is parsed to its digits', () => {
    const stop = { ...makeStop('x', 'X', 0, 0), entryFee: '₹350' as unknown as number };
    expect(getStopEntryFee(stop)).toBe(350);
  });

  it('falls back to place.ticketPrice', () => {
    const stop = {
      id: 'x',
      dayNumber: 1,
      order: 0,
      placeId: 'p1',
      entryFee: undefined,
      cost: undefined,
      distanceFromPrev: 0,
      place: { name: 'X', ticketPrice: { adult: 120, basis: 'PER_PERSON' } },
    };
    expect(getStopEntryFee(stop)).toBe(120);
    expect(parseEntryFee(undefined)).toBeNull();
    expect(parseEntryFee({ child: 25 })).toBe(25);
  });
});