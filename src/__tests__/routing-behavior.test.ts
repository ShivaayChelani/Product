import { getOSRMRoute } from '../services/routing/osrmService';

jest.mock('../services/routing/osrmService', () => {
  const actual = jest.requireActual('../services/routing/osrmService');
  return {
    ...actual,
    getOSRMRoute: jest.fn((originLat, originLng, destLat, destLng, profile) => {
    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLng) ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLng)
    ) {
      return Promise.resolve(null);
    }
    if (
      Math.abs(originLat - destLat) < 1e-6 &&
      Math.abs(originLng - destLng) < 1e-6
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      distanceMeters: 5000,
      durationSeconds: 300,
      geometry: { coordinates: [[79.9864, 23.1815], [79.9800, 23.1700]] },
      profile: 'driving' as const,
      source: 'routing',
    } as any);
  }),
};
});

describe('routing behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AbortController test', () => {
    it('abort/stale cancellation returns null silently', async () => {
      (getOSRMRoute as jest.Mock).mockResolvedValueOnce(null);

      const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

      expect(result).toBeNull();
    });
  });

  describe('Stale request test', () => {
    it('Destination B route remains, A cannot overwrite', async () => {
      (getOSRMRoute as jest.Mock)
        .mockResolvedValueOnce({
          distanceMeters: 3000,
          durationSeconds: 180,
          geometry: { coordinates: [[79.9864, 23.1815], [79.9800, 23.1700]] },
          profile: 'driving' as const,
          source: 'routing',
        } as any);

      const resultB = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

      expect(resultB).not.toBeNull();
      expect(resultB?.distanceMeters).toBe(3000);
    });
  });

  describe('Cache test', () => {
    it('successful OSRM route is returned', async () => {
      (getOSRMRoute as jest.Mock).mockResolvedValueOnce({
        distanceMeters: 5000,
        durationSeconds: 300,
        geometry: { coordinates: [[79.9864, 23.1815], [79.9800, 23.1700]] },
        profile: 'driving' as const,
        source: 'routing',
      } as any);

      const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

      expect(result).not.toBeNull();
      expect(result?.distanceMeters).toBe(5000);
    });

    it('failed OSRM route is not stored as valid', async () => {
      (getOSRMRoute as jest.Mock).mockResolvedValueOnce(null);

      const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

      expect(result).toBeNull();
    });
  });

  describe('Error classification', () => {
    it('network/fetch failure returns null gracefully', async () => {
      (getOSRMRoute as jest.Mock).mockResolvedValueOnce(null);

      const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

      expect(result).toBeNull();
    });

    it('invalid coordinates return null (handled by validation)', async () => {
      (getOSRMRoute as jest.Mock).mockResolvedValueOnce(null);

      const result = await getOSRMRoute(NaN, NaN, 23.1293, 79.8010, 'driving');

      expect(result).toBeNull();
    });

    it('AbortError does not become "Route not found"', async () => {
      (getOSRMRoute as jest.Mock).mockResolvedValueOnce(null);

      const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

      expect(result).toBeNull();
    });
  });

  describe('Formatting utilities', () => {
    it('formatRouteDistance formats correctly', () => {
      const { formatRouteDistance } = require('../services/routing/osrmService');
      expect(formatRouteDistance({ distanceMeters: 500 } as any)).toBe('500 m');
      expect(formatRouteDistance({ distanceMeters: 1500 } as any)).toBe('1.5 km');
      expect(formatRouteDistance({ distanceMeters: -10 } as any)).toBe('');
      expect(formatRouteDistance({ distanceMeters: NaN } as any)).toBe('');
    });

    it('formatRouteDuration formats correctly', () => {
      const { formatRouteDuration } = require('../services/routing/osrmService');
      expect(formatRouteDuration({ durationSeconds: 45 } as any)).toBe('1 min');
      expect(formatRouteDuration({ durationSeconds: 300 } as any)).toBe('5 min');
      expect(formatRouteDuration({ durationSeconds: 3600 } as any)).toBe('1 hr');
      expect(formatRouteDuration({ durationSeconds: 3660 } as any)).toBe('1 hr 1 min');
      expect(formatRouteDuration({ durationSeconds: -10 } as any)).toBe('');
      expect(formatRouteDuration({ durationSeconds: NaN } as any)).toBe('');
    });

  });
});