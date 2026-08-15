import { geohashPrefix } from '../../../shared/utils/geohash';

/** Compute geohash (precision 12) when coordinates are present. */
export function withPlaceGeohash<T extends { latitude?: number | null; longitude?: number | null }>(
  data: T,
): T & { geohash?: string } {
  const { latitude, longitude } = data;
  if (latitude == null || longitude == null) return data;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return data;
  return { ...data, geohash: geohashPrefix(latitude, longitude, 12) };
}

/** Spatial dedup key: normalized name + coords rounded to ~110 m. */
export function coordNameDedupKey(name: string, lat: number, lng: number, normalize: (s: string) => string): string {
  return `${normalize(name)}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

/** Extract Wikidata Q-id from OSM wikidata tag or shortDescription. */
export function extractWikidataQId(osmTags?: Record<string, unknown>, shortDescription?: string): string | null {
  const fromTag = osmTags?.wikidata ?? osmTags?.['wikidata:entity'];
  if (fromTag) {
    const q = String(fromTag).trim().toUpperCase();
    if (/^Q\d+$/.test(q)) return q;
  }
  const match = String(shortDescription || '').match(/wikidata:(Q\d+)/i);
  return match ? match[1].toUpperCase() : null;
}
