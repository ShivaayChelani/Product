const tripsApi = {
  plan: jest.fn(),
  getById: jest.fn(),
};

jest.mock('../services/api/trips', () => ({
  tripsApi,
}));

jest.mock('../features/myTrips/myTripsCache', () => ({
  invalidateMyTripsList: jest.fn(),
}));

jest.mock('../utils/quickAddPlace', () => ({
  seedDraftTripCache: jest.fn(),
}));

import {
  flattenTripStops,
  collectSelectedPlaceIds,
  canOrganizeItinerary,
  buildOrganizePayload,
  organizeItineraryAction,
} from '../features/buildTrip/utils/organizeItinerary';
import { invalidateMyTripsList } from '../features/myTrips/myTripsCache';
import { seedDraftTripCache } from '../utils/quickAddPlace';
import { ITINERARY_ENGINE_CONFIG } from '../config/itineraryEngine';

function makeStop(placeId: string, overrides: Record<string, any> = {}) {
  return {
    id: `stop-${placeId}`,
    tripPlanDayId: 'day-1',
    placeId,
    order: 0,
    isPinned: false,
    place: { id: placeId, name: `Place ${placeId}`, latitude: 26.9, longitude: 75.7 },
    ...overrides,
  };
}

function makeTrip(opts: { stops?: any[]; days?: number } = {}) {
  const stops = (opts.stops || []).map((s, i) => ({ ...s, order: i }));
  return {
    id: 'trip-1',
    title: 'Trip to Jaipur',
    destination: 'Jaipur',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    days: opts.days ?? 1,
    pace: 'BALANCED',
    travelers: 'COUPLE',
    budget: 'MEDIUM',
    interests: ['heritage'],
    avoid: [],
    transportation: ['CAR'],
    tripDays: [{ id: 'day-1', tripPlanId: 'trip-1', dayNumber: 1, stops }],
  } as any;
}

