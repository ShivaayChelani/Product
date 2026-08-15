const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    multiSet: jest.fn((pairs: [string, string][]) => {
      for (const [key, value] of pairs) store[key] = value;
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      for (const key of keys) delete store[key];
      return Promise.resolve();
    }),
  },
}));

const tripsApi = {
  quickAdd: jest.fn(),
  getById: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('../services/api/trips', () => ({
  tripsApi,
}));

jest.mock('../services/api/places', () => ({
  placesApi: { list: jest.fn() },
}));

jest.mock('../features/myTrips/myTripsCache', () => ({
  invalidateMyTripsList: jest.fn(),
}));

import {
  DRAFT_TRIP_ID_KEY,
  DRAFT_TRIP_IDS_BY_CITY_KEY,
  DRAFT_TRIP_SNAPSHOT_KEY,
  clearDraftTripCache,
  getDraftTripIdForCity,
  invalidateDraftTripCache,
  loadDraftSnapshot,
  quickAddPlaceToTrip,
  seedDraftTripCache,
} from '../utils/quickAddPlace';
import { invalidateMyTripsList } from '../features/myTrips/myTripsCache';

function tripWithStop(id: string, destination: string, placeId: string, city: string) {
  return {
    id,
    status: 'DRAFT' as const,
    destination,
    title: `Trip to ${destination}`,
    tripDays: [
      {
        id: `${id}-day-1`,
        tripPlanId: id,
        dayNumber: 1,
        stops: [
          {
            id: `${id}-stop-1`,
            placeId,
            order: 0,
            place: { id: placeId, name: placeId, city, state: '' },
          },
        ],
      },
    ],
  };
}

describe('quickAddPlaceToTrip persistence and city isolation', () => {
  beforeEach(() => {
    Object.keys(store).forEach(key => delete store[key]);
    invalidateDraftTripCache();
    jest.clearAllMocks();
  });

  it('creates a draft on first add and the place is present after refetch', async () => {
    const full = tripWithStop('trip-jbp', 'Jabalpur', 'bhedaghat', 'Jabalpur');
    tripsApi.quickAdd.mockResolvedValueOnce({
      tripId: 'trip-jbp',
      stopId: 'trip-jbp-stop-1',
      alreadyExists: false,
    });
    tripsApi.getById.mockResolvedValueOnce(full);

    const result = await quickAddPlaceToTrip('bhedaghat', {
      name: 'Bhedaghat',
      city: 'Jabalpur',
    });

    expect(result.tripId).toBe('trip-jbp');
    expect(store[DRAFT_TRIP_ID_KEY]).toBe('trip-jbp');
    const snapshot = await loadDraftSnapshot();
    expect(snapshot?.id).toBe('trip-jbp');
    expect(snapshot?.tripDays[0].stops[0].placeId).toBe('bhedaghat');
    expect(invalidateMyTripsList).toHaveBeenCalled();
  });

  it('does not let a stale snapshot overwrite the server trip after add', async () => {
    store[DRAFT_TRIP_SNAPSHOT_KEY] = JSON.stringify({
      id: 'trip-jbp',
      status: 'DRAFT',
      destination: 'Jabalpur',
      tripDays: [{ id: 'd1', tripPlanId: 'trip-jbp', dayNumber: 1, stops: [] }],
    });
    store[DRAFT_TRIP_ID_KEY] = 'trip-jbp';

    let releaseGetById!: (trip: ReturnType<typeof tripWithStop>) => void;
    const pendingGet = new Promise<ReturnType<typeof tripWithStop>>(resolve => {
      releaseGetById = resolve;
    });
    tripsApi.quickAdd.mockResolvedValueOnce({
      tripId: 'trip-jbp',
      stopId: 's1',
      alreadyExists: false,
    });
    tripsApi.getById.mockReturnValueOnce(pendingGet);

    const addPromise = quickAddPlaceToTrip('bhedaghat', {
      name: 'Bhedaghat',
      city: 'Jabalpur',
    });

    for (let i = 0; i < 50 && tripsApi.getById.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(tripsApi.getById).toHaveBeenCalledWith('trip-jbp');
    expect(store[DRAFT_TRIP_SNAPSHOT_KEY]).toBeUndefined();
    expect(await loadDraftSnapshot()).toBeNull();

    releaseGetById(tripWithStop('trip-jbp', 'Jabalpur', 'bhedaghat', 'Jabalpur'));
    await addPromise;

    const snapshot = await loadDraftSnapshot();
    expect(snapshot?.tripDays[0].stops).toHaveLength(1);
  });

  it('adds a second same-city place onto the same itinerary', async () => {
    tripsApi.quickAdd.mockResolvedValueOnce({
      tripId: 'trip-jbp',
      stopId: 's2',
      alreadyExists: false,
    });
    tripsApi.getById.mockResolvedValueOnce(
      tripWithStop('trip-jbp', 'Jabalpur', 'patbaba', 'Jabalpur'),
    );

    const result = await quickAddPlaceToTrip('patbaba', {
      name: 'Patbaba Mandir',
      city: 'Jabalpur',
      tripId: 'trip-jbp',
    });
    expect(result.tripId).toBe('trip-jbp');
    expect(tripsApi.quickAdd).toHaveBeenCalledWith('patbaba', 'trip-jbp');
  });

  it('does not reuse a Jabalpur tripId for an Ujjain place; stores the new city draft', async () => {
    const mismatch = Object.assign(new Error('city mismatch'), {
      code: 'CITY_MISMATCH',
      status: 409,
    });
    tripsApi.quickAdd
      .mockRejectedValueOnce(mismatch)
      .mockResolvedValueOnce({
        tripId: 'trip-ujjain',
        stopId: 's-u',
        alreadyExists: false,
      });
    tripsApi.getById.mockResolvedValueOnce(
      tripWithStop('trip-ujjain', 'Ujjain', 'mahakaleshwar', 'Ujjain'),
    );

    const result = await quickAddPlaceToTrip('mahakaleshwar', {
      name: 'Mahakaleshwar',
      city: 'Ujjain',
      tripId: 'trip-jbp',
    });

    expect(result.tripId).toBe('trip-ujjain');
    expect(tripsApi.quickAdd).toHaveBeenNthCalledWith(1, 'mahakaleshwar', 'trip-jbp');
    expect(tripsApi.quickAdd).toHaveBeenNthCalledWith(2, 'mahakaleshwar', undefined);
    expect(store[DRAFT_TRIP_ID_KEY]).toBe('trip-ujjain');
    expect(await getDraftTripIdForCity('Ujjain')).toBe('trip-ujjain');
  });

  it('does not treat a duplicate-stop 409 as a city mismatch', async () => {
    const duplicate = Object.assign(new Error('already added'), { status: 409 });
    tripsApi.quickAdd.mockRejectedValue(duplicate);

    await expect(
      quickAddPlaceToTrip('patbaba-mandir', {
        name: 'Patbaba Mandir',
        city: 'Jabalpur',
        tripId: 'trip-jbp',
      }),
    ).rejects.toBe(duplicate);
    expect(tripsApi.quickAdd.mock.calls.every((call: unknown[]) => call[1] === 'trip-jbp')).toBe(true);
  });

  it('clears the local draft pointer after delete so re-add can create a new trip', async () => {
    store[DRAFT_TRIP_ID_KEY] = 'trip-ujjain';
    store[DRAFT_TRIP_SNAPSHOT_KEY] = '{"id":"trip-ujjain"}';
    store[DRAFT_TRIP_IDS_BY_CITY_KEY] = JSON.stringify({
      ujjain: 'trip-ujjain',
      jabalpur: 'trip-jbp',
    });
    seedDraftTripCache(tripWithStop('trip-ujjain', 'Ujjain', 'mahakaleshwar', 'Ujjain') as any);

    await clearDraftTripCache('trip-ujjain');

    expect(store[DRAFT_TRIP_ID_KEY]).toBeUndefined();
    expect(store[DRAFT_TRIP_SNAPSHOT_KEY]).toBeUndefined();
    expect(JSON.parse(store[DRAFT_TRIP_IDS_BY_CITY_KEY] || '{}')).toEqual({ jabalpur: 'trip-jbp' });
    expect(await loadDraftSnapshot()).toBeNull();
  });
});
