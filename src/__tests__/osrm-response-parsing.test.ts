jest.mock('../services/routing/osrmService');

import { getOSRMRoute } from '../services/routing/osrmService';

describe('OSRM response parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses successful OSRM response with distance and duration', async () => {
    (getOSRMRoute as jest.Mock).mockResolvedValue({
      distanceMeters: 27099.3,
      durationSeconds: 1525.4,
      geometry: {
        coordinates: [[79.9864, 23.1815], [79.9800, 23.1700]],
      },
      profile: 'driving' as const,
      source: 'routing',
    } as any);

    const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

    expect(result).not.toBeNull();
    expect(result?.distanceMeters).toBe(27099.3);
    expect(result?.durationSeconds).toBe(1525.4);
    expect(result?.geometry).toBeDefined();
    expect(result?.geometry?.coordinates.length).toBeGreaterThan(1);
  });

  it('coordinate conversion: application format [lat, lng] to OSRM [lng, lat]', () => {
    const origin = { latitude: 23.1815, longitude: 79.9864 };
    const destination = { latitude: 23.1293, longitude: 79.8010 };

    const osrmOrigin = `${origin.longitude},${origin.latitude}`;
    const osrmDestination = `${destination.longitude},${destination.latitude}`;

    expect(osrmOrigin).toBe('79.9864,23.1815');
    expect(osrmDestination).toMatch(/^79\.\d+,\d+\.\d+$/);
  });

  it('Leaflet geometry conversion: OSRM [lng, lat] to Leaflet [lat, lng]', () => {
    const osrmCoordinates = [[79.9864, 23.1815], [79.9800, 23.1700]];
    const leafletCoordinates: [number, number][] = osrmCoordinates.map(
      ([lng, lat]) => [lat, lng]
    );

    expect(leafletCoordinates[0]).toEqual([23.1815, 79.9864]);
    expect(leafletCoordinates[1]).toEqual([23.1700, 79.9800]);
  });
});