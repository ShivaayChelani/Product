import {
  haversineDistance,
  haversineDistanceKm,
  formatDistance,
  parseCoordinate,
  parseLatLng,
  looksLikeSwappedLatLng,
  isValidLatLng,
  metersToKm,
  formatDistanceFromYou,
  isReliableUserPosition,
} from '../services/location/distance';

/** 1° of latitude ≈ 111.19 km */
const ORIGIN = { lat: 23.0, lng: 77.0 };
const ONE_DEG_NORTH = { lat: 24.0, lng: 77.0 };

describe('canonical distance', () => {
  it('returns ~111.2 km for 1 degree of latitude', () => {
    const meters = haversineDistance(ORIGIN.lat, ORIGIN.lng, ONE_DEG_NORTH.lat, ONE_DEG_NORTH.lng);
    expect(meters).toBeGreaterThan(110_000);
    expect(meters).toBeLessThan(112_500);
    const km = haversineDistanceKm(ORIGIN.lat, ORIGIN.lng, ONE_DEG_NORTH.lat, ONE_DEG_NORTH.lng);
    expect(km).toBeCloseTo(111.2, 0);
  });

  it('returns 0 for the same coordinates', () => {
    expect(haversineDistance(ORIGIN.lat, ORIGIN.lng, ORIGIN.lat, ORIGIN.lng)).toBe(0);
  });

  it('rejects invalid coordinates instead of treating them as 0', () => {
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate(undefined)).toBeNull();
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate('null')).toBeNull();
    expect(parseCoordinate('not-a-number')).toBeNull();
    expect(haversineDistance(ORIGIN.lat, ORIGIN.lng, Number.NaN, ORIGIN.lng)).toBeNaN();
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(haversineDistance(ORIGIN.lat, ORIGIN.lng, 0, 0)).toBeNaN();
  });

  it('does not treat swapped India lat/lng as a valid pair', () => {
    // Bhopal is 23.26N, 77.41E. Swapping yields a plausible-looking WGS84 point.
    expect(looksLikeSwappedLatLng(77.4126, 23.2599)).toBe(true);
    expect(parseLatLng(77.4126, 23.2599)).toBeNull();
    const swapped = haversineDistance(23.2599, 77.4126, 77.4126, 23.2599);
    expect(swapped).toBeNaN();
    const correct = haversineDistance(23.2599, 77.4126, 22.7196, 75.8577);
    expect(correct).toBeGreaterThan(150_000);
  });

  it('rejects null/undefined coordinate pairs', () => {
    expect(parseLatLng(null, 77)).toBeNull();
    expect(parseLatLng(23, undefined)).toBeNull();
    expect(isValidLatLng(null, null)).toBe(false);
  });

  it('converts meters and kilometers without silent rounding tricks', () => {
    expect(metersToKm(1500)).toBe(1.5);
    expect(formatDistance(250)).toBe('250m');
    expect(formatDistance(1500)).toBe('1.5km');
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistanceFromYou(250)).toBe('250 m from you');
    expect(formatDistanceFromYou(25000)).toBe('25.0 km from you');
  });

  it('parses numeric strings without coercing empty values to 0', () => {
    expect(parseCoordinate('23.2599')).toEqual(23.2599);
    expect(parseLatLng('23.2599', '77.4126')).toEqual({
      latitude: 23.2599,
      longitude: 77.4126,
    });
  });

  it('rejects coarse GPS fixes for user-facing distance labels', () => {
    const now = Date.now();
    expect(isReliableUserPosition({
      latitude: 23.1815,
      longitude: 79.9864,
      accuracy: 40,
      timestamp: now,
    })).toBe(true);
    expect(isReliableUserPosition({
      latitude: 23.1815,
      longitude: 79.9864,
      accuracy: 1200,
      timestamp: now,
    })).toBe(false);
  });
});
