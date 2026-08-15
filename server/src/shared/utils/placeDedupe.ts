import { haversineDistance } from './geo';

/** Normalizes a place name for duplicate detection (case/punctuation-insensitive). */
export function normalizePlaceName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Words that describe what a place is rather than which place it is, so they
 * carry no weight when deciding whether two rows are the same spot.
 */
const GENERIC_NAME_TOKENS = new Set([
  'the', 'and', 'of', 'at', 'in', 'near', 'shri', 'sri', 'jee', 'ji',
  'temple', 'mandir', 'mandira', 'devi', 'dham', 'math', 'mata',
  'falls', 'fall', 'waterfall', 'waterfalls', 'jharna',
  'lake', 'dam', 'sagar', 'talab', 'ghat', 'river',
  'fort', 'qila', 'mahal', 'palace', 'museum', 'park', 'garden', 'reserve',
  'view', 'viewpoint', 'point', 'spot', 'city', 'road', 'marg',
  'gurudwara', 'sahib', 'masjid', 'church', 'statue', 'monument',
]);

/** Same-name rows apart by more than this are treated as different places. */
const NEAR_DUPLICATE_KM = 0.35;

function distinctiveTokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((t) => t && !GENERIC_NAME_TOKENS.has(t)));
}

function isSubsetOf(inner: Set<string>, outer: Set<string>): boolean {
  for (const t of inner) if (!outer.has(t)) return false;
  return true;
}

/**
 * True when two rows a few hundred metres apart are clearly the same landmark
 * written differently — "Dhuandhar Falls" vs "Bhedaghat and Dhuandhar Falls",
 * or "Gwarighat" vs "Gwarighat Gurudwara". Requires one name's distinctive
 * words to fully contain the other's, so neighbouring but genuinely different
 * attractions (Bhedaghat Ropeway vs Bhedaghat Marble Rocks) stay separate.
 */
function isSameLandmark(keyA: string, keyB: string, distanceKm: number): boolean {
  if (distanceKm >= NEAR_DUPLICATE_KM) return false;
  const a = distinctiveTokens(keyA);
  const b = distinctiveTokens(keyB);
  if (!a.size || !b.size) return false;
  return isSubsetOf(a, b) || isSubsetOf(b, a);
}

/**
 * Collapses places that represent the same physical location but exist as
 * separate DB rows (duplicate imports with distinct slugs/ids).
 */
export function dedupePlacesByLocation<T extends {
  id?: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
}>(
  places: T[],
  /** Default 1km — catches OSM/Wikimedia re-imports with slightly different coords/city labels. */
  radiusKm = 1.0,
): T[] {
  const groups: { key: string; lat: number; lng: number; items: T[] }[] = [];

  for (const place of places) {
    if (place.latitude === null || place.longitude === null) continue;
    const key = normalizePlaceName(place.name);
    const match = groups.find((g) => {
      const gapKm = haversineDistance(
        g.lat, g.lng, place.latitude as number, place.longitude as number,
      ) / 1000;
      if (g.key === key) return gapKm < radiusKm;
      return isSameLandmark(g.key, key, gapKm);
    });
    if (match) {
      match.items.push(place);
    } else {
      groups.push({ key, lat: place.latitude, lng: place.longitude, items: [place] });
    }
  }

  return groups.map((g) => g.items.reduce((best, cur) => ((cur.rating ?? 0) > (best.rating ?? 0) ? cur : best)));
}

export function dedupeByLocation<T extends {
  name: string;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
}>(places: T[]): T[] {
  return dedupePlacesByLocation(places);
}
