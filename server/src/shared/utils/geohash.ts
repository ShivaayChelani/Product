/** Minimal geohash encode + neighbor keys for spatial blocking (no external deps). */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision = 12): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = '';

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        idx = idx * 2 + 1;
        lngMin = mid;
      } else {
        idx = idx * 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = idx * 2 + 1;
        latMin = mid;
      } else {
        idx = idx * 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

const NEIGHBOR_MAP: Record<string, [string, string]> = {
  n: ['p', 'r'],
  s: ['7', '5'],
  e: ['s', '6'],
  w: ['h', '4'],
};

const BORDER_MAP: Record<string, string> = {
  n: 'prxz',
  s: '028b',
  e: 'bcfguvyz',
  w: '0145hjnp',
};

function adjacentGeohash(hash: string, direction: 'n' | 's' | 'e' | 'w'): string | null {
  if (!hash) return null;
  const last = hash.slice(-1);
  let parent = hash.slice(0, -1);
  const type = hash.length % 2 === 0 ? 0 : 1;
  const border = BORDER_MAP[direction].charAt(type);
  if (border.indexOf(last) !== -1 && parent.length > 0) {
    parent = adjacentGeohash(parent, direction) ?? parent;
  }
  const [even, odd] = NEIGHBOR_MAP[direction];
  const base = hash.length % 2 === 0 ? even : odd;
  return parent + base;
}

export function geohashPrefix(lat: number, lng: number, precision: number): string {
  return encodeGeohash(lat, lng, precision).slice(0, precision);
}

/** Approximate center of a geohash prefix (for neighbor expansion). */
export function geohashPrefixCenter(prefix: string): { lat: number; lng: number } {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let evenBit = true;

  for (let i = 0; i < prefix.length; i++) {
    const cd = BASE32.indexOf(prefix.charAt(i));
    if (cd === -1) break;
    for (let bit = 4; bit >= 0; bit--) {
      const mask = 1 << bit;
      if (evenBit) {
        const mid = (lngMin + lngMax) / 2;
        if (cd & mask) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (cd & mask) latMin = mid;
        else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 };
}

/** Cell + 8 neighboring prefixes at `precision`. */
export function geohashBlockingPrefixes(lat: number, lng: number, precision: number): string[] {
  const center = encodeGeohash(lat, lng, Math.max(precision, 1)).slice(0, precision);
  const dirs: Array<'n' | 's' | 'e' | 'w'> = ['n', 's', 'e', 'w'];
  const set = new Set<string>([center]);
  for (const d of dirs) {
    const adj = adjacentGeohash(center, d);
    if (adj) set.add(adj.slice(0, precision));
  }
  const n = adjacentGeohash(center, 'n');
  const s = adjacentGeohash(center, 's');
  if (n) {
    set.add((adjacentGeohash(n, 'e') ?? n).slice(0, precision));
    set.add((adjacentGeohash(n, 'w') ?? n).slice(0, precision));
  }
  if (s) {
    set.add((adjacentGeohash(s, 'e') ?? s).slice(0, precision));
    set.add((adjacentGeohash(s, 'w') ?? s).slice(0, precision));
  }
  return [...set];
}
