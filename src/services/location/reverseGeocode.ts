export type ResolvedCity = {
  city: string;
  state: string;
  label: string;
};

let cityCache: { key: string; value: ResolvedCity; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function resolveCityFromGps(lat: number, lng: number): Promise<ResolvedCity | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cityCache && cityCache.key === key && Date.now() - cityCache.ts < CACHE_MS) {
    return cityCache.value;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' } },
    );
    if (!response.ok) throw new Error('Geocode failed');
    const data = await response.json();
    const addr = data.address || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.county ||
      addr.state_district ||
      '';
    const state = addr.state || '';
    if (!city && !state) return null;

    const value: ResolvedCity = {
      city: city || state,
      state,
      label: city && state ? `${city}, ${state}` : city || state,
    };
    cityCache = { key, value, ts: Date.now() };
    return value;
  } catch {
    return null;
  }
}

export function cityNameMatches(placeCity: string | undefined, resolved: ResolvedCity): boolean {
  const pc = (placeCity || '').trim().toLowerCase();
  const rc = resolved.city.trim().toLowerCase();
  if (!pc || !rc) return false;
  return pc === rc || pc.includes(rc) || rc.includes(pc);
}
