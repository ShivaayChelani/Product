import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('axios', () => ({ default: { get: getMock } }));

vi.mock('../../src/config/env', () => ({
  env: { googleMapsApiKey: '' },
}));

import { reverseGeocodeToCity } from '../../src/shared/utils/reverseGeocode';
import { env } from '../../src/config/env';

const LAT = 23.16;
const LNG = 79.94;

afterEach(() => {
  vi.useRealTimers();
});

describe('reverseGeocodeToCity', () => {
  beforeEach(() => {
    getMock.mockReset();
    (env as any).googleMapsApiKey = '';
    vi.useRealTimers();
  });

  it('returns null for non-finite coordinates without contacting providers', async () => {
    await expect(reverseGeocodeToCity(NaN, LNG)).resolves.toBeNull();
    await expect(reverseGeocodeToCity(LAT, Infinity)).resolves.toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('resolves via Google Maps locality when a key is configured', async () => {
    (env as any).googleMapsApiKey = 'test-key';
    getMock.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'OK',
        results: [{ address_components: [{ long_name: 'Jabalpur', types: ['locality'] }] }],
      },
    });

    await expect(reverseGeocodeToCity(LAT, LNG)).resolves.toBe('Jabalpur');
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to OSM when Google Maps throws', async () => {
    (env as any).googleMapsApiKey = 'test-key';
    getMock
      .mockRejectedValueOnce(new Error('google down'))
      .mockResolvedValueOnce({ status: 200, data: { address: { city: 'Jabalpur' } } });

    await expect(reverseGeocodeToCity(LAT, LNG)).resolves.toBe('Jabalpur');
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('retries OSM on a 2xx response with no usable address (challenge page) and resolves on a later attempt', async () => {
    vi.useFakeTimers();
    getMock
      .mockResolvedValueOnce({ status: 200, data: '<html><body>challenge</body></html>' })
      .mockResolvedValueOnce({ status: 200, data: { address: { town: 'Jabalpur' } } });

    const pending = reverseGeocodeToCity(LAT, LNG);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe('Jabalpur');
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('retries OSM when the first attempt rejects and succeeds on the second', async () => {
    vi.useFakeTimers();
    getMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 200, data: { address: { city: 'Jabalpur' } } });

    const pending = reverseGeocodeToCity(LAT, LNG);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe('Jabalpur');
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('prefers city-level fields over county-level sub-regions', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { city: 'Jabalpur', county: 'Ranjhi Tahsil', state_district: 'Jabalpur' } },
    });

    await expect(reverseGeocodeToCity(LAT, LNG)).resolves.toBe('Jabalpur');
  });

  it('prefers the district (state_district) over a tehsil-level county when no settlement field exists', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { county: 'Ranjhi Tahsil', state_district: 'Jabalpur', state: 'Madhya Pradesh' } },
    });

    await expect(reverseGeocodeToCity(LAT, LNG)).resolves.toBe('Jabalpur');
  });

  it('still uses county when neither state_district nor settlement fields exist (rural fallback)', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { county: 'Some County', state: 'Some State' } },
    });

    await expect(reverseGeocodeToCity(LAT, LNG)).resolves.toBe('Some County');
  });

  it('uses the keyless fallback provider after all OSM attempts fail', async () => {
    vi.useFakeTimers();
    getMock
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ status: 200, data: { city: 'Jabalpur' } });

    const pending = reverseGeocodeToCity(LAT, LNG);
    await vi.advanceTimersByTimeAsync(6000);
    await expect(pending).resolves.toBe('Jabalpur');
    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it('fails closed to null when every provider is exhausted', async () => {
    (env as any).googleMapsApiKey = 'test-key';
    vi.useFakeTimers();
    getMock
      .mockRejectedValueOnce(new Error('google'))
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('fb'))
      .mockRejectedValueOnce(new Error('fb'));

    const pending = reverseGeocodeToCity(LAT, LNG);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toBeNull();
    expect(getMock).toHaveBeenCalledTimes(6);
  });

  it('strips administrative suffixes before canonicalization', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { city: 'Kolkata Municipal Corporation' } },
    });

    await expect(reverseGeocodeToCity(22.5726, 88.3639)).resolves.toBe('Kolkata');
  });
});