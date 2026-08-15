/** Earth radius in meters — WGS84 mean. Display distances must use this module only. */
export const EARTH_RADIUS_M = 6371e3;

export type LatLng = { latitude: number; longitude: number };

/**
 * Parse a coordinate that may arrive as number, numeric string, or null.
 * Never coerce null/undefined/'' to 0.
 */
export function parseCoordinate(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** Null Island is never a real PalSafar place or GPS fix. */
export function isNullIsland(lat: number, lng: number): boolean {
  return lat === 0 && lng === 0;
}

/**
 * India places/GPS have lat ~6–38 and lng ~68–98.
 * If those axes are swapped the pair looks like a valid WGS84 point but is wrong.
 */
export function looksLikeSwappedLatLng(lat: number, lng: number): boolean {
  const latLooksLikeIndiaLng = lat >= 68 && lat <= 98;
  const lngLooksLikeIndiaLat = lng >= 6 && lng <= 38;
  return latLooksLikeIndiaLng && lngLooksLikeIndiaLat;
}

export function parseLatLng(latRaw: unknown, lngRaw: unknown): LatLng | null {
  const latitude = parseCoordinate(latRaw);
  const longitude = parseCoordinate(lngRaw);
  if (latitude == null || longitude == null) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  if (isNullIsland(latitude, longitude)) return null;
  if (looksLikeSwappedLatLng(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return parseLatLng(lat, lng) != null;
}

/**
 * Great-circle distance in meters.
 * Returns NaN when either coordinate pair is missing, swapped, or out of range.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const a = parseLatLng(lat1, lon1);
  const b = parseLatLng(lat2, lon2);
  if (!a || !b) return Number.NaN;

  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinHalf =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinHalf), Math.sqrt(1 - sinHalf));

  return EARTH_RADIUS_M * c;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineDistance(lat1, lon1, lat2, lon2) / 1000;
}

export function metersToKm(meters: number): number | null {
  if (!Number.isFinite(meters)) return null;
  return meters / 1000;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Straight-line distance labeled from the user. Empty when meters are invalid. */
export function formatDistanceFromYou(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m from you`;
  return `${(meters / 1000).toFixed(1)} km from you`;
}

export const LOCATION_FRESH_MS = 5 * 60 * 1000;
export const DISTANCE_ACCURACY_MAX_M = 150;

export function isFreshUserPosition(
  pos: { latitude?: unknown; longitude?: unknown; timestamp?: number } | null | undefined,
  now = Date.now(),
): boolean {
  if (!pos) return false;
  if (!parseLatLng(pos.latitude, pos.longitude)) return false;
  if (pos.timestamp != null && now - pos.timestamp > LOCATION_FRESH_MS) return false;
  return true;
}

/**
 * Use this for user-facing distance/ETA labels. A coarse network fix can be
 * kilometers off, so it must not be displayed as "from you".
 */
export function isReliableUserPosition(
  pos: { latitude?: unknown; longitude?: unknown; accuracy?: unknown; timestamp?: number } | null | undefined,
  now = Date.now(),
): pos is { latitude: number; longitude: number; accuracy?: unknown; timestamp?: number } {
  if (!isFreshUserPosition(pos, now)) return false;
  const accuracy = parseCoordinate(pos?.accuracy);
  if (accuracy == null || accuracy <= 0) return true;
  return accuracy <= DISTANCE_ACCURACY_MAX_M;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

export function calculateTotalDistance(
  spots: Array<{ distanceFromPrevious?: number }>,
): number {
  return spots.reduce((total, spot) => total + (spot.distanceFromPrevious || 0), 0);
}
