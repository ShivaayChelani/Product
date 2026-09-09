/**
 * Travel-time utilities for PalSafar.
 *
 * Routing provider: OSRM (OpenStreetRoute Market) — primary routing source.
 * getEstimatedTravelTime() uses OSRM for ETA/distance in the place detail card.
 *
 * When routing is unavailable, a geodesic-based *estimate* is returned with
 * source: "fallback". That is NOT driving time and must be labeled "Est.".
 */
import { parseLatLng, type LatLng } from './distance';

export type TravelMode = 'driving';
export type TravelTimeSource = 'routing' | 'fallback';
export type TravelRouteProvider = 'osrm' | 'fallback' | string;

export type TravelTimeResult = {
  durationSeconds: number;
  /** Road meters when source is routing; geodesic meters when fallback. */
  distanceMeters: number;
  source: TravelTimeSource;
  provider?: TravelRouteProvider;
};

/** Default mixed India driving speed km/h */
export const DEFAULT_DRIVING_SPEED_KMH = 28;
const FALLBACK_ROAD_FACTOR = 1.25;
const FALLBACK_METERS_PER_SECOND = (DEFAULT_DRIVING_SPEED_KMH * 1000) / 3600;

type CacheEntry = { result: TravelTimeResult; expiresAt: number };

const travelCache = new Map<string, CacheEntry>();

export function originBucketKey(lat: number, lng: number): string {
  const q = (n: number) => (Math.floor(n / 0.001) * 0.001).toFixed(3);
  return `${q(lat)},${q(lng)}`;
}

export function travelCacheKey(origin: LatLng, destination: LatLng, mode: TravelMode = 'driving'): string {
  return `${mode}|${originBucketKey(origin.latitude, origin.longitude)}|${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
}

export function estimateFallbackTravelSeconds(geodesicMeters: number): number {
  if (!Number.isFinite(geodesicMeters) || geodesicMeters < 0) return Number.NaN;
  const roadish = geodesicMeters * FALLBACK_ROAD_FACTOR;
  return Math.max(60, Math.round(roadish / FALLBACK_METERS_PER_SECOND));
}

export function formatTravelTimeLabel(result: TravelTimeResult): string {
  const minutes = Math.max(1, Math.round(result.durationSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

export function formatDriveDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDriveDistanceLabel(distanceMeters: number, _durationSeconds?: number): string {
  return formatDriveDistanceMeters(distanceMeters);
}

/**
 * Estimated travel time from origin to destination.
 * Uses OSRM API as the primary routing source.
 * Falls back to geodesic estimate when OSRM is unavailable.
 */
export async function getEstimatedTravelTime(input: {
  origin: LatLng;
  destination: LatLng;
  mode?: TravelMode;
}): Promise<TravelTimeResult | null> {
  const origin = parseLatLng(input.origin.latitude, input.origin.longitude);
  const destination = parseLatLng(input.destination.latitude, input.destination.longitude);
  if (!origin || !destination) return null;

  // Import lazily to avoid circular dependencies
  const { getOSRMRoute } = await import('../routing/osrmService');
  const routed = await getOSRMRoute(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
    'driving',
  );

  if (routed && routed.source === 'routing') {
    const result: TravelTimeResult = {
      durationSeconds: routed.durationSeconds,
      distanceMeters: routed.distanceMeters,
      source: 'routing',
      provider: 'osrm',
    };
    travelCache.set(travelCacheKey(origin, destination, input.mode ?? 'driving'), {
      result,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return result;
  }

  // Mapbox fallback (straight-line) or complete failure — use geodesic
  const geodesic = haversineDistance(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  if (!Number.isFinite(geodesic)) return null;
  const durationSeconds = estimateFallbackTravelSeconds(geodesic);
  if (!Number.isFinite(durationSeconds)) return null;
  const result: TravelTimeResult = {
    durationSeconds,
    distanceMeters: geodesic,
    source: 'fallback',
    provider: 'fallback',
  };
  travelCache.set(travelCacheKey(origin, destination, input.mode ?? 'driving'), {
    result,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return result;
}

/** Test helper — do not use in production UI. */
export function _resetTravelTimeCacheForTests(): void {
  travelCache.clear();
}

/** Haversine distance in meters (straight-line) — used as fallback only */
const R = 6371000;
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const sinHalf =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinHalf), Math.sqrt(1 - sinHalf));

  return R * c;
}