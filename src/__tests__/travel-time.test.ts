import fs from 'fs';
import path from 'path';
import { apiClient } from '../services/api/client';
import {
  DEFAULT_DRIVING_SPEED_KMH,
  estimateFallbackTravelSeconds,
  fetchDrivingRoute,
  getEstimatedTravelTime,
  formatTravelTimeLabel,
  formatVisitDurationMinutes,
  originBucketKey,
  travelCacheKey,
  formatDriveDistanceLabel,
  _resetTravelTimeCacheForTests,
} from '../services/location/travelTime';
import {
  formatDistanceFromYou,
  haversineDistance,
  isFreshUserPosition,
  LOCATION_FRESH_MS,
  parseLatLng,
} from '../services/location/distance';

jest.mock('../services/api/client', () => ({
  apiClient: { post: jest.fn() },
}));

const mockedPost = apiClient.post as jest.Mock;

const USER = { latitude: 23.1815, longitude: 79.9864 }; // Jabalpur
const PLACE = { latitude: 23.1293, longitude: 79.8010 }; // Bhedaghat area

const BACKEND_OK_RESPONSE = {
  success: true,
  data: {
    distanceMeters: 7200,
    durationSeconds: 900,
    geometry: [[23.1815, 79.9864], [23.1293, 79.801]],
    provider: 'osrm',
  },
  message: 'Success',
};

function mockNetworkIdle() {
  return jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network unused'));
}

