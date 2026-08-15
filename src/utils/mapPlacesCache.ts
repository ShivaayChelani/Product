import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapFeedResponse } from '../services/api/places';

const CACHE_PREFIX = '@palsafar/map-cache/';
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheKey(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
  category?: string;
}): string {
  return [
    bounds.south.toFixed(3),
    bounds.north.toFixed(3),
    bounds.west.toFixed(3),
    bounds.east.toFixed(3),
    String(bounds.zoom),
    bounds.category || 'all',
  ].join(':');
}

export async function getCachedMapFeed(params: {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
  category?: string;
}): Promise<MapFeedResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + cacheKey(params));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: MapFeedResponse };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(CACHE_PREFIX + cacheKey(params));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function setCachedMapFeed(
  params: {
    north: number;
    south: number;
    east: number;
    west: number;
    zoom: number;
    category?: string;
  },
  data: MapFeedResponse,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_PREFIX + cacheKey(params),
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {
    /* offline cache is best-effort */
  }
}

export async function getLastMapFeed(): Promise<MapFeedResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + 'last');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: MapFeedResponse };
    if (Date.now() - parsed.ts > CACHE_TTL_MS * 2) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function setLastMapFeed(data: MapFeedResponse): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + 'last', JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* best-effort */
  }
}
