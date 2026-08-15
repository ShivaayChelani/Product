import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TouristSpot } from '../types';

const KEY = '@palsafar_itinerary_place_cache';

type PlaceCache = Record<string, TouristSpot>;

let memoryCache: PlaceCache = {};

export async function loadItineraryPlaceCache(): Promise<PlaceCache> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) memoryCache = { ...memoryCache, ...JSON.parse(raw) };
  } catch {
    // keep in-memory cache
  }
  return memoryCache;
}

export function getCachedItineraryPlace(id: string): TouristSpot | undefined {
  return memoryCache[id];
}

export async function cacheItineraryPlace(place: TouristSpot): Promise<void> {
  if (!place?.id) return;
  memoryCache = { ...memoryCache, [place.id]: place };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(memoryCache));
  } catch {
    // ignore persist failures; memory still works for this session
  }
}

export function mergeCachedPlaces(places: TouristSpot[]): TouristSpot[] {
  const map = new Map(places.map(p => [p.id, p]));
  Object.values(memoryCache).forEach(p => {
    if (!map.has(p.id)) map.set(p.id, p);
  });
  return Array.from(map.values());
}