describe('self-build "Organize My Itinerary" button logic', () => {
  beforeEach(() => {
    ITINERARY_ENGINE_CONFIG.canonicalSelfBuildEnabled = true;
    jest.clearAllMocks();
  });

  afterEach(() => {
    ITINERARY_ENGINE_CONFIG.canonicalSelfBuildEnabled = false;
  });

  it('button hidden for <2 stops', () => {
    expect(canOrganizeItinerary(makeTrip({ stops: [makeStop('a')] }))).toBe(false);
    expect(canOrganizeItinerary(makeTrip())).toBe(false);
  });

  it('button visible for >=2 stops', () => {
    expect(canOrganizeItinerary(makeTrip({ stops: [makeStop('a'), makeStop('b')] }))).toBe(true);
  });

  it('feature flag OFF hides the button entirely', () => {
    ITINERARY_ENGINE_CONFIG.canonicalSelfBuildEnabled = false;
    expect(canOrganizeItinerary(makeTrip({ stops: [makeStop('a'), makeStop('b')] }))).toBe(false);
  });

  it('selection comes from stable placeId values (never array index or name)', () => {
    const trip = makeTrip({
      stops: [
        makeStop('jpr-amber-fort', { order: 0 }),
        makeStop('jpr-hawa-mahal', { order: 1 }),
      ],
    });
    const ids = collectSelectedPlaceIds(trip);
    expect(ids).toEqual(['jpr-amber-fort', 'jpr-hawa-mahal']);
  });

  it('deduplicates repeated placeIds across days', () => {
    const trip = {
      ...makeTrip(),
      tripDays: [
        { id: 'day-1', dayNumber: 1, stops: [makeStop('p1'), makeStop('p2')] },
        { id: 'day-2', dayNumber: 2, stops: [makeStop('p1')] },
      ],
    } as any;
    expect(collectSelectedPlaceIds(trip)).toEqual(['p1', 'p2']);
    expect(flattenTripStops(trip)).toHaveLength(3);
  });

  it('request uses SELF_BUILD with trip metadata', () => {
    const trip = makeTrip({ stops: [makeStop('a'), makeStop('b')], days: 2 });
    const payload = buildOrganizePayload(trip);
    expect(payload?.mode).toBe('SELF_BUILD');
    expect(payload?.tripId).toBe('trip-1');
    expect(payload?.destination).toBe('Jaipur');
    expect(payload?.days).toBe(2);
    expect(payload?.pace).toBe('BALANCED');
    expect(payload?.travelers).toBe('COUPLE');
    expect(payload?.budget).toBe('MEDIUM');
    expect(payload?.interests).toEqual(['heritage']);
  });

  it('sends selected ids only — no complements invented client-side', () => {
    const trip = makeTrip({
      stops: [makeStop('a', { order: 0 }), makeStop('b', { order: 1 })],
    });
    const payload = buildOrganizePayload(trip);
    expect(payload?.selectedPlaceIds).toEqual(['a', 'b']);
    expect(payload?.selectedPlaceIds.length).toBe(2);
    const stopIds = new Set(flattenTripStops(trip).map(s => s.placeId));
    expect(new Set(payload?.selectedPlaceIds || []).size).toBe(stopIds.size);
  });

  it('forwards pinned and fixed-time stops; locked list empty', () => {
    const trip = makeTrip({
      stops: [
        makeStop('a', { isPinned: true }),
        makeStop('b', { startTime: '09:30' }),
        makeStop('c'),
      ],
    });
    const payload = buildOrganizePayload(trip);
    expect(payload?.pinnedPlaceIds).toEqual(['a']);
    expect(payload?.fixedTimePlaces).toEqual([{ placeId: 'b', startTime: '09:30' }]);
    expect(payload?.lockedPlaceIds).toEqual([]);
  });

  it('does not return a payload below 2 stops', () => {
    expect(buildOrganizePayload(makeTrip({ stops: [makeStop('a')] }))).toBeNull();
    expect(buildOrganizePayload(null)).toBeNull();
  });

  it('success paints the server plan and refetches caches', async () => {
    const trip = makeTrip({ stops: [makeStop('a'), makeStop('b')] });
    const organized = makeTrip({ stops: [makeStop('b'), makeStop('a')] });
    tripsApi.plan.mockResolvedValueOnce({
      trip: organized,
      explanation: 'Reordered to cut travel time.',
      dayExplanations: [{ dayNumber: 1, text: 'Beside our selected places only.' }],
      warnings: [],
    });

    let painted: any = null;
    const outcome = await organizeItineraryAction(trip, t => (painted = t));

    expect(tripsApi.plan).toHaveBeenCalledTimes(1);
    expect(tripsApi.plan.mock.calls[0][0].mode).toBe('SELF_BUILD');
    expect(painted).toStrictEqual(organized);
    expect(seedDraftTripCache).toHaveBeenCalledWith(organized);
    expect(invalidateMyTripsList).toHaveBeenCalled();
    expect(outcome.skipped).toBe(false);
    expect(outcome.explanation).toContain('Reordered');
    expect(outcome.dayExplanations).toHaveLength(1);
  });

  it('duplicate taps are blocked while a request is in flight', async () => {
    const trip = makeTrip({ stops: [makeStop('a'), makeStop('b')] });
    let release!: (t: any) => void;
    tripsApi.plan.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      }),
    );

    const first = organizeItineraryAction(trip, () => {});
    const second = await organizeItineraryAction(trip, () => {});
    expect(second.skipped).toBe(true);

    release({ trip, explanation: null, dayExplanations: [], warnings: [] });
    await first;
    expect(tripsApi.plan).toHaveBeenCalledTimes(1);
  });

  it('failure preserves existing builder state', async () => {
    const trip = makeTrip({ stops: [makeStop('a'), makeStop('b')] });
    tripsApi.plan.mockRejectedValueOnce(
      Object.assign(new Error('Some requested places could not be found.'), { status: 422 }),
    );

    let painted: any = 'unchanged-marker';
    await expect(organizeItineraryAction(trip, t => (painted = t))).rejects.toThrow(
      /could not be found/,
    );
    expect(painted).toBe('unchanged-marker');
    expect(seedDraftTripCache).not.toHaveBeenCalled();
  });

  it('deleted/unknown place rejection is surfaced (not silently swallowed)', async () => {
    const trip = makeTrip({ stops: [makeStop('gone'), makeStop('ok')] });
    tripsApi.plan.mockRejectedValueOnce(
      Object.assign(new Error('Some requested places could not be found. Pick approved places in this destination.'), {
        status: 422,
      }),
    );
    await expect(organizeItineraryAction(trip, () => {})).rejects.toMatchObject({
      status: 422,
    });
  });
});