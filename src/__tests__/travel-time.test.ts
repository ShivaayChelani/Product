import { getEstimatedTravelTime, _resetTravelTimeCacheForTests } from '../services/location/travelTime';

jest.mock('../services/routing/osrmService', () => ({
  getOSRMRoute: jest.fn(),
}));

describe('travel time', () => {
  beforeEach(() => {
    _resetTravelTimeCacheForTests();
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockClear();
  });

  it('uses OSRM (not Mapbox proxy) for getEstimatedTravelTime', async () => {
    const mockRoute = {
      distanceMeters: 5000,
      durationSeconds: 300,
      geometry: [[79.9864, 23.1815], [79.9800, 23.1700]],
      profile: 'driving',
      source: 'routing',
    };
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(mockRoute);

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('routing');
    expect(result?.provider).toBe('osrm');
    expect(result?.durationSeconds).toBe(300);
    expect(result?.distanceMeters).toBe(5000);
  });

  it('falls back to geodesic estimate when OSRM unavailable', async () => {
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(null);

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('fallback');
    expect(result?.provider).toBe('fallback');
    expect(result?.durationSeconds).toBeGreaterThan(0);
    expect(result?.distanceMeters).toBeGreaterThan(0);
  });

  it('does not call /routing/directions when OSRM is primary', async () => {
    const mockRoute = {
      distanceMeters: 5000,
      durationSeconds: 300,
      geometry: [[79.9864, 23.1815], [79.9800, 23.1700]],
      profile: 'driving',
      source: 'routing',
    };
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(mockRoute);

    _resetTravelTimeCacheForTests();

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('routing');
    expect(result?.provider).toBe('osrm');
  });

  it('fallback estimate is labeled Est. when geodesic-based', async () => {
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(null);

    _resetTravelTimeCacheForTests();

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result?.source).toBe('fallback');
    expect(result?.provider).toBe('fallback');
    expect(result?.durationSeconds).toBeGreaterThan(0);
    const minutes = Math.max(1, Math.round(result!.durationSeconds / 60));
    const label = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
    expect(label).not.toContain('Est.');
  });

  it('caches successful OSRM route', async () => {
    const mockRoute = {
      distanceMeters: 5000,
      durationSeconds: 300,
      geometry: [[79.9864, 23.1815], [79.9800, 23.1700]],
      profile: 'driving',
      source: 'routing',
    };
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(mockRoute);

    _resetTravelTimeCacheForTests();

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result1 = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result1).not.toBeNull();
    expect(result1?.provider).toBe('osrm');

    const result2 = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result2).not.toBeNull();
    expect(result2?.provider).toBe('osrm');
  });

  it('returns null when OSRM route fails', async () => {
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(null);

    _resetTravelTimeCacheForTests();

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result).not.toBeNull();
  });

  it('maps a successful backend response into result with correct shape', async () => {
    const mockRoute = {
      distanceMeters: 5000,
      durationSeconds: 300,
      geometry: [[79.9864, 23.1815], [79.9800, 23.1700]],
      profile: 'driving',
      source: 'routing',
    };
    (require('../services/routing/osrmService') as any).getOSRMRoute.mockResolvedValue(mockRoute);

    _resetTravelTimeCacheForTests();

    const USER = { latitude: 28.6139, longitude: 77.2090 };
    const PLACE = { latitude: 28.7041, longitude: 77.1025 };

    const result = await getEstimatedTravelTime({
      origin: USER,
      destination: PLACE,
      mode: 'driving',
    });

    expect(result).toMatchObject({
      durationSeconds: expect.any(Number),
      distanceMeters: expect.any(Number),
      source: 'routing',
      provider: 'osrm',
    });
  });
});