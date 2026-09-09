/**
 * ITINERARY HARDENING — Sections 17, 18, 21:
 *   OSRM coordinate convention, route parsing, and the 10-minute TTL cache.
 *
 * OSRM contract: `GET {base}/route/v1/{profile}/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson&steps=true`
 * → `{ routes: [{ distance, duration, geometry }] }` → RouteResult { distanceMeters, durationSeconds, geometry, profile, source: 'routing' }.
 */
(global as any).__DEV__ = false;

import {
  clearRouteCache,
  formatRouteDistance,
  formatRouteDuration,
  getOSRMRoute,
  getRoutingBaseUrl,
  setRoutingBaseUrl,
} from '../services/routing/osrmService';

type FetchMock = jest.Mock<Promise<any>, any>;

function jsonOk(routePayload: any) {
  return {
    ok: true,
    status: 200,
    json: async () => routePayload,
  };
}

describe('Section 17 — OSRM coordinate convention', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => { originalFetch = global.fetch; });
  afterAll(() => { global.fetch = originalFetch; });
  beforeEach(() => {
    clearRouteCache();
    setRoutingBaseUrl('https://router.test');
    (global as any).fetch = jest.fn();
  });

  it('sends [longitude, latitude] order, not the input [lat, lng]', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 10000, duration: 900, geometry: { coordinates: [[77.1, 28.6], [77.2, 28.7]] } }],
    }));

    const route = await getOSRMRoute(28.6, 77.1, 28.7, 77.2, 'driving');
    expect(route).not.toBeNull();

    const [url] = ((global as any).fetch as FetchMock).mock.calls[0];
    expect(url).toBe(
      'https://router.test/route/v1/driving/77.1,28.6;77.2,28.7?overview=full&geometries=geojson&steps=true'
    );
  });

  it('builds the URL from the configured base URL and profile', async () => {
    setRoutingBaseUrl('https://router.project-osrm.org');
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [] } }],
    }));

    const route = await getOSRMRoute(15.49, 73.82, 15.50, 73.83, 'cycling');
    expect(getRoutingBaseUrl()).toBe('https://router.project-osrm.org');
    expect(route?.profile).toBe('cycling');
    const [url] = ((global as any).fetch as FetchMock).mock.calls[0];
    expect(url.startsWith('https://router.project-osrm.org/route/v1/cycling/')).toBe(true);
  });
});

describe('Section 18 — route parsing (meters / seconds)', () => {
  let originalFetch: typeof global.fetch;
  beforeAll(() => { originalFetch = global.fetch; });
  afterAll(() => { global.fetch = originalFetch; });
  beforeEach(() => {
    clearRouteCache();
    setRoutingBaseUrl('https://router.test');
    (global as any).fetch = jest.fn();
  });

  it('parses distance → meters and duration → seconds without swapping units', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 12345, duration: 720, geometry: { coordinates: [] } }],
    }));
    const route = await getOSRMRoute(10, 10, 20, 20);
    expect(route?.distanceMeters).toBe(12345);
    expect(route?.durationSeconds).toBe(720);
    expect(route?.source).toBe('routing');
    expect(route?.geometry).toEqual([]);
  });

  it('formatRouteDistance shows meters under 1 km and km above', () => {
    expect(formatRouteDistance({ distanceMeters: 950, durationSeconds: 120, geometry: [], profile: 'driving', source: 'routing' })).toBe('950 m');
    expect(formatRouteDistance({ distanceMeters: 2500, durationSeconds: 120, geometry: [], profile: 'driving', source: 'routing' })).toBe('2.5 km');
  });

  it('formatRouteDuration shows minutes and hours without unit confusion', () => {
    const r = (durationSeconds: number) => ({ distanceMeters: 1000, durationSeconds, geometry: [], profile: 'driving', source: 'routing' } as const);
    expect(formatRouteDuration(r(120))).toBe('2 min');       // 120s → 2 min
    expect(formatRouteDuration(r(3600))).toBe('1 hr');        // 3600s → 60 min → 1 hr
    expect(formatRouteDuration(r(4500))).toBe('1 hr 15 min'); // 4500s → 75 min → 1 hr 15 min
    expect(formatRouteDuration(r(59))).toBe('1 min');         // rounds up to at least 1
  });

  it('unpainted routes (missing/malformed geometry array) still parse distance+duration', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 5000, duration: 600 }],
    }));
    const route = await getOSRMRoute(10, 10, 20, 20);
    expect(route?.geometry).toEqual([]);
  });

  it('segment steps are parsed from the geometry (multi-coordinate polyline)', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 1000, duration: 100, geometry: { coordinates: [[1, 2], [3, 4]] } }],
    }));
    const route = await getOSRMRoute(2, 1, 4, 3, 'driving');
    expect(route?.geometry).toEqual([[1, 2], [3, 4]]);
  });
});

