/**
 * Coordinate validation for write paths that bypass the create/update zod
 * schemas (bulk CSV import, direct service calls).
 *
 * Rules enforced here mirror createPlaceSchema but with an explicit null-island
 * guard: a coordinate pair must be finite, in range, and never (0,0). Values
 * are passed through unchanged — no rounding, no silent coercion to 0.
 */

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

export type CoordinateValidation =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: string };

/** Coerce a cell into a finite number, or null for null/empty/NaN/Infinity/garbage. */
function toFiniteNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function validateBulkCoordinates(latitude: unknown, longitude: unknown): CoordinateValidation {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);

  if (lat == null) {
    return { ok: false, reason: 'latitude is missing, empty, or not a finite number' };
  }
  if (lng == null) {
    return { ok: false, reason: 'longitude is missing, empty, or not a finite number' };
  }
  if (lat < LATITUDE_MIN || lat > LATITUDE_MAX) {
    return { ok: false, reason: `latitude ${lat} is outside ${LATITUDE_MIN}..${LATITUDE_MAX}` };
  }
  if (lng < LONGITUDE_MIN || lng > LONGITUDE_MAX) {
    return { ok: false, reason: `longitude ${lng} is outside ${LONGITUDE_MIN}..${LONGITUDE_MAX}` };
  }
  if (lat === 0 && lng === 0) {
    return { ok: false, reason: 'latitude/longitude (0,0) is not a valid tourist place location' };
  }

  return { ok: true, latitude: lat, longitude: lng };
}