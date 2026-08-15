import AsyncStorage from '@react-native-async-storage/async-storage';
import { tripsApi, TripPlan } from '../services/api/trips';
import { normalizeTripPlan } from './normalizeTripPlan';
import { placesApi } from '../services/api/places';
import {
  canonicalizeDestination,
  cityKeyFromPlace,
  destinationMatchesCity,
  formatDestinationLabel,
  isGenericDestination,
  placeBelongsToDestination,
} from './destination';
import { isCityMismatchError } from './tripNavigation';
import { invalidateMyTripsList } from '../features/myTrips/myTripsCache';

/** Offline map pins whose ids differ from the server seed. */
const PLACE_ID_ALIASES: Record<string, string> = {
  'dhuandhar-falls': 'bhedaghat-dhuandhar',
  'marble-rocks-bhedaghat': 'marble-rocks-viewpoint',
  bhedaghat: 'bhedaghat-dhuandhar',
};

export const DRAFT_TRIP_ID_KEY = '@palsafar_draft_trip_id';
export const DRAFT_TRIP_SNAPSHOT_KEY = '@palsafar_draft_trip_snapshot';
export const DRAFT_TRIP_IDS_BY_CITY_KEY = '@palsafar_draft_trip_ids_by_city';
const MEMORY_TTL_MS = 45_000;

let memoryDraft: { trip: TripPlan; at: number } | null = null;
let ensureDraftInflight: Promise<TripPlan> | null = null;

export function resolvePlaceIdForQuickAdd(placeId: string): string {
  return PLACE_ID_ALIASES[placeId] || placeId;
}

export function invalidateDraftTripCache() {
  memoryDraft = null;
}

export function seedDraftTripCache(trip: TripPlan) {
  const normalized = normalizeTripPlan(trip);
  memoryDraft = { trip: normalized, at: Date.now() };
  return saveDraftSnapshot(normalized).catch(() => {});
}

/** Clear stored draft id/snapshot when that trip is deleted (or always if no id given). */
export async function clearDraftTripCache(tripId?: string) {
  if (memoryDraft && (!tripId || memoryDraft.trip.id === tripId)) {
    memoryDraft = null;
  }
  try {
    const storedId = await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);
    if (!tripId || storedId === tripId) {
      await AsyncStorage.multiRemove([DRAFT_TRIP_ID_KEY, DRAFT_TRIP_SNAPSHOT_KEY]);
    }
    const raw = await AsyncStorage.getItem(DRAFT_TRIP_IDS_BY_CITY_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, string>;
      const next: Record<string, string> = {};
      if (tripId) {
        for (const [city, id] of Object.entries(map)) {
          if (id !== tripId) next[city] = id;
        }
      }
      if (Object.keys(next).length) {
        await AsyncStorage.setItem(DRAFT_TRIP_IDS_BY_CITY_KEY, JSON.stringify(next));
      } else {
        await AsyncStorage.removeItem(DRAFT_TRIP_IDS_BY_CITY_KEY);
      }
    }
  } catch {
    /* ignore storage errors */
  }
  invalidateMyTripsList();
}