describe('travel time', () => {
  beforeEach(() => {
    _resetTravelTimeCacheForTests();
    mockedPost.mockReset();
    mockedPost.mockResolvedValue({ success: false, data: null, message: 'Down' });
  });

  it('does not call OSRM directly from the mobile client', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/location/travelTime.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/project-osrm/);
    expect(src).not.toMatch(/router\.project-osrm\.org/);
    expect(src).toMatch(/\/routing\/directions/);
  });

  it('uses the PalSafar backend OSRM proxy when available', async () => {
    mockedPost.mockResolvedValue(BACKEND_OK_RESPONSE);
    const fetchSpy = mockNetworkIdle();

    try {
      const result = await getEstimatedTravelTime({ origin: USER, destination: PLACE });
      expect(mockedPost).toHaveBeenCalledWith('/routing/directions', {
        originLat: USER.latitude,
        originLng: USER.longitude,
        destinationLat: PLACE.latitude,
        destinationLng: PLACE.longitude,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        durationSeconds: 900,
        distanceMeters: 7200,
        source: 'routing',
        provider: 'osrm',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('maps a successful backend response into DrivingRouteResult with geometry', async () => {
    mockedPost.mockResolvedValue(BACKEND_OK_RESPONSE);

    const withGeo = await fetchDrivingRoute(USER, PLACE, { geometry: true });
    expect(withGeo).toEqual({
      durationSeconds: 900,
      distanceMeters: 7200,
      geometry: [[23.1815, 79.9864], [23.1293, 79.801]],
      provider: 'osrm',
    });

    const withoutGeo = await fetchDrivingRoute(USER, PLACE);
    expect(withoutGeo).toEqual({
      durationSeconds: 900,
      distanceMeters: 7200,
      geometry: undefined,
      provider: 'osrm',
    });
  });

  it('falls back to the geodesic estimate when the backend routing proxy is unavailable', async () => {
    mockedPost.mockRejectedValue(new Error('backend down'));
    const fetchSpy = mockNetworkIdle();

    try {
      const result = await getEstimatedTravelTime({ origin: USER, destination: PLACE });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result?.source).toBe('fallback');
      expect(result?.provider).toBe('fallback');
      expect(result?.durationSeconds).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('falls back to the estimate when the backend returns a non-success payload', async () => {
    mockedPost.mockResolvedValue({ success: false, data: null, message: 'Down' });
    const result = await getEstimatedTravelTime({ origin: USER, destination: PLACE });
    expect(result?.source).toBe('fallback');
    expect(result?.provider).toBe('fallback');
  });

  it('falls back to the estimate when the backend returns invalid OSRM payload', async () => {
    mockedPost.mockResolvedValue({
      success: true,
      data: { distanceMeters: -1, durationSeconds: 0 },
      message: 'Success',
    });
    const result = await getEstimatedTravelTime({ origin: USER, destination: PLACE });
    expect(result?.source).toBe('fallback');
    expect(result?.provider).toBe('fallback');
  });

  it('does not treat an unauthenticated backend proxy error as a second routing API', async () => {
    const unauthenticated: any = new Error('Authentication required. Please provide a valid token.');
    unauthenticated.status = 401;
    mockedPost.mockRejectedValue(unauthenticated);
    const fetchSpy = mockNetworkIdle();

    try {
      const result = await getEstimatedTravelTime({ origin: USER, destination: PLACE });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ source: 'fallback', provider: 'fallback' });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fallback estimate scales with geodesic distance and is labeled Est.', () => {
    const near = estimateFallbackTravelSeconds(1000);
    const far = estimateFallbackTravelSeconds(25_000);
    expect(near).toBeGreaterThanOrEqual(60);
    expect(far).toBeGreaterThan(near);
    expect(far).not.toBe(3600);
    const label = formatTravelTimeLabel({
      durationSeconds: far,
      distanceMeters: 25_000,
      source: 'fallback',
    });
    expect(label.startsWith('Est. ')).toBe(true);
    expect(label).not.toBe('1 hr');
    expect(label).not.toBe('Est. 1 hr');
  });

  it('uses one documented driving speed constant for fallback', () => {
    expect(DEFAULT_DRIVING_SPEED_KMH).toBe(28);
    const tenKm = estimateFallbackTravelSeconds(10_000);
    const expected = Math.max(
      60,
      Math.round((10_000 * 1.25) / ((DEFAULT_DRIVING_SPEED_KMH * 1000) / 3600)),
    );
    expect(tenKm).toBe(expected);
  });

  it('formats travel time labels for common durations', () => {
    expect(formatTravelTimeLabel({ durationSeconds: 300, distanceMeters: 1000, source: 'routing' })).toBe(
      '5 min',
    );
    expect(formatTravelTimeLabel({ durationSeconds: 3540, distanceMeters: 1000, source: 'routing' })).toBe(
      '59 min',
    );
    expect(formatTravelTimeLabel({ durationSeconds: 3600, distanceMeters: 1000, source: 'routing' })).toBe(
      '1 hr',
    );
    expect(formatTravelTimeLabel({ durationSeconds: 5400, distanceMeters: 1000, source: 'routing' })).toBe(
      '1 hr 30 min',
    );
    expect(formatTravelTimeLabel({ durationSeconds: 8100, distanceMeters: 1000, source: 'routing' })).toBe(
      '2 hr 15 min',
    );
  });

  it('formats drive distance with genuine time to reach', () => {
    expect(formatDriveDistanceLabel(7200, 900)).toBe('7.2 km · 15 min');
    expect(formatDriveDistanceLabel(250, 60)).toBe('250 m · 1 min');
    expect(formatDriveDistanceLabel(7200)).toBe('7.2 km');
  });

  it('does not invent visit time when duration is missing', () => {
    expect(formatVisitDurationMinutes(null)).toBeNull();
    expect(formatVisitDurationMinutes(0)).toBeNull();
    expect(formatVisitDurationMinutes(undefined)).toBeNull();
    expect(formatVisitDurationMinutes(90)).toBe('1.5 hr');
    expect(formatVisitDurationMinutes(45)).toBe('45 min');
  });

  it('buckets nearby origins so tiny GPS jitter shares a cache key', () => {
    const a = { latitude: 23.1815, longitude: 79.9864 };
    const b = { latitude: 23.1816, longitude: 79.9865 };
    expect(originBucketKey(a.latitude, a.longitude)).toBe(originBucketKey(b.latitude, b.longitude));
    expect(travelCacheKey(a, PLACE)).toBe(travelCacheKey(b, PLACE));
  });

  it('returns null coordinates for 0,0 and swapped India axes', () => {
    expect(parseLatLng(0, 0)).toBeNull();
    expect(parseLatLng(79.9864, 23.1815)).toBeNull();
    expect(parseLatLng(USER.latitude, USER.longitude)).not.toBeNull();
  });
});

describe('straight-line distance from you', () => {
  it('formats known Jabalpur → Bhedaghat geodesic as km from you', () => {
    const meters = haversineDistance(USER.latitude, USER.longitude, PLACE.latitude, PLACE.longitude);
    expect(meters).toBeGreaterThan(15_000);
    expect(meters).toBeLessThan(30_000);
    expect(formatDistanceFromYou(meters)).toMatch(/ km from you$/);
    expect(formatDistanceFromYou(250)).toBe('250 m from you');
    expect(formatDistanceFromYou(Number.NaN)).toBe('');
  });

  it('rejects stale GPS for distance display', () => {
    const fresh = { ...USER, timestamp: Date.now() };
    const stale = { ...USER, timestamp: Date.now() - LOCATION_FRESH_MS - 1000 };
    expect(isFreshUserPosition(fresh)).toBe(true);
    expect(isFreshUserPosition(stale)).toBe(false);
    expect(isFreshUserPosition({ latitude: 0, longitude: 0, timestamp: Date.now() })).toBe(false);
  });

  it('distance and travel time share the same origin/destination validation', () => {
    const origin = parseLatLng(USER.latitude, USER.longitude);
    const dest = parseLatLng(PLACE.latitude, PLACE.longitude);
    expect(origin).not.toBeNull();
    expect(dest).not.toBeNull();
    const meters = haversineDistance(origin!.latitude, origin!.longitude, dest!.latitude, dest!.longitude);
    const fallbackSeconds = estimateFallbackTravelSeconds(meters);
    expect(Number.isFinite(meters)).toBe(true);
    expect(Number.isFinite(fallbackSeconds)).toBe(true);
  });
});

describe('useTravelTime hook wiring', () => {
  it('clears stale results when destinationKey changes', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/location/useTravelTime.ts'),
      'utf8',
    );
    expect(src).toMatch(/setResult\(null\)/);
    expect(src).toMatch(/destinationKey/);
    expect(src).toMatch(/genRef\.current/);
  });
});
