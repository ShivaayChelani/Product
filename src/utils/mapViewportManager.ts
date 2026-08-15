import type { MapFeedResponse } from '../services/api/places';

const MEMORY_TTL_MS = 8 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 48;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { data: MapFeedResponse; ts: number; hits: number };

const memoryCache = new Map<string, CacheEntry>();
const prefetchInFlight = new Set<string>();
const vendorMemoryCache = new Map<string, { data: unknown[]; ts: number }>();

export type ViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MapSession = {
  lat: number;
  lng: number;
  zoom: number;
  selectedMarkerId?: string;
  category?: string;
  tab?: 'places' | 'vendors';
  ts: number;
};

const SESSION_KEY = '@palsafar/map-session';

function touchEntry(key: string, entry: CacheEntry) {
  entry.hits += 1;
  entry.ts = Date.now();
  memoryCache.delete(key);
  memoryCache.set(key, entry);
}

function evictIfNeeded() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const oldest = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
  if (oldest) memoryCache.delete(oldest[0]);
}

export function cleanupExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (now - entry.ts > MEMORY_TTL_MS) memoryCache.delete(key);
  }
  for (const [key, entry] of vendorMemoryCache.entries()) {
    if (now - entry.ts > MEMORY_TTL_MS) vendorMemoryCache.delete(key);
  }
}

export function buildViewportKey(
  bounds: ViewportBounds,
  zoom: number,
  category?: string,
  prefix = 'places',
): string {
  return [
    prefix,
    bounds.south.toFixed(4),
    bounds.north.toFixed(4),
    bounds.west.toFixed(4),
    bounds.east.toFixed(4),
    String(Math.round(zoom)),
    category || 'all',
  ].join(':');
}

export function viewportsSimilar(
  a: ViewportBounds,
  b: ViewportBounds,
  zoomA: number,
  zoomB: number,
  tolerance = 0.0015,
): boolean {
  if (Math.abs(zoomA - zoomB) >= 0.5) return false;
  return (
    Math.abs(a.north - b.north) < tolerance &&
    Math.abs(a.south - b.south) < tolerance &&
    Math.abs(a.east - b.east) < tolerance &&
    Math.abs(a.west - b.west) < tolerance
  );
}

export function getMemoryCachedMapFeed(key: string): MapFeedResponse | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MEMORY_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  touchEntry(key, entry);
  return entry.data;
}

export function setMemoryCachedMapFeed(key: string, data: MapFeedResponse): void {
  cleanupExpiredCache();
  memoryCache.set(key, { data, ts: Date.now(), hits: 0 });
  evictIfNeeded();
}

export function getMemoryCachedVendors(key: string): unknown[] | null {
  const entry = vendorMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MEMORY_TTL_MS) {
    vendorMemoryCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setMemoryCachedVendors(key: string, data: unknown[]): void {
  vendorMemoryCache.set(key, { data, ts: Date.now() });
  if (vendorMemoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = [...vendorMemoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) vendorMemoryCache.delete(oldest[0]);
  }
}

export function offsetViewport(bounds: ViewportBounds, direction: 'n' | 's' | 'e' | 'w'): ViewportBounds {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  switch (direction) {
    case 'n':
      return { north: bounds.north + latSpan * 0.85, south: bounds.north, east: bounds.east, west: bounds.west };
    case 's':
      return { north: bounds.south, south: bounds.south - latSpan * 0.85, east: bounds.east, west: bounds.west };
    case 'e':
      return { north: bounds.north, south: bounds.south, east: bounds.east + lngSpan * 0.85, west: bounds.east };
    case 'w':
    default:
      return { north: bounds.north, south: bounds.south, east: bounds.west, west: bounds.west - lngSpan * 0.85 };
  }
}

export function prefetchAdjacentViewports(
  bounds: ViewportBounds,
  zoom: number,
  category: string | undefined,
  fetcher: (b: ViewportBounds) => Promise<MapFeedResponse>,
): void {
  (['n', 's', 'e', 'w'] as const).forEach((dir) => {
    const adj = offsetViewport(bounds, dir);
    const key = buildViewportKey(adj, zoom, category);
    if (getMemoryCachedMapFeed(key) || prefetchInFlight.has(key)) return;
    prefetchInFlight.add(key);
    fetcher(adj)
      .then((data) => setMemoryCachedMapFeed(key, data))
      .catch(() => {})
      .finally(() => prefetchInFlight.delete(key));
  });
}

export function getMapLimitForZoom(zoom: number): number {
  return 1000;
}

export function getZoomTier(zoom: number): 'cluster' | 'city' | 'place' | 'detail' {
  if (zoom <= 11) return 'cluster';
  if (zoom <= 13) return 'city';
  if (zoom <= 16) return 'place';
  return 'detail';
}

export async function saveMapSession(session: Omit<MapSession, 'ts'>): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, ts: Date.now() }));
  } catch { /* best-effort */ }
}

export async function loadMapSession(): Promise<MapSession | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapSession;
    if (Date.now() - parsed.ts > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