async function rememberCityDraft(cityKey: string, tripId: string) {
  if (!cityKey || !tripId) return;
  try {
    const raw = await AsyncStorage.getItem(DRAFT_TRIP_IDS_BY_CITY_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[cityKey] = tripId;
    await AsyncStorage.setItem(DRAFT_TRIP_IDS_BY_CITY_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function getDraftTripIdForCity(city?: string): Promise<string | null> {
  const cityKey = city ? canonicalizeDestination(city) : '';
  if (!cityKey) return null;
  try {
    const raw = await AsyncStorage.getItem(DRAFT_TRIP_IDS_BY_CITY_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[cityKey] || null;
  } catch {
    return null;
  }
}

async function saveDraftSnapshot(trip: TripPlan) {
  await AsyncStorage.multiSet([
    [DRAFT_TRIP_ID_KEY, trip.id],
    [DRAFT_TRIP_SNAPSHOT_KEY, JSON.stringify(trip)],
  ]);
}

export async function loadDraftSnapshot(): Promise<TripPlan | null> {
  if (memoryDraft && Date.now() - memoryDraft.at < MEMORY_TTL_MS) {
    return memoryDraft.trip;
  }
  try {
    const raw = await AsyncStorage.getItem(DRAFT_TRIP_SNAPSHOT_KEY);
    if (!raw) return null;
    const trip = JSON.parse(raw) as TripPlan;
    if (trip?.id) {
      const normalized = normalizeTripPlan(trip);
      memoryDraft = { trip: normalized, at: Date.now() };
      return normalized;
    }
  } catch {
    /* ignore corrupt snapshot */
  }
  return null;
}

function pickPlaceIdForCity(
  hits: Array<{ id: string; name: string; city?: string | null; state?: string | null }>,
  name: string,
  city?: string,
): string | null {
  const scoped = city
    ? hits.filter(p =>
        placeBelongsToDestination(p, city)
        || canonicalizeDestination(p.city || '') === canonicalizeDestination(city)
        || cityKeyFromPlace(p) === canonicalizeDestination(city),
      )
    : hits;
  if (scoped.length === 0) return null;
  if (scoped.length === 1) return scoped[0].id;
  const exact = scoped.find(p => p.name.toLowerCase() === name.toLowerCase());
  return exact?.id || scoped[0].id;
}

async function findServerPlaceId(placeId: string, name?: string, city?: string): Promise<string | null> {
  const alias = resolvePlaceIdForQuickAdd(placeId);
  if (alias !== placeId) return alias;

  if (!name?.trim()) return null;
  try {
    const res = await placesApi.list({
      search: name.trim(),
      city: city?.trim() || undefined,
      limit: 5,
      status: 'APPROVED',
    });
    const hits = res.data || [];
    return pickPlaceIdForCity(hits, name.trim(), city);
  } catch {
    return null;
  }
}

async function persistQuickAddResult(
  result: { tripId: string; stopId: string; alreadyExists: boolean },
  placeCity?: string,
) {
  invalidateDraftTripCache();
  try {
    // Drop the stale snapshot before the server refetch so TripBuilder cannot
    // paint an older copy of this trip (missing the stop just added).
    await AsyncStorage.removeItem(DRAFT_TRIP_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
  await AsyncStorage.setItem(DRAFT_TRIP_ID_KEY, result.tripId);
  const cityKey = placeCity ? canonicalizeDestination(placeCity) : '';
  if (cityKey) {
    await rememberCityDraft(cityKey, result.tripId);
  }
  try {
    const full = await tripsApi.getById(result.tripId);
    await seedDraftTripCache(full);
  } catch {
    /* id stored; next focus fetch will seed */
  }
  invalidateMyTripsList();
  return result;
}

async function quickAddOnce(placeId: string, tripId?: string) {
  return tripsApi.quickAdd(placeId, tripId);
}

export async function quickAddPlaceToTrip(
  placeId: string,
  options?: { name?: string; city?: string; tripId?: string },
) {
  const candidates = [
    resolvePlaceIdForQuickAdd(placeId),
    placeId,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  let lastError: any;
  for (const candidate of candidates) {
    try {
      const result = await quickAddOnce(candidate, options?.tripId);
      return persistQuickAddResult(result, options?.city);
    } catch (err) {
      if (options?.tripId && isCityMismatchError(err)) {
        const result = await quickAddOnce(candidate);
        return persistQuickAddResult(result, options?.city);
      }
      lastError = err;
    }
  }

  const resolved = await findServerPlaceId(placeId, options?.name, options?.city);
  if (resolved) {
    try {
      const result = await quickAddOnce(resolved, options?.tripId);
      return persistQuickAddResult(result, options?.city);
    } catch (err) {
      if (options?.tripId && isCityMismatchError(err)) {
        const result = await quickAddOnce(resolved);
        return persistQuickAddResult(result, options?.city);
      }
      throw err;
    }
  }

  throw lastError;
}

export function countTripStops(trip: TripPlan | null | undefined): number {
  if (!trip?.tripDays?.length) return 0;
  return trip.tripDays.reduce((n, d) => n + (d.stops?.length || 0), 0);
}

type LoadOptions = {
  /** Skip rebuilding draft from local place ids (slow). */
  skipResync?: boolean;
  /** Bypass the in-memory TTL and hit the server. */
  forceServer?: boolean;
};

async function fetchDraftById(tripId: string, requireStops = false): Promise<TripPlan | null> {
  try {
    const full = await tripsApi.getById(tripId);
    if (full.status !== 'DRAFT') return null;
    if (requireStops && countTripStops(full) === 0) return null;
    const normalized = normalizeTripPlan(full);
    seedDraftTripCache(normalized);
    return normalized;
  } catch {
    await clearDraftTripCache(tripId);
  }
  return null;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Create or reuse a city-specific manual (self-build) draft trip. */
export async function ensureManualDraftTrip(city?: string): Promise<TripPlan> {
  if (ensureDraftInflight) return ensureDraftInflight;

  const cityKey = city ? canonicalizeDestination(city) : '';

  ensureDraftInflight = (async () => {
    const cachedId = await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);
    if (cachedId) {
      const cached = await fetchDraftById(cachedId);
      if (cached) {
        if (!cityKey || destinationMatchesCity(cached.destination, cityKey) || isGenericDestination(cached.destination)) {
          if (cityKey && isGenericDestination(cached.destination) && countTripStops(cached) === 0) {
            const label = formatDestinationLabel(city || '');
            const updated = await tripsApi.update(cached.id, {
              destination: label,
              title: `Trip to ${label}`,
            });
            seedDraftTripCache(updated);
            return updated;
          }
          if (!cityKey || destinationMatchesCity(cached.destination, cityKey) || countTripStops(cached) === 0) {
            return cached;
          }
        }
      }
    }

    try {
      const list = await tripsApi.list({ status: 'DRAFT', limit: 10 });
      let emptyGeneric: TripPlan | null = null;
      for (const draft of list.data || []) {
        const full = await fetchDraftById(draft.id);
        if (!full) continue;
        if (cityKey && destinationMatchesCity(full.destination, cityKey)) return full;
        if (isGenericDestination(full.destination) && countTripStops(full) === 0 && !emptyGeneric) {
          emptyGeneric = full;
        }
      }
      if (emptyGeneric && cityKey) {
        const label = formatDestinationLabel(city || '');
        const updated = await tripsApi.update(emptyGeneric.id, {
          destination: label,
          title: `Trip to ${label}`,
        });
        seedDraftTripCache(updated);
        return updated;
      }
      if (emptyGeneric && !cityKey) return emptyGeneric;
    } catch {
      /* fall through to create */
    }

    const start = new Date();
    const label = cityKey ? formatDestinationLabel(city || '') : 'My Trip';
    const trip = await tripsApi.create({
      title: cityKey ? `Trip to ${label}` : 'My Itinerary',
      destination: label,
      startDate: isoDate(start),
      endDate: isoDate(start),
    });
    seedDraftTripCache(trip);
    return trip;
  })();

  try {
    return await ensureDraftInflight;
  } finally {
    ensureDraftInflight = null;
  }
}

async function resyncFromLocalItinerary(currentItinerary: string[]): Promise<TripPlan | null> {
  const ids = [...new Set(currentItinerary)].slice(0, 25);
  await Promise.all(ids.map(placeId => quickAddPlaceToTrip(placeId).catch(() => {})));

  const cachedId = await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);
  if (cachedId) {
    return fetchDraftById(cachedId);
  }

  const list = await tripsApi.list({ status: 'DRAFT', limit: 1 });
  const draftId = list.data?.[0]?.id;
  return draftId ? fetchDraftById(draftId) : null;
}

export async function loadBestDraftTrip(
  currentItinerary?: string[],
  options: LoadOptions = {},
): Promise<TripPlan | null> {
  if (!options.forceServer && memoryDraft && Date.now() - memoryDraft.at < MEMORY_TTL_MS) {
    return memoryDraft.trip;
  }

  const cachedId = await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);
  if (cachedId) {
    const withStops = await fetchDraftById(cachedId, true);
    if (withStops) return withStops;
    const cached = await fetchDraftById(cachedId);
    if (cached) return cached;
  }

  const list = await tripsApi.list({ status: 'DRAFT', limit: 3 });
  let emptyDraft: TripPlan | null = null;
  for (const draft of list.data || []) {
    const full = await fetchDraftById(draft.id);
    if (!full) continue;
    if (countTripStops(full) > 0) return full;
    if (!emptyDraft) emptyDraft = full;
  }
  if (emptyDraft) return emptyDraft;

  if (!options.skipResync && currentItinerary?.length) {
    return resyncFromLocalItinerary(currentItinerary);
  }

  return null;
}
