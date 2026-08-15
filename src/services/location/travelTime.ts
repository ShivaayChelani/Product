/**
 * Canonical travel-time for PalSafar.
 *
 * Routing provider: PalSafar backend OSRM proxy (POST /routing/directions).
 * The backend calls the public OSRM demo router; no routing API key is used.
 *
 * When routing is unavailable, a geodesic-based *estimate* is returned with
 * source: "fallback". That is NOT driving time and must be labeled "Est.".
 */
import { apiClient } from '../api/client';
import {
  haversineDistance,
  parseLatLng,
  type LatLng,
} from './distance';

export type TravelMode = 'driving';
export type TravelTimeSource = 'routing' | 'fallback';
export type TravelRouteProvider = 'osrm' | 'fallback';

export type TravelTimeResult = {
  durationSeconds: number;
  /** Road meters when source is routing; geodesic meters when fallback. */
  distanceMeters: number;
  source: TravelTimeSource;
  provider?: TravelRouteProvider;
};

export type DrivingRouteResult = {
  durationSeconds: number;
  distanceMeters: number;
  /** Leaflet [lat, lng] pairs when geometry was requested. */
  geometry?: [number, number][];
  provider?: 'osrm';
};

const DIRECTIONS_ENDPOINT = '/routing/directions';
const CACHE_TTL_MS = 10 * 60 * 1000;
/** ~111 m at the equator — tiny GPS jitter does not refetch. */
const ORIGIN_BUCKET_DEG = 0.001;

/**
 * Documented fallback: geodesic × 1.25 (roads are longer than the great circle)
 * at this average mixed India driving speed. Never presented as routing time.
 */
export const DEFAULT_DRIVING_SPEED_KMH = 28;
const FALLBACK_ROAD_FACTOR = 1.25;
const FALLBACK_METERS_PER_SECOND = (DEFAULT_DRIVING_SPEED_KMH * 1000) / 3600;

type CacheEntry = { result: TravelTimeResult; expiresAt: number };

const travelCache = new Map<string, CacheEntry>();

export function originBucketKey(lat: number, lng: number): string {
  const q = (n: number) => (Math.floor(n / ORIGIN_BUCKET_DEG) * ORIGIN_BUCKET_DEG).toFixed(3);
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
  let core: string;
  if (minutes < 60) {
    core = `${minutes} min`;
  } else if (minutes % 60 === 0) {
    core = `${minutes / 60} hr`;
  } else {
    core = `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
  }
  return result.source === 'routing' ? core : `Est. ${core}`;
}

export function formatVisitDurationMinutes(minutes?: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = minutes / 60;
  return Number.isInteger(hrs) ? `${hrs} hr` : `${hrs.toFixed(1)} hr`;
}

export function formatDriveDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDriveDistanceLabel(
  distanceMeters: number,
  durationSeconds?: number,
): string {
  const distance = formatDriveDistanceMeters(distanceMeters);
  if (!distance) return '';
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return distance;
  }
  return `${distance} · ${formatTravelTimeLabel({
    durationSeconds,
    distanceMeters,
    source: 'routing',
  })}`;
}

/**
 * Calls the PalSafar backend OSRM proxy (POST /api/v1/routing/directions).
 * Returns null on any failure so callers can fall back to geodesic estimates.
 */
async function fetchBackendDrivingRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<DrivingRouteResult | null> {
  try {
    const res = await apiClient.post<{
      distanceMeters: number;
      durationSeconds: number;
      geometry?: Array<[number, number]>;
      provider?: string;
    }>(DIRECTIONS_ENDPOINT, {
      originLat: origin.latitude,
      originLng: origin.longitude,
      destinationLat: destination.latitude,
      destinationLng: destination.longitude,
    });
    if (!res?.success) return null;
    const data = res.data;
    const distanceMeters = Number(data?.distanceMeters);
    const durationSeconds = Number(data?.durationSeconds);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    return {
      durationSeconds,
      distanceMeters,
      geometry: Array.isArray(data?.geometry) ? (data.geometry as [number, number][]) : undefined,
      provider: 'osrm',
    };
  } catch {
    return null;
  }
}

/** Driving route via the PalSafar backend OSRM proxy. */
export async function fetchDrivingRoute(
  origin: LatLng,
  destination: LatLng,
  options?: { geometry?: boolean },
): Promise<DrivingRouteResult | null> {
  const from = parseLatLng(origin.latitude, origin.longitude);
  const to = parseLatLng(destination.latitude, destination.longitude);
  if (!from || !to) return null;

  const backend = await fetchBackendDrivingRoute(from, to);
  if (!backend) return null;
  return options?.geometry === true ? backend : { ...backend, geometry: undefined };
}

export async function getEstimatedTravelTime(input: {
  origin: LatLng;
  destination: LatLng;
  mode?: TravelMode;
}): Promise<TravelTimeResult | null> {
  const origin = parseLatLng(input.origin.latitude, input.origin.longitude);
  const destination = parseLatLng(input.destination.latitude, input.destination.longitude);
  if (!origin || !destination) return null;

  const key = travelCacheKey(origin, destination, input.mode ?? 'driving');
  const cached = travelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const routed = await fetchDrivingRoute(origin, destination);
  if (routed) {
    const result: TravelTimeResult = {
      durationSeconds: routed.durationSeconds,
      distanceMeters: routed.distanceMeters,
      source: 'routing',
      provider: routed.provider ?? 'osrm',
    };
    travelCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

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
  travelCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Test helper — do not use in production UI. */
export function _resetTravelTimeCacheForTests(): void {
  travelCache.clear();
}
