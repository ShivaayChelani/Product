/**
 * ITINERARY HARDENING — Sections 8, 12, 13: Persistence, offline, cache.
 *
 * Locks the Create → Save → Reload lifecycle and the stale-cache rules:
 * the latest valid backend data must always win.
 */
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
  list: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('../services/api/trips', () => ({ tripsApi }));

jest.mock('../services/api/places', () => ({
  placesApi: { list: jest.fn() },
}));

jest.mock('../features/myTrips/myTripsCache', () => ({
  invalidateMyTripsList: jest.fn(),
}));

import {
  DRAFT_TRIP_ID_KEY,
  DRAFT_TRIP_SNAPSHOT_KEY,
  clearDraftTripCache,
  ensureManualDraftTrip,
  invalidateDraftTripCache,
  loadBestDraftTrip,
  loadDraftSnapshot,
  seedDraftTripCache,
} from '../utils/quickAddPlace';

function draftTrip(id: string, destination: string, dayNumbers = [1]) {
  return {
    id,
    title: `Trip to ${destination}`,
    destination,
    status: 'DRAFT' as const,
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    days: dayNumbers.length,
    tripDays: dayNumbers.map(n => ({
      id: `${id}-d${n}`,
      tripPlanId: id,
      dayNumber: n,
      stops: [{ id: `${id}-s${n}`, placeId: `place-${n}`, order: 0 }],
    })),
  };
}

describe('persistence lifecycle', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    invalidateDraftTripCache();
    jest.clearAllMocks();
  });

  it('Create → Save → Reload round-trips title, destination, dates, and stop order', async () => {
    const created = draftTrip('trip-ck', 'Kolkata', [1, 2, 3]);
    tripsApi.create.mockResolvedValueOnce(created as any);
    tripsApi.list.mockResolvedValueOnce({ data: [] });
    tripsApi.getById.mockResolvedValue(created as any);

    const trip = await ensureManualDraftTrip('Kolkata');

    expect(trip.id).toBe('trip-ck');
    expect(trip.title).toBe('Trip to Kolkata');
    expect(trip.destination).toBe('Kolkata');
    expect(trip.startDate).toBe('2026-08-01');
    expect(trip.endDate).toBe('2026-08-01');
    expect(store[DRAFT_TRIP_ID_KEY]).toBe('trip-ck');

    // Reload after "app restart" (memory gone) restores the same trip.
    invalidateDraftTripCache();
    const reloaded = await loadBestDraftTrip(undefined, {});
    expect(reloaded?.id).toBe('trip-ck');
    expect(reloaded?.destination).toBe('Kolkata');
    expect(reloaded?.tripDays.map(d => d.dayNumber)).toEqual([1, 2, 3]);
  });

  it('Save Draft → Reload restores the draft', async () => {
    const draft = draftTrip('trip-draft', 'Delhi', [1]);
    tripsApi.getById.mockResolvedValue(draft as any);
    seedDraftTripCache(draft as any);

    invalidateDraftTripCache();
    const loaded = await loadDraftSnapshot();
    expect(loaded?.id).toBe('trip-draft');
    expect(loaded?.tripDays).toHaveLength(1);
    expect(loaded?.tripDays[0].stops[0].placeId).toBe('place-1');
  });

  it('Delete → Reload returns null and clears the pointer', async () => {
    store[DRAFT_TRIP_ID_KEY] = 'trip-gone';
    store[DRAFT_TRIP_SNAPSHOT_KEY] = JSON.stringify(draftTrip('trip-gone', 'Pune'));
    seedDraftTripCache(draftTrip('trip-gone', 'Pune') as any);

    await clearDraftTripCache('trip-gone');
    expect(store[DRAFT_TRIP_ID_KEY]).toBeUndefined();
    expect(store[DRAFT_TRIP_SNAPSHOT_KEY]).toBeUndefined();
    expect(await loadDraftSnapshot()).toBeNull();
  });
});

describe('stale cache rules', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    invalidateDraftTripCache();
    jest.clearAllMocks();
  });

  it('forceServer bypasses the in-memory TTL and returns the newer backend copy', async () => {
    seedDraftTripCache(draftTrip('trip-a', 'Jabalpur', [1]) as any);
    const newer = draftTrip('trip-b', 'Jabalpur', [1, 2]);
    tripsApi.getById.mockResolvedValue(newer as any);

    const loaded = await loadBestDraftTrip(undefined, { forceServer: true });
    expect(loaded?.id).toBe('trip-b');
    expect(loaded?.tripDays).toHaveLength(2);
    expect(store[DRAFT_TRIP_ID_KEY]).toBe('trip-b');
  });

  it('stale offline snapshot cannot overwrite a newer backend trip', async () => {
    // Corrupt-stale snapshot on disk, server has a newer version.
    store[DRAFT_TRIP_ID_KEY] = 'trip-new';
    store[DRAFT_TRIP_SNAPSHOT_KEY] = JSON.stringify(
      draftTrip('trip-new', 'Jabalpur', [1]),
    );
    const serverVersion = draftTrip('trip-new', 'Jabalpur', [1, 2, 3]);
    tripsApi.getById.mockResolvedValue(serverVersion as any);

    const loaded = await loadBestDraftTrip(undefined, { forceServer: true });
    expect(loaded?.tripDays).toHaveLength(3);
    const snapshot = JSON.parse(store[DRAFT_TRIP_SNAPSHOT_KEY]);
    expect(snapshot.tripDays).toHaveLength(3);
  });

  it('reload after a save failure clears the stale draft so nothing corrupt persists', async () => {
    store[DRAFT_TRIP_ID_KEY] = 'trip-stale';
    tripsApi.getById.mockRejectedValue(
      Object.assign(new Error('offline'), { status: 0 }),
    );
    tripsApi.list.mockResolvedValueOnce({ data: [] });

    const loaded = await loadBestDraftTrip(undefined, { forceServer: true });
    expect(loaded).toBeNull();
    expect(store[DRAFT_TRIP_ID_KEY]).toBeUndefined();
  });

  it('offline while saving creates no draft (create rejects → no cache seeded)', async () => {
    tripsApi.list.mockResolvedValueOnce({ data: [] });
    tripsApi.create.mockRejectedValue(Object.assign(new Error('Network request failed'), { status: 0 }));

    await expect(ensureManualDraftTrip('Ranchi')).rejects.toThrow();
    expect(store[DRAFT_TRIP_ID_KEY]).toBeUndefined();
    expect(await loadDraftSnapshot()).toBeNull();
  });

  it('non-DRAFT trips returned by the server are ignored (upcoming/completed never seed the draft cache)', async () => {
    store[DRAFT_TRIP_ID_KEY] = 'trip-upcoming';
    const upcoming = { ...draftTrip('trip-upcoming', 'Goa', [1]), status: 'UPCOMING' };
    tripsApi.getById.mockResolvedValue(upcoming as any);
    tripsApi.list.mockResolvedValueOnce({ data: [] });

    const loaded = await loadBestDraftTrip(undefined, { forceServer: true });
    expect(loaded).toBeNull();
    expect(store[DRAFT_TRIP_ID_KEY]).toBeUndefined();
  });
});