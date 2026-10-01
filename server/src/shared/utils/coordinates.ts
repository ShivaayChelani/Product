/**
 * Canonical coordinate validation for every PalSafar write path.
 *
 * Mirrors the mobile rules in `src/services/location/distance.ts` so a value
 * rejected by the app is also rejected by the API, and so nothing server-side
 * can invent a position.
 *
 * PalSafar canonical convention (see PALSAFAR_EXISTING_EVENTS_MAP_FORENSIC_AUDIT.md
 * §3): two separate `latitude` / `longitude` numeric columns, and the PostGIS
 * point is built LONGITUDE-FIRST — `ST_MakePoint(longitude, latitude)`, SRID 4326.
 *
 * Hard rules, enforced here rather than per call site:
 *   - never coerce null / '' / undefined to 0
 *   - never accept NaN or ±Infinity
 *   - never accept (0, 0) — Null Island is a GPS bug, not a location
 *   - never accept a swapped axis pair, which is a valid WGS84 point in the
 *     wrong hemisphere and would silently plot off the coast of Africa
 */
import { ApiError } from './ApiError';
import { isCoordinateInIndia } from './indiaGeo';

/** A validated coordinate pair. Never partially populated. */
export interface ValidatedCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Parse a coordinate that may arrive as number or numeric string.
 * Returns null for null/undefined/blank/non-numeric — never 0.
 */
export function parseCoordinateValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isValidLatitudeValue(lat: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitudeValue(lng: unknown): lng is number {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** Null Island is never a real PalSafar event, place, or GPS fix. */
export function isNullIsland(lat: number, lng: number): boolean {
  return lat === 0 && lng === 0;
}

/**
 * India sits at lat ~6–38 and lng ~68–98. A pair whose axes are swapped is a
 * perfectly valid WGS84 point in the Gulf of Guinea, so range checks alone
 * cannot catch it.
 */
export function looksLikeSwappedAxes(lat: number, lng: number): boolean {
  const latLooksLikeIndiaLng = lat >= 68 && lat <= 98;
  const lngLooksLikeIndiaLat = lng >= 6 && lng <= 38;
  return latLooksLikeIndiaLng && lngLooksLikeIndiaLat;
}

/**
 * Non-throwing validation. Returns null when the pair is unusable, which is the
 * shape every read path wants: an unplottable row is filtered out, never
 * defaulted.
 */
export function validateCoordinatePair(latRaw: unknown, lngRaw: unknown): ValidatedCoordinate | null {
  const latitude = parseCoordinateValue(latRaw);
  const longitude = parseCoordinateValue(lngRaw);
  if (latitude === null || longitude === null) return null;
  if (!isValidLatitudeValue(latitude) || !isValidLongitudeValue(longitude)) return null;
  if (isNullIsland(latitude, longitude)) return null;
  if (looksLikeSwappedAxes(latitude, longitude)) return null;
  return { latitude, longitude };
}

export interface CoordinateRequirement {
  /** Reject positions outside the India bounding box. Default true. */
  requireIndia?: boolean;
  /** Reject a lat/lng pair whose axes are swapped. Default true. */
  rejectSwappedAxes?: boolean;
  /** Value substituted into the ApiError message, e.g. 'Event'. */
  label?: string;
}

/**
 * Throwing variant for write paths. Used instead of `latitude || 0` fallbacks:
 * a caller must either supply a real position or be told the submission is
 * incomplete.
 */
export function assertValidCoordinatePair(
  latRaw: unknown,
  lngRaw: unknown,
  options: CoordinateRequirement = {},
): ValidatedCoordinate {
  const label = options.label || 'Location';
  const requireIndia = options.requireIndia !== false;
  const rejectSwappedAxes = options.rejectSwappedAxes !== false;

  if (latRaw === null || latRaw === undefined || (typeof latRaw === 'string' && !latRaw.trim())) {
    throw new ApiError(400, `${label}: latitude is required.`);
  }
  if (lngRaw === null || lngRaw === undefined || (typeof lngRaw === 'string' && !lngRaw.trim())) {
    throw new ApiError(400, `${label}: longitude is required.`);
  }

  const latitude = parseCoordinateValue(latRaw);
  const longitude = parseCoordinateValue(lngRaw);

  // Number('abc') is NaN and Number(Infinity) is Infinity; both are rejected by
  // parseCoordinateValue returning null, so they are indistinguishable from a
  // missing value here. Give the caller the actionable message.
  if (latitude === null) {
    throw new ApiError(400, `${label}: latitude must be a finite number.`);
  }
  if (longitude === null) {
    throw new ApiError(400, `${label}: longitude must be a finite number.`);
  }
  if (!isValidLatitudeValue(latitude)) {
    throw new ApiError(400, `${label}: latitude must be between -90 and 90.`);
  }
  if (!isValidLongitudeValue(longitude)) {
    throw new ApiError(400, `${label}: longitude must be between -180 and 180.`);
  }
  if (isNullIsland(latitude, longitude)) {
    throw new ApiError(400, `${label}: (0, 0) is not a valid position. Please provide the real coordinates.`);
  }
  if (rejectSwappedAxes && looksLikeSwappedAxes(latitude, longitude)) {
    throw new ApiError(
      400,
      `${label}: latitude and longitude appear to be swapped. Send latitude first (e.g. 22.18, 79.99).`,
    );
  }
  if (requireIndia && !isCoordinateInIndia(latitude, longitude)) {
    throw new ApiError(400, `${label}: coordinates must be within India.`);
  }

  return { latitude, longitude };
}

/**
 * Guard for update paths that accept coordinates optionally: either BOTH are
 * supplied or NEITHER is. A half-move would leave the row with a new latitude
 * and a stale longitude, which is how coordinates get corrupted.
 */
export function assertCoordinatePairComplete(latRaw: unknown, lngRaw: unknown, label = 'Location'): void {
  const latProvided = latRaw !== undefined && latRaw !== null && String(latRaw).trim() !== '';
  const lngProvided = lngRaw !== undefined && lngRaw !== null && String(lngRaw).trim() !== '';
  if (latProvided !== lngProvided) {
    throw new ApiError(400, `${label}: provide both latitude and longitude together.`);
  }
}