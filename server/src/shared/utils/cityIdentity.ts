/**
 * Canonical city identity for the Treasure Hunt feature.
 *
 * GPS providers (Google / OSM / Excel) spell cities differently
 * ("New Delhi" vs "Delhi", "Kolkata" vs "Calcutta", "  Kolkata  " vs "Kolkata",
 * "Delhi National Capital Territory" vs "Delhi", ...). Stored riddles carry
 * whatever string the admin typed. A single normalized comparison key lets
 * us match a resolved GPS city to stored riddles across all those spellings
 * without fabricating a city (we NEVER guess a city from a radius).
 */

const SUFFIX_PATTERN = new RegExp(
  '\\b(?:municipal corporation|municipality|municipal|corporation|corp\\.?|district|' +
  'city municipal|city|urban|rural|greater|metro|metropolitan|capital|national|' +
  'territory|administration|government|union|ww2|streets?)\\b',
  'gi',
);

/** Historical / common aliases → canonical identity key. */
const CITY_ALIASES: Record<string, string> = {
  calcutta: 'kolkata',
  'new delhi': 'delhi',
  bombay: 'mumbai',
  bangalore: 'bengaluru',
  madras: 'chennai',
  trivandrum: 'thiruvananthapuram',
  cochin: 'kochi',
  mysore: 'mysuru',
  pondicherry: 'puducherry',
  baroda: 'vadodara',
  poona: 'pune',
};

/** Preferred display spelling for known canonical keys. */
const CANONICAL_DISPLAY: Record<string, string> = {
  kolkata: 'Kolkata',
  delhi: 'Delhi',
  mumbai: 'Mumbai',
  bengaluru: 'Bengaluru',
  chennai: 'Chennai',
  hyderabad: 'Hyderabad',
  pune: 'Pune',
  ahmedabad: 'Ahmedabad',
  varanasi: 'Varanasi',
  jaipur: 'Jaipur',
  bhopal: 'Bhopal',
  indore: 'Indore',
};

function titleCase(key: string): string {
  return key
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Reduces ANY city spelling to a stable identity key.
 * Never throws — unknown spellings fall back to a best-effort ASCII key.
 */
export function canonicalCityKey(city: string): string {
  if (!city) return '';
  const cleaned = String(city)
    .toLowerCase()
    .replace(SUFFIX_PATTERN, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return CITY_ALIASES[cleaned] || cleaned;
}

/** Preferred, human-friendly spelling for a city (for display + storage). */
export function cityDisplayName(city: string): string {
  if (!city) return '';
  const key = canonicalCityKey(city);
  return CANONICAL_DISPLAY[key] || titleCase(key);
}

/** Case/alias/suffix-tolerant equality used for every city gate. */
export function cityKeyEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  return canonicalCityKey(a) === canonicalCityKey(b);
}