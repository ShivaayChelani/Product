/**
 * Admin coordinate input validation.
 *
 * PlaceForm previously captured coordinates with `parseFloat(...) || 0`,
 * silently turning empty / malformed input into the null-island point (0,0).
 * These helpers turn invalid or empty input into an explicit validation error
 * instead. Mirrors the server-side bulk-import gate (place-coordinates.ts).
 */

export const LATITUDE_LIMITS = { min: -90, max: 90 } as const;
export const LONGITUDE_LIMITS = { min: -180, max: 180 } as const;

export type CoordinateParseResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; error: string };

function toFiniteNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse and validate a coordinate pair typed into PlaceForm.
 * Never coerces invalid input to 0 — the caller surfaces `error` to the user.
 */
export function parseAndValidateCoordinates(
  latitude: unknown,
  longitude: unknown
): CoordinateParseResult {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);

  if (lat === null) {
    return { ok: false, error: "Latitude is required — enter a finite number between -90 and 90." };
  }
  if (lng === null) {
    return { ok: false, error: "Longitude is required — enter a finite number between -180 and 180." };
  }
  if (lat < LATITUDE_LIMITS.min || lat > LATITUDE_LIMITS.max) {
    return { ok: false, error: `Latitude must be between -90 and 90 (got ${lat}).` };
  }
  if (lng < LONGITUDE_LIMITS.min || lng > LONGITUDE_LIMITS.max) {
    return { ok: false, error: `Longitude must be between -180 and 180 (got ${lng}).` };
  }
  if (lat === 0 && lng === 0) {
    return { ok: false, error: "Coordinate (0,0) is not a valid place location — drag the map marker instead." };
  }

  return { ok: true, latitude: lat, longitude: lng };
}