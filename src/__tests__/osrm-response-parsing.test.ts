import {
  clearRouteCache,
  getOSRMRoute,
  setRoutingBaseUrl,
} from '../services/routing/osrmService';

describe('OSRM response parsing', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    clearRouteCache();
    setRoutingBaseUrl('https://router.test');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'Ok',
        routes: [{
          distance: 27099.3,
          duration: 1525.4,
          geometry: {
            coordinates: [[79.9864, 23.1815], [79.9800, 23.1700]],
          },
        }],
      }),
    });
  });

  it('parses road distance, duration, and GeoJSON coordinates', async () => {
    const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');

    expect(result).toEqual({
      distanceMeters: 27099.3,
      durationSeconds: 1525.4,
      geometry: [[79.9864, 23.1815], [79.9800, 23.1700]],
      profile: 'driving',
      source: 'routing',
    });
  });

  it('converts OSRM [longitude, latitude] geometry for Leaflet [latitude, longitude]', async () => {
    const result = await getOSRMRoute(23.1815, 79.9864, 23.1293, 79.8010, 'driving');
    const leafletCoordinates = result!.geometry.map(([lng, lat]) => [lat, lng]);

    expect(leafletCoordinates).toEqual([[23.1815, 79.9864], [23.1700, 79.9800]]);
  });
});
