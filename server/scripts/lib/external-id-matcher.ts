import { nameSimilarityScore, normalizeForMatch } from '../../src/shared/utils/canonicalText';
import { haversineDistance } from '../../src/shared/utils/geo';
import { sleep } from './wikidata-client';

const USER_AGENT = 'PalSafar-ExternalIdResolution/1.0 (https://palsafar.com; ops@palsafar.local)';

export const LINK_THRESHOLD = 0.86;
export const REVIEW_THRESHOLD = 0.72;

export type ExternalIdCandidate = {
  source: 'wikidata' | 'osm';
  externalId: string;
  label: string;
  lat?: number;
  lng?: number;
  sourceUri: string;
};

export type MatchResult = {
  candidate: ExternalIdCandidate;
  confidence: number;
  nameScore: number;
  distanceM: number;
  stateMatch: boolean;
  action: 'LINK' | 'REVIEW' | 'REJECT';
};

export function scoreExternalIdMatch(input: {
  placeName: string;
  placeAliases?: string[];
  placeLat?: number | null;
  placeLng?: number | null;
  placeState?: string | null;
  candidate: ExternalIdCandidate;
}): MatchResult {
  const { placeName, placeAliases = [], placeLat, placeLng, placeState, candidate } = input;
  let nameScore = nameSimilarityScore(placeName, candidate.label);
  for (const alias of placeAliases) {
    nameScore = Math.max(nameScore, nameSimilarityScore(alias, candidate.label));
  }

  let distanceM = Number.POSITIVE_INFINITY;
  if (
    Number.isFinite(placeLat) && Number.isFinite(placeLng)
    && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)
  ) {
    distanceM = haversineDistance(placeLat!, placeLng!, candidate.lat!, candidate.lng!);
  }

  const stateMatch = !placeState || !candidate.label
    || normalizeForMatch(placeState).length < 2
    || candidate.label.toLowerCase().includes(normalizeForMatch(placeState));

  let confidence = nameScore;
  if (Number.isFinite(distanceM)) {
    if (distanceM < 200) confidence += 0.1;
    else if (distanceM < 500) confidence += 0.08;
    else if (distanceM < 1200) confidence += 0.04;
    else if (distanceM > 10000) confidence -= 0.35;
    else if (distanceM > 5000) confidence -= 0.25;
    else if (distanceM > 2000) confidence -= 0.15;
  }
  if (stateMatch) confidence += 0.02;
  if (nameScore >= 0.99 && Number.isFinite(distanceM) && distanceM < 300) {
    confidence = Math.max(confidence, 0.95);
  }
  // Coordinates available: never link on name alone when candidate is far away
  if (Number.isFinite(distanceM) && distanceM > 3000 && nameScore < 0.99) {
    confidence = Math.min(confidence, LINK_THRESHOLD - 0.01);
  }
  if (Number.isFinite(distanceM) && distanceM > 10000) {
    confidence = Math.min(confidence, REVIEW_THRESHOLD - 0.01);
  }
  if (
    Number.isFinite(placeLat) && Number.isFinite(placeLng)
    && (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng))
  ) {
    confidence = Math.min(confidence, REVIEW_THRESHOLD - 0.01);
  }

  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  let action: MatchResult['action'] = 'REJECT';
  if (confidence >= LINK_THRESHOLD) action = 'LINK';
  else if (confidence >= REVIEW_THRESHOLD) action = 'REVIEW';

  return {
    candidate,
    confidence,
    nameScore,
    distanceM: Number.isFinite(distanceM) ? Math.round(distanceM) : -1,
    stateMatch,
    action,
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export async function searchWikidataCandidates(name: string, limit = 5): Promise<ExternalIdCandidate[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: name.trim(),
    language: 'en',
    limit: String(limit),
    format: 'json',
  });
  const json = await fetchJson<{
    search?: { id?: string; label?: string; description?: string }[];
  }>(`https://www.wikidata.org/w/api.php?${params}`);
  const hits = json?.search?.filter((h) => h.id?.startsWith('Q')) || [];
  if (!hits.length) return [];

  const ids = hits.map((h) => h.id!).join('|');
  const entityParams = new URLSearchParams({
    action: 'wbgetentities',
    ids,
    props: 'claims|labels',
    languages: 'en',
    format: 'json',
  });
  await sleep(300);
  const entities = await fetchJson<{
    entities?: Record<string, {
      labels?: { en?: { value?: string } };
      claims?: { P625?: { mainsnak?: { datavalue?: { value?: { latitude?: number; longitude?: number } } } }[] };
    }>;
  }>(`https://www.wikidata.org/w/api.php?${entityParams}`);

  const out: ExternalIdCandidate[] = [];
  for (const hit of hits) {
    const qid = hit.id!;
    const entity = entities?.entities?.[qid];
    const label = entity?.labels?.en?.value?.trim() || hit.label?.trim() || qid;
    const coord = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    out.push({
      source: 'wikidata',
      externalId: `wikidata:${qid}`,
      label,
      lat: coord?.latitude,
      lng: coord?.longitude,
      sourceUri: `https://www.wikidata.org/wiki/${qid}`,
    });
  }
  return out;
}

let lastNominatimSearchAt = 0;

export async function searchOsmCandidates(
  name: string,
  lat: number,
  lng: number,
  limit = 5,
): Promise<ExternalIdCandidate[]> {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastNominatimSearchAt));
  if (wait > 0) await sleep(wait);
  lastNominatimSearchAt = Date.now();

  const params = new URLSearchParams({
    q: name.trim(),
    format: 'json',
    limit: String(limit),
    countrycodes: 'in',
    lat: String(lat),
    lon: String(lng),
  });
  const hits = await fetchJson<{
    osm_type?: string;
    osm_id?: number;
    display_name?: string;
    lat?: string;
    lon?: string;
    name?: string;
  }[]>(`https://nominatim.openstreetmap.org/search?${params}`);

  if (!Array.isArray(hits)) return [];

  return hits
    .filter((h) => h.osm_type && h.osm_id)
    .map((h) => {
      const type = h.osm_type!.toLowerCase();
      const osmType = type === 'node' || type === 'way' || type === 'relation' ? type : 'node';
      return {
        source: 'osm' as const,
        externalId: `osm:${osmType}:${h.osm_id}`,
        label: h.name?.trim() || h.display_name?.split(',')[0]?.trim() || name,
        lat: h.lat ? parseFloat(h.lat) : undefined,
        lng: h.lon ? parseFloat(h.lon) : undefined,
        sourceUri: `https://www.openstreetmap.org/${osmType}/${h.osm_id}`,
      };
    });
}

export function pickBestMatch(
  placeName: string,
  placeAliases: string[],
  placeLat: number | null | undefined,
  placeLng: number | null | undefined,
  placeState: string | null | undefined,
  candidates: ExternalIdCandidate[],
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const candidate of candidates) {
    const scored = scoreExternalIdMatch({
      placeName,
      placeAliases,
      placeLat,
      placeLng,
      placeState,
      candidate,
    });
    if (scored.action === 'REJECT') continue;
    if (!best || scored.confidence > best.confidence) best = scored;
    else if (
      scored.confidence === best.confidence
      && scored.candidate.source === 'wikidata'
      && best.candidate.source === 'osm'
    ) {
      best = scored;
    }
  }
  return best;
}