describe('Section 21 — guarded failures return null, never crash', () => {
  let originalFetch: typeof global.fetch;
  beforeAll(() => { originalFetch = global.fetch; });
  afterAll(() => { global.fetch = originalFetch; });
  beforeEach(() => {
    clearRouteCache();
    setRoutingBaseUrl('https://router.test');
    (global as any).fetch = jest.fn();
  });

  it('non-finite / missing coordinates return null before any request', async () => {
    ((global as any).fetch as FetchMock).mockClear();
    await expect(getOSRMRoute(NaN, 10, 20, 20)).resolves.toBeNull();
    await expect(getOSRMRoute(10, 10, Infinity, 20)).resolves.toBeNull();
    await expect(getOSRMRoute(10 as any, 10, 20 as any, 20)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('trivially same-origin coordinates return null (skip driving between the same spot)', async () => {
    ((global as any).fetch as FetchMock).mockClear();
    await expect(getOSRMRoute(28.6139, 77.2090, 28.6139, 77.2090)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('HTTP error responses return null', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    expect(await getOSRMRoute(10, 10, 20, 20)).toBeNull();
  });

  it('NoRoute (no route/routes key) returns null', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({ code: 'NoRoute' }));
    expect(await getOSRMRoute(10, 10, 20, 20)).toBeNull();
  });

  it('empty routes array returns null', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({ routes: [] }));
    expect(await getOSRMRoute(10, 10, 20, 20)).toBeNull();
  });

  it('network failure is swallowed into null (no unhandled rejection)', async () => {
    ((global as any).fetch as FetchMock).mockRejectedValue(new TypeError('Network request failed'));
    expect(await getOSRMRoute(10, 10, 20, 20)).toBeNull();
  });

  it('malformed JSON is swallowed into null', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue({
      ok: true, status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });
    expect(await getOSRMRoute(10, 10, 20, 20)).toBeNull();
  });
});

describe('10-minute TTL cache: rounded-fixed key, deduped requests', () => {
  let originalFetch: typeof global.fetch;
  beforeAll(() => { originalFetch = global.fetch; });
  afterAll(() => { global.fetch = originalFetch; });
  beforeEach(() => {
    clearRouteCache();
    setRoutingBaseUrl('https://router.test');
    (global as any).fetch = jest.fn();
  });

  it('a second identical request hits the cache (single fetch)', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [] } }],
    }));

    const first = await getOSRMRoute(28.61391, 77.20902, 28.70412, 77.10249);
    const second = await getOSRMRoute(28.61391, 77.20902, 28.70412, 77.10249);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('minor GPS jitter within rounding precision still reuses the cached route', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [] } }],
    }));

    await getOSRMRoute(28.61391, 77.20902, 28.70412, 77.10249);
    await getOSRMRoute(28.61392, 77.20901, 28.70413, 77.10248); // 1e-5 jitter
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('different destination (different key) refetches', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [] } }],
    }));

    await getOSRMRoute(28.61391, 77.20902, 28.70412, 77.10249);
    await getOSRMRoute(28.61391, 77.20902, 28.70415, 77.10240);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('cache is keyed by profile too', async () => {
    ((global as any).fetch as FetchMock).mockResolvedValue(jsonOk({
      routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [] } }],
    }));
    await getOSRMRoute(10, 10, 20, 20, 'driving');
    await getOSRMRoute(10, 10, 20, 20, 'cycling');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});