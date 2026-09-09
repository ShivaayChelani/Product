/**
 * ITINERARY HARDENING — Section 3: Itinerary Generation Contract.
 *
 * Locks the GenerateItineraryInput shape and the response-normalization
 * contract so normalizeTripPlan()/normalizeTripDays() never crash on any
 * server payload shape in production.
 */
import { tripsApi } from '../services/api/trips';
import { normalizeTripDays, normalizeTripPlan } from '../utils/normalizeTripPlan';

jest.mock('../services/api/client', () => {
  const fn = jest.fn();
  return {
    apiClient: {
      get: fn,
      post: fn,
      patch: fn,
      delete: fn,
    },
  };
});

import { apiClient } from '../services/api/client';

const mockPost = apiClient.post as jest.Mock;
const mockGet = apiClient.get as jest.Mock;

function baseTrip(overrides: Record<string, any> = {}) {
  return {
    id: 'trip-1',
    title: 'Goa Explorer',
    destination: 'Goa',
    startDate: '2026-10-10',
    endDate: '2026-10-12',
    days: 3,
    pace: 'BALANCED',
    tripDays: [],
    ...overrides,
  };
}

describe('GenerateItineraryInput contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts each supported pace and passes the payload through to POST /trips/:id/generate', async () => {
    const plan = baseTrip();
    mockPost.mockResolvedValue({ success: true, data: plan });

    for (const pace of ['relaxed', 'moderate', 'fast'] as const) {
      const out = await tripsApi.generateItinerary('trip-1', { pace });
      expect(out).toBe(plan);
    }

    const calls = mockPost.mock.calls;
    for (const call of calls) {
      expect(call[0]).toBe('/trips/trip-1/generate');
    }
    // First call carries pace: relaxed unchanged.
    expect(calls[0][1]).toEqual({ pace: 'relaxed' });
    expect(calls[1][1]).toEqual({ pace: 'moderate' });
    expect(calls[2][1]).toEqual({ pace: 'fast' });
  });

  it('passes startLocation coordinates through to the generate endpoint', async () => {
    mockPost.mockResolvedValue({ success: true, data: baseTrip() });
    await tripsApi.generateItinerary('trip-1', {
      pace: 'moderate',
      startLocation: { latitude: 15.4989, longitude: 73.8279 },
    });
    expect(mockPost.mock.calls[0][0]).toBe('/trips/trip-1/generate');
    expect(mockPost.mock.calls[0][1]).toEqual({
      pace: 'moderate',
      startLocation: { latitude: 15.4989, longitude: 73.8279 },
    });
  });

  it('leaves the payload untouched when omitempty style optional fields are absent', async () => {
    mockPost.mockResolvedValue({ success: true, data: baseTrip() });
    await tripsApi.generateItinerary('trip-1', {});
    // No optional fields means only the id path is used; body stays as given.
    expect(mockPost.mock.calls[0][1]).toEqual({});
  });

  it('supports generateItinerary without a tripId field in the input (id is the path param)', () => {
    // Compile-time contract: the input type has no redundant tripId.
    const input: Parameters<typeof tripsApi.generateItinerary>[1] = {
      pace: 'fast',
    };
    expect(input).not.toHaveProperty('tripId');
  });
});

describe('normalizeTripPlan response normalization', () => {
  it('normalizes a valid response without dropping trip metadata', () => {
    const trip = baseTrip({
      tripDays: [
        { id: 'd2', dayNumber: 2, stops: [{ id: 's3', order: 3 }] },
        { id: 'd1', dayNumber: 1, stops: [{ id: 's1', order: 1 }] },
      ],
    });
    const normalized = normalizeTripPlan(trip as any);
    expect(normalized.id).toBe('trip-1');
    expect(normalized.title).toBe('Goa Explorer');
    expect(normalized.destination).toBe('Goa');
    expect(normalized.days).toBe(3);
    // Days re-ordered by dayNumber but metadata preserved.
    expect(normalized.tripDays.map(d => d.id)).toEqual(['d1', 'd2']);
  });

  it('handles an empty tripDays array', () => {
    const normalized = normalizeTripPlan(baseTrip({ tripDays: [] }) as any);
    expect(normalized.tripDays).toEqual([]);
  });

  it('handles missing tripDays (null response shape)', () => {
    const normalized = normalizeTripPlan(baseTrip({ tripDays: null }) as any);
    expect(normalized.tripDays).toEqual([]);
  });

  it('handles tripDays being undefined', () => {
    const unset: any = baseTrip();
    delete unset.tripDays;
    const normalized = normalizeTripPlan(unset);
    expect(normalized.tripDays).toEqual([]);
  });

  it('does not throw when the whole response is malformed but trips shape is preserved', () => {
    // A payload where day rows may be null and stops may be missing entirely.
    const malformed = baseTrip({
      tripDays: [
        null,
        { id: 'd1', dayNumber: 1, stops: null },
        { id: 'd2', dayNumber: 2, stops: [{ id: 's1', order: 1 }, null] },
      ],
    });
    expect(() => normalizeTripPlan(malformed as any)).not.toThrow();
    const out = normalizeTripPlan(malformed as any);
    expect(out.tripDays).toHaveLength(2);
    expect(out.tripDays[0].id).toBe('d1');
    expect(out.tripDays[1].stops).toHaveLength(1);
  });

  it('does not throw on a null day entry', () => {
    const out = normalizeTripDays([null as any]);
    expect(out).toEqual([]);
  });

  it('does not throw on missing stops per day', () => {
    const out = normalizeTripDays([{ id: 'd1', dayNumber: 1 } as any]);
    expect(out[0].stops).toEqual([]);
  });

  it('preserves stop metadata while normalizing', () => {
    const day = {
      id: 'd1',
      dayNumber: 1,
      stops: [
        { id: 's1', order: 1, startTime: '09:00', duration: 90 },
        { id: 's2', order: 0, startTime: '08:00', duration: 60 },
      ],
    };
    const [out] = normalizeTripDays([day] as any);
    expect(out.stops[0]).toMatchObject({ id: 's2', startTime: '08:00' });
    expect(out.stops[1]).toMatchObject({ id: 's1', startTime: '09:00' });
  });

  it('normalizes a null top-level object without crashing', () => {
    expect(() => normalizeTripPlan(null as any)).not.toThrow();
  });

  it('keeps the plan returned from getById normalized end-to-end', async () => {
    const raw = baseTrip({
      tripDays: [
        { id: 'd2', dayNumber: 2, stops: [{ id: 's2', order: 2 }, { id: 's2', order: 2 }] },
        { id: 'd1', dayNumber: 1, stops: [{ order: 1, id: 's1' }] },
      ],
    });
    mockGet.mockResolvedValue({ success: true, data: raw });
    const fetched = await tripsApi.getById('trip-1');
    const normalized = normalizeTripPlan(fetched);
    expect(normalized.tripDays).toHaveLength(2);
    expect(normalized.tripDays[1].stops).toHaveLength(1); // duplicate stop collapsed
  });
});