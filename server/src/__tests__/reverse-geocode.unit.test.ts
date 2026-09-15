import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('axios', () => ({ default: { get: getMock } }));

vi.mock('../../src/config/env', () => ({
  env: { googleMapsApiKey: '' },
}));

import { reverseGeocodeToCity, reverseGeocodeCandidates, primaryCandidateCity } from '../../src/shared/utils/reverseGeocode';
import { candidateCityKeys } from '../../src/shared/utils/cityIdentity';
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

describe('reverseGeocodeCandidates — district-aware extraction', () => {
  beforeEach(() => {
    getMock.mockReset();
    (env as any).googleMapsApiKey = '';
    vi.useRealTimers();
  });

  it('returns null for non-finite coordinates', async () => {
    await expect(reverseGeocodeCandidates(NaN, LNG)).resolves.toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('OSM town → settlement candidate; state_district → district candidate (Panagar case)', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { town: 'Panagar', county: 'Panagar Tahsil', state_district: 'Jabalpur', state: 'Madhya Pradesh' } },
    });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toEqual({
      settlement: 'Panagar',
      district: 'Jabalpur',
      state: 'Madhya Pradesh',
    });
  });

  it('OSM city + same district dedupes to one key (exact Jabalpur case)', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { city: 'Jabalpur', county: 'Jabalpur', state_district: 'Jabalpur' } },
    });

    const candidates = await reverseGeocodeCandidates(LAT, LNG);
    expect(candidates).toEqual({ settlement: 'Jabalpur', district: 'Jabalpur', state: null });
    expect(candidateCityKeys(candidates!)).toEqual(['jabalpur']);
    expect(primaryCandidateCity(candidates!)).toBe('Jabalpur');
  });

  it('OSM village → settlement; district separate (Bhedaghat/Patan case)', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { village: 'Bhedaghat', county: 'Jabalpur Tahsil', state_district: 'Jabalpur' } },
    });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toEqual({
      settlement: 'Bhedaghat',
      district: 'Jabalpur',
      state: null,
    });
  });

  it('Google locality → settlement; admin_area_level_2 → district; state NEVER used as district', async () => {
    (env as any).googleMapsApiKey = 'test-key';
    getMock.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'OK',
        results: [{
          address_components: [
            { long_name: 'Panagar', short_name: 'Panagar', types: ['locality'] },
            { long_name: 'Jabalpur', short_name: 'Jabalpur', types: ['administrative_area_level_2'] },
            { long_name: 'Madhya Pradesh', short_name: 'MP', types: ['administrative_area_level_1'] },
          ],
        }],
      },
    });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toEqual({
      settlement: 'Panagar',
      district: 'Jabalpur',
      state: 'Madhya Pradesh',
    });
  });

  it('Google with only locality yields settlement and no district', async () => {
    (env as any).googleMapsApiKey = 'test-key';
    getMock.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'OK',
        results: [{
          address_components: [{ long_name: 'Jabalpur', short_name: 'Jabalpur', types: ['locality'] }],
        }],
      },
    });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toEqual({
      settlement: 'Jabalpur',
      district: null,
      state: null,
    });
  });

  it('fallback to OSM when Google throws (candidates path)', async () => {
    (env as any).googleMapsApiKey = 'test-key';
    getMock
      .mockRejectedValueOnce(new Error('google down'))
      .mockResolvedValueOnce({
        status: 200,
        data: { address: { town: 'Panagar', county: 'Panagar Tahsil', state_district: 'Jabalpur' } },
      });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toEqual({
      settlement: 'Panagar',
      district: 'Jabalpur',
      state: null,
    });
  });

  it('district-only OSM (no settlement field) still produces the district candidate', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { county: 'Ranjhi Tahsil', state_district: 'Jabalpur', state: 'Madhya Pradesh' } },
    });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toEqual({
      settlement: null,
      district: 'Jabalpur',
      state: 'Madhya Pradesh',
    });
  });

  it('county-only OSM → no candidates (never guesses a tehsil as a district)', async () => {
    getMock.mockResolvedValueOnce({
      status: 200,
      data: { address: { county: 'Some County', state: 'Some State' } },
    });

    await expect(reverseGeocodeCandidates(LAT, LNG)).resolves.toBeNull();
  });

  it('retries OSM on 2xx challenge page and resolves candidates on a later attempt', async () => {
    vi.useFakeTimers();
    getMock
      .mockResolvedValueOnce({ status: 200, data: '<html><body>challenge</body></html>' })
      .mockResolvedValueOnce({
        status: 200,
        data: { address: { town: 'Panagar', county: 'Panagar Tahsil', state_district: 'Jabalpur' } },
      });

    const pending = reverseGeocodeCandidates(LAT, LNG);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toEqual({ settlement: 'Panagar', district: 'Jabalpur', state: null });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('uses BigDataCloud last resort for a settlement candidate only (never a district guess)', async () => {
    vi.useFakeTimers();
    getMock
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ status: 200, data: { city: 'Bhopal', principalSubdivision: 'Madhya Pradesh' } });

    const pending = reverseGeocodeCandidates(LAT, LNG);
    await vi.advanceTimersByTimeAsync(6000);
    await expect(pending).resolves.toEqual({ settlement: 'Bhopal', district: null, state: 'Madhya Pradesh' });
    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it('fails closed to null when every provider is exhausted', async () => {
    vi.useFakeTimers();
    getMock
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockResolvedValueOnce({ status: 200, data: {} });

    const pending = reverseGeocodeCandidates(LAT, LNG);
    await vi.advanceTimersByTimeAsync(6000);
    await expect(pending).resolves.toBeNull();
  });
});

