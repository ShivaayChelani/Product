import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchOsrmDirections,
} from '../modules/routing/directions.service';
import { directionsController } from '../modules/routing/directions.controller';
import { directionsBodySchema } from '../modules/routing/directions.validation';

const ORIGIN = { lat: 23.1317, lng: 79.8021 };
const DESTINATION = { lat: 23.1936, lng: 79.9328 };

const OSRM_OK_BODY = {
  code: 'Ok',
  routes: [
    {
      distance: 18310,
      duration: 1560,
      geometry: {
        coordinates: [
          [79.8021, 23.1317],
          [79.867, 23.162],
          [79.9328, 23.1936],
        ],
      },
    },
  ],
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('directions body validation', () => {
  it('accepts valid coordinates', () => {
    const parsed = directionsBodySchema.safeParse({
      originLat: 23.1317,
      originLng: 79.8021,
      destinationLat: -45.5,
      destinationLng: 179.9,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects latitude out of range (-90..90)', () => {
    expect(directionsBodySchema.safeParse({
      originLat: 91,
      originLng: 79,
      destinationLat: 10,
      destinationLng: 10,
    }).success).toBe(false);
    expect(directionsBodySchema.safeParse({
      originLat: -91,
      originLng: 79,
      destinationLat: 10,
      destinationLng: 10,
    }).success).toBe(false);
  });

  it('rejects longitude out of range (-180..180)', () => {
    expect(directionsBodySchema.safeParse({
      originLat: 10,
      originLng: 181,
      destinationLat: 10,
      destinationLng: 10,
    }).success).toBe(false);
    expect(directionsBodySchema.safeParse({
      originLat: 10,
      originLng: 10,
      destinationLat: 10,
      destinationLng: -181,
    }).success).toBe(false);
  });

  it('rejects missing or non-numeric coordinates', () => {
    expect(directionsBodySchema.safeParse({
      originLat: 23.1317,
      originLng: 79.8021,
      destinationLat: 23.1936,
    }).success).toBe(false);
    expect(directionsBodySchema.safeParse({
      originLat: '23.1317',
      originLng: 79.8021,
      destinationLat: 23.1936,
      destinationLng: 79.9328,
    }).success).toBe(false);
  });
});

describe('fetchOsrmDirections', () => {
  it('maps an OSRM success response to the minimal result shape', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => OSRM_OK_BODY });
    const result = await fetchOsrmDirections(ORIGIN, DESTINATION);
    expect(result).toEqual({
      distanceMeters: 18310,
      durationSeconds: 1560,
      geometry: [
        [23.1317, 79.8021],
        [23.162, 79.867],
        [23.1936, 79.9328],
      ],
    });
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('router.project-osrm.org/route/v1/driving');
    expect(calledUrl).toContain(`${ORIGIN.lng},${ORIGIN.lat};${DESTINATION.lng},${DESTINATION.lat}`);
    expect(calledUrl).toContain('geometries=geojson');
  });

  it('returns null when OSRM reports a non-Ok code', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ code: 'NoRoute' }) });
    expect(await fetchOsrmDirections(ORIGIN, DESTINATION)).toBeNull();
  });

  it('returns null when the HTTP response is not ok', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    expect(await fetchOsrmDirections(ORIGIN, DESTINATION)).toBeNull();
  });

  it('returns null when the upstream request fails (timeout/network)', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    expect(await fetchOsrmDirections(ORIGIN, DESTINATION)).toBeNull();
  });

  it('returns null when OSRM payload is malformed', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: -1, duration: 0 }] }),
    });
    expect(await fetchOsrmDirections(ORIGIN, DESTINATION)).toBeNull();
  });
});

describe('directions controller', () => {
  const VALID_BODY = {
    originLat: ORIGIN.lat,
    originLng: ORIGIN.lng,
    destinationLat: DESTINATION.lat,
    destinationLng: DESTINATION.lng,
  };

  function runController(body: Record<string, unknown>) {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { body } as any;
    directionsController.driving(req as any, res as any, next as any);
    const settled = new Promise<void>((resolve) => setImmediate(resolve));
    return { settled, next, res };
  }

  it('returns the proxied OSRM result on success', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => OSRM_OK_BODY });
    const { settled, res } = runController(VALID_BODY);
    await settled;
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        distanceMeters: 18310,
        durationSeconds: 1560,
        geometry: [
          [23.1317, 79.8021],
          [23.162, 79.867],
          [23.1936, 79.9328],
        ],
        provider: 'osrm',
      },
      message: 'Success',
    });
  });

  it('errors with 502 when OSRM is unavailable', async () => {
    fetchSpy.mockRejectedValue(new Error('down'));
    const { settled, next, res } = runController(VALID_BODY);
    await settled;
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 502 }));
  });
});
