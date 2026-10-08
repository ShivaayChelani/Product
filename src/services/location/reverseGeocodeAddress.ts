/**
 * Reverse geocoding for the Add Event location picker.
 *
 * Split from `resolveCityFromGps` because the form needs three things the map
 * does not: a street-level `address` (zoom 14), plus city and state normalised
 * to the Indian-state vocabulary the server stores. `matchIndianState` and the
 * alias table were lifted from AddHiddenGemScreen, which now imports them from
 * here so there is exactly one copy of the mapping.
 *
 * Failures are non-fatal: the picker still lets the submitter type the address
 * by hand, so every rejection resolves to an empty string rather than throwing.
 */
const NOMINATIM_HEADERS = { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' };

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Puducherry',
] as const;

export const STATE_ALIASES: Record<string, string> = {
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  delhi: 'Delhi',
  pondicherry: 'Puducherry',
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
  // ISO 3166-2 codes from Nominatim
  'in-ap': 'Andhra Pradesh',
  'in-ar': 'Arunachal Pradesh',
  'in-as': 'Assam',
  'in-br': 'Bihar',
  'in-ct': 'Chhattisgarh',
  'in-ga': 'Goa',
  'in-gj': 'Gujarat',
  'in-hr': 'Haryana',
  'in-hp': 'Himachal Pradesh',
  'in-jh': 'Jharkhand',
  'in-ka': 'Karnataka',
  'in-kl': 'Kerala',
  'in-mp': 'Madhya Pradesh',
  'in-mh': 'Maharashtra',
  'in-mn': 'Manipur',
  'in-ml': 'Meghalaya',
  'in-mz': 'Mizoram',
  'in-nl': 'Nagaland',
  'in-or': 'Odisha',
  'in-pb': 'Punjab',
  'in-rj': 'Rajasthan',
  'in-sk': 'Sikkim',
  'in-tn': 'Tamil Nadu',
  'in-tg': 'Telangana',
  'in-tr': 'Tripura',
  'in-up': 'Uttar Pradesh',
  'in-ut': 'Uttarakhand',
  'in-wb': 'West Bengal',
  'in-dl': 'Delhi',
  'in-py': 'Puducherry',
};

function normalizeStateKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^state of\s+/i, '')
    .replace(/\s+/g, ' ');
}

/** Best-effort match of Nominatim state output onto the canonical state list. */
export function matchIndianState(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const n = normalizeStateKey(raw);
    if (STATE_ALIASES[n]) return STATE_ALIASES[n];
    const exact = INDIAN_STATES.find(s => s.toLowerCase() === n);
    if (exact) return exact;
    const partial = INDIAN_STATES.find(
      s => n.includes(s.toLowerCase()) || s.toLowerCase().includes(n),
    );
    if (partial) return partial;
  }
  return '';
}

export type GeocodedAddress = {
  /** Full postal line when Nominatim returned one; never longer than 500 chars. */
  address: string;
  city: string;
  state: string;
};

type NominatimAddress = {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  'ISO3166-2-lvl4'?: string;
  'ISO3166-2-lvl3'?: string;
  region?: string;
};

function pickCity(addr: NominatimAddress): string {
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.suburb ||
    addr.county ||
    addr.state_district ||
    ''
  ).trim();
}

function buildAddressLine(addr: NominatimAddress, city: string, state: string): string {
  const street = [addr.house_number, addr.road].filter(Boolean).join(' ').trim();
  const locality = [addr.neighbourhood, addr.quarter, addr.suburb, city]
    .filter(Boolean)
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(', ');
  const parts = [street, locality, state].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return [city, state].filter(Boolean).join(', ');
}

/**
 * Reverse a coordinate into the three fields the event form stores.
 * Never throws: an unreachable geocoder yields empty strings the user can fill.
 */
export async function reverseGeocodeEventAddress(
  lat: number,
  lng: number,
): Promise<GeocodedAddress> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: NOMINATIM_HEADERS },
    );
    if (!res.ok) return { address: '', city: '', state: '' };
    const data = await res.json();
    const addr = (data?.address || {}) as NominatimAddress;
    const city = pickCity(addr);
    const state = matchIndianState(addr.state, addr['ISO3166-2-lvl4'], addr['ISO3166-2-lvl3'], addr.region);
    return {
      address: buildAddressLine(addr, city, state).slice(0, 500),
      city: city.slice(0, 100),
      state: state.slice(0, 100),
    };
  } catch {
    return { address: '', city: '', state: '' };
  }
}
