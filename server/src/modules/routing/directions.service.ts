import { env } from '../../config/env';

const GOOGLE_ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_ROUTES_TIMEOUT_MS = 8_000;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Leaflet [lat, lng] pairs when geometry is requested. */
  geometry?: Array<[number, number]>;
}

interface GoogleRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    /** Google returns a string like "1560s". */
    duration?: string;
    polyline?: {
      geoJsonLinestring?: {
        type?: string;
        /** [lng, lat] pairs from Google — mapped to [lat, lng] below. */
        coordinates?: Array<[number, number]>;
      };
    };
  }>;
}

/**
 * Converts Google's "1560s" duration string to whole seconds.
 */
function parseGoogleDurationSeconds(duration: string | undefined): number {
  if (typeof duration !== 'string') return Number.NaN;
  const seconds = Number(duration.replace(/\D/g, ''));
  return Number.isFinite(seconds) ? seconds : Number.NaN;
}

/**
 * Calls the Google Routes API (computeRoutes) for a driving route with live-traffic
 * awareness. Returns null on any failure or missing configuration so callers can
 * degrade gracefully to geodesic estimates (the existing client fallback).
 */
export async function fetchGoogleRouteDirections(
  origin: GeoPoint,
  destination: GeoPoint,
  options?: { timeoutMs?: number; geometry?: boolean },
): Promise<DirectionsResult | null> {
  const apiKey = env.googleMapsApiKey;
  if (!apiKey) return null;

  const includeGeometry = options?.geometry !== false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? GOOGLE_ROUTES_TIMEOUT_MS,
  );

  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    units: 'METRIC',
    polylineEncoding: 'GEOJSON_LINESTRING',
  };

  try {
    const res = await fetch(GOOGLE_ROUTES_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Limit the payload to the fields we consume.
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GoogleRoutesResponse;
    const route = data?.routes?.[0];
    if (!route) return null;

    const distanceMeters = Number(route.distanceMeters);
    const durationSeconds = parseGoogleDurationSeconds(route.duration);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

    const coordinates = route.polyline?.geoJsonLinestring?.coordinates;
    const geometry =
      includeGeometry && Array.isArray(coordinates)
        ? coordinates.map((c) => [c[1], c[0]] as [number, number])
        : undefined;

    return { distanceMeters, durationSeconds, geometry };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