describe('candidateCityKeys — deterministic ordering & dedup', () => {
  it('district-first ordering (district is authoritative; settlement is fallback)', () => {
    expect(candidateCityKeys({ settlement: 'Panagar', district: 'Jabalpur' })).toEqual(['jabalpur', 'panagar']);
    expect(candidateCityKeys({ settlement: 'Patan', district: 'Jabalpur' })).toEqual(['jabalpur', 'patan']);
  });

  it('dedupes identical keys', () => {
    expect(candidateCityKeys({ settlement: 'Jabalpur', district: 'Jabalpur' })).toEqual(['jabalpur']);
    expect(candidateCityKeys({ settlement: 'New Delhi', district: 'Delhi' })).toEqual(['delhi']);
  });

  it('null settlement keeps district', () => {
    expect(candidateCityKeys({ settlement: null, district: 'Jabalpur' })).toEqual(['jabalpur']);
  });

  it('handles suffix normalization (District / Municipal Corporation / City)', () => {
    expect(candidateCityKeys({ settlement: null, district: 'Jabalpur District' })).toEqual(['jabalpur']);
    expect(candidateCityKeys({ settlement: 'Kolkata', district: null })).toEqual(['kolkata']);
  });

  it('aliases OSM "Gurgaon" to the stored "Gurugram" hunt key', () => {
    // OSM returns settlement "Gurgaon" with no district; the store hunt key is
    // 'gurugram' — the alias bridges the provider spelling to the hunt.
    expect(candidateCityKeys({ settlement: 'Gurgaon', district: null })).toEqual(['gurugram']);
    expect(candidateCityKeys({ settlement: 'Gurugram', district: null })).toEqual(['gurugram']);
    expect(candidateCityKeys({ settlement: null, district: 'Gurgaon' })).toEqual(['gurugram']);
  });

  it('aliases OSM Sahibzada Ajit Singh Nagar / Mohali to the stored SAS Nagar hunt key', () => {
    expect(candidateCityKeys({ settlement: 'Mohali', district: 'Sahibzada Ajit Singh Nagar' })).toEqual([
      'sahibzada ajit singh nagar sas nagar',
    ]);
    expect(candidateCityKeys({ settlement: 'Mohali', district: null })).toEqual([
      'sahibzada ajit singh nagar sas nagar',
    ]);
  });

  it('aliases OSM Baloda Bazar / Balodabazar to the stored Balodabazar Bhatapara hunt key', () => {
    expect(candidateCityKeys({ settlement: 'Baloda Bazar', district: 'Baloda Bazar' })).toEqual([
      'balodabazar bhatapara',
    ]);
    expect(candidateCityKeys({ settlement: 'Balodabazar', district: null })).toEqual(['balodabazar bhatapara']);
  });
});