import fs from 'fs';
import path from 'path';
import { isReliableUserPosition } from '../services/location/distance';
import { resolveCityFromGps } from '../services/location/reverseGeocode';

describe('Home location and weather inputs', () => {
  it('rejects cached coordinates that are stale or too coarse for locality display', () => {
    const now = Date.now();
    expect(isReliableUserPosition({
      latitude: 23.17,
      longitude: 79.93,
      accuracy: 30,
      timestamp: now - 60_000,
    }, now)).toBe(true);
    expect(isReliableUserPosition({
      latitude: 23.17,
      longitude: 79.93,
      accuracy: 30,
      timestamp: now - 6 * 60_000,
    }, now)).toBe(false);
    expect(isReliableUserPosition({
      latitude: 23.17,
      longitude: 79.93,
      accuracy: 800,
      timestamp: now,
    }, now)).toBe(false);
  });

  it('prefers a returned municipality over a broad county result', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        address: {
          county: 'Incorrect District',
          municipality: 'Correct Locality',
          state: 'Madhya Pradesh',
        },
      }),
    } as Response);

    try {
      const result = await resolveCityFromGps(26.12345, 81.23456);
      expect(result?.city).toBe('Correct Locality');
      expect(result?.label).toBe('Correct Locality, Madhya Pradesh');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('uses the shared locality resolver and rejects unreliable positions before requesting weather', () => {
    const home = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.tsx'), 'utf8');
    const location = fs.readFileSync(path.join(__dirname, '../context/LocationContext.tsx'), 'utf8');

    expect(home).toMatch(/const canUseHomeLocation = hasPermission \|\| !!devMockPosition/);
    expect(home).toMatch(/if \(!canUseHomeLocation \|\| !isReliableHomePosition\)/);
    expect(home).toMatch(/resolveCityFromGps\(position\.latitude, position\.longitude\)/);
    expect(home).toMatch(/if \(!r\.ok\) throw new Error\('Weather request failed'\)/);
    expect(home).toMatch(/let cancelled = false/);
    expect(home).toMatch(/return \(\) => \{ cancelled = true; \}/);
    expect(home).toMatch(/setWeather\(null\)/);
    expect(location).toMatch(/PermissionsAndroid\.check\(FINE_LOCATION\)/);
    expect(location).toMatch(/if \(nextAppState !== 'active'\) return/);
    expect(location).toMatch(/setPosition\(null\)/);
  });
});
