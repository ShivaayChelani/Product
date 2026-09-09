/**
 * OSRM routing service — OpenStreetMap-based road routing.
 *
 * Architecture: Mobile App → OSRM API → OSM road network → Real road route
 *
 * Coordinate convention: OSRM expects [longitude, latitude] order.
 * Internal usage: { lat, lng } — convert to [lng, lat] before OSRM calls.
 *
 * Routing profiles: 'driving', 'walking', 'cycling'
 * — Must be supported by the deployed OSRM instance.
 *
 * Cache: lightweight TTL cache keyed by origin+destination+profile.
 * GPS coordinates rounded before key generation to avoid stale cache misses.
 */
export type TravelProfile = 'driving' | 'walking' | 'cycling';

/**
 * Normalized route result — all consumers use this shape.
 */
export type RouteResult = {
  /** Road distance in meters (from OSRM API). */
  distanceMeters: number;
  /** Travel duration in seconds (from OSRM API). */
  durationSeconds: number;
  /**
   * Route geometry as GeoJSON [longitude, latitude] pairs.
   * Use as-is with Leaflet polyline via L.polyline(route.geometry).
   * Internal format: { lat, lng } — convert to [lng, lat] for OSRM.
   */
  geometry: [number, number][];
  /** Travel profile used. */
  profile: TravelProfile;
  /** Always 'routing' when routing succeeded. */
  source: 'routing';
};

/** OSRM base URL — configure via environment variable VITE_ROUTING_BASE_URL */
const DEFAULT_ROUTING_BASE_URL = 'https://router.project-osrm.org';
let routingBaseUrl: string = DEFAULT_ROUTING_BASE_URL;

/** Set the OSRM routing base URL (e.g. self-hosted deployment). */
export function setRoutingBaseUrl(url: string): void {
  routingBaseUrl = url;
}

/**
 * Cache for route results — TTL 10 minutes, bounded by origin+dest+profile key.
 * GPS coordinates rounded before key generation to avoid cache misses
 * from minor location jitter.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
type CachedRoute = RouteResult & { expiresAt: number };
const routeCache = new Map<string, CachedRoute>();

/** Round coordinates to suppress GPS jitter in cache keys. */
function roundCoord(n: number): number {
  return Math.round(n * 100000) / 100000;
}

/** Stable cache key incorporating profile, rounded origin, and precise destination */
function makeRouteCacheKey(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  profile: TravelProfile,
): string {
  return (
    profile +
    '|' +
    roundCoord(originLat).toFixed(5) +
    ',' +
    roundCoord(originLng).toFixed(5) +
    '|' +
    roundCoord(destLat).toFixed(5) +
    ',' +
    roundCoord(destLng).toFixed(5)
  );
}

/**
 * Get a road route from OSRM API.
 *
 * @param originLat - Origin latitude
 * @param originLng - Origin longitude
 * @param destLat - Destination latitude
 * @param destLng - Destination longitude
 * @param profile - Travel profile: 'driving', 'walking', or 'cycling'
 * @returns RouteResult with road distance, ETA, and GeoJSON geometry, or null on failure
 */
export async function getOSRMRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  profile: TravelProfile = 'driving',
): Promise<RouteResult | null> {
  // Validate coordinates defensively
  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return null;
  }
  // Skip trivially same location
  if (
    Math.abs(originLat - destLat) < 1e-6 &&
    Math.abs(originLng - destLng) < 1e-6
  ) {
    return null;
  }

  const cacheKey = makeRouteCacheKey(
    originLat,
    originLng,
    destLat,
    destLng,
    profile,
  );
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { expiresAt: _exp, ...result } = cached;
    return result as RouteResult;
  }

  // OSRM API format: /route/v1/{profile}/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson&steps=true
  const coords = `${originLng},${originLat};${destLng},${destLat}`;
  const url =
    routingBaseUrl +
    '/route/v1/' +
    profile +
    '/' +
    coords +
    '?overview=full&geometries=geojson&steps=true';

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    if (!json || !json.route && !json.routes) {
      return null;
    }

    let route;
    if (json.route) {
      route = json.route;
    } else {
      route = json.routes[0];
    }
    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);
    const geometry: [number, number][] = route.geometry?.coordinates ?? [];

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters <= 0 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      return null;
    }

    const result: RouteResult = {
      distanceMeters,
      durationSeconds,
      geometry,
      profile,
      source: 'routing',
    };

    // Cache with short TTL — retry routing sooner if conditions change
    routeCache.set(cacheKey, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    if (__DEV__) console.warn('[OSRM] fetch failed', err);
    return null;
  }
}

/**
 * Format road distance for display.
 * Distance is in meters from OSRM.
 */
export function formatRouteDistance(result: RouteResult): string {
  const m = result.distanceMeters;
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Format ETA for display.
 * Duration is in seconds from OSRM.
 */
export function formatRouteDuration(result: RouteResult): string {
  const s = result.durationSeconds;
  if (!Number.isFinite(s) || s <= 0) return '';
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
}

/** Clear route cache — useful when user changes destination */
export function clearRouteCache(): void {
  routeCache.clear();
}

/** Get current routing base URL */
export function getRoutingBaseUrl(): string {
  return routingBaseUrl;
}