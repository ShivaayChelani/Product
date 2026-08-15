import { placeBelongsToDestination, isGenericDestination } from './destination';
import type { UniversalSearchResult } from '../services/searchService';

export type SearchMode = 'replace' | 'itinerary' | undefined;

export type SearchRenderableRow = {
  key: string;
  type: string;
  item: Record<string, unknown>;
  added: boolean;
  cityMismatch: boolean;
  actionLabel: string;
};

const PLACE_LIKE = new Set(['place', 'hidden gem', 'event']);

export function isPlaceLikeType(type: string): boolean {
  return PLACE_LIKE.has(type.toLowerCase());
}

const FILTER_TO_TYPE: Record<string, string> = {
  places: 'place',
  'hidden gems': 'hidden gem',
  vendors: 'vendor',
  offers: 'offer',
  events: 'event',
};

export function resultMatchesFilter(type: string, filter: string): boolean {
  if (filter === 'All') return true;
  const normalizedType = type.toLowerCase();
  const normalizedFilter = filter.toLowerCase();
  if (normalizedType === normalizedFilter) return true;
  const mapped = FILTER_TO_TYPE[normalizedFilter];
  return mapped ? normalizedType === mapped : false;
}

export function isCityFilterActive(
  mode: SearchMode,
  destination?: string,
): boolean {
  return Boolean(
    (mode === 'replace' || mode === 'itinerary') && destination && !isGenericDestination(destination),
  );
}

export function placeHasCityMismatch(
  item: { city?: string; state?: string; name?: string },
  destination: string | undefined,
  cityFilterActive: boolean,
): boolean {
  if (!cityFilterActive || !destination) return false;
  return !placeBelongsToDestination(item, destination);
}

/** True when an older in-flight search response must be discarded. */
export function shouldApplySearchResponse(latestGen: number, responseGen: number): boolean {
  return latestGen === responseGen;
}

function resolvePlaceId(item: Record<string, unknown>): string {
  return String(item.placeId || item.id || '');
}

type BuildRowsOptions = {
  mode?: SearchMode;
  destination?: string;
  excludePlaceIds?: string[];
  activeFilter?: string;
  itineraryPlacesOnly?: boolean;
};

function pushRow(
  rows: SearchRenderableRow[],
  type: string,
  item: Record<string, unknown>,
  opts: BuildRowsOptions,
  excluded: Set<string>,
  cityFilterActive: boolean,
) {
  const placeId = resolvePlaceId(item);
  const added = excluded.has(placeId);
  const cityMismatch = placeHasCityMismatch(item, opts.destination, cityFilterActive);
  const isPlaceLike = isPlaceLikeType(type);

  if (opts.itineraryPlacesOnly && (opts.mode === 'replace' || opts.mode === 'itinerary') && !isPlaceLike) {
    return;
  }

  if (opts.mode === 'replace' && cityFilterActive && isPlaceLike && cityMismatch) {
    return;
  }

  rows.push({
    key: `${type}-${placeId || item.slug || rows.length}`,
    type,
    item,
    added,
    cityMismatch,
    actionLabel: added ? '✓ Added' : 'Add',
  });
}

export function buildUniversalRenderableRows(
  results: UniversalSearchResult | null | undefined,
  options: BuildRowsOptions = {},
): SearchRenderableRow[] {
  if (!results) return [];

  const excluded = new Set(options.excludePlaceIds || []);
  const cityFilterActive = isCityFilterActive(options.mode, options.destination);
  const filter = options.activeFilter || 'All';
  const rows: SearchRenderableRow[] = [];

  const sections: Array<[string, unknown[] | undefined]> = [
    ['Place', results.places],
    ['Hidden Gem', results.hiddenGems],
    ['Reel', results.reels],
    ['Vendor', results.vendors],
    ['Offer', results.offers],
    ['Event', results.events],
    ['Creator', results.creators],
  ];

  for (const [type, items] of sections) {
    if (!items?.length || !resultMatchesFilter(type, filter)) continue;
    for (const raw of items) {
      pushRow(rows, type, raw as Record<string, unknown>, options, excluded, cityFilterActive);
    }
  }

  return rows;
}

export function buildNearbyRenderableRows(
  items: Array<Record<string, unknown>> | null | undefined,
  options: BuildRowsOptions = {},
): SearchRenderableRow[] {
  if (!items?.length) return [];

  const excluded = new Set(options.excludePlaceIds || []);
  const cityFilterActive = isCityFilterActive(options.mode, options.destination);
  const filter = options.activeFilter || 'All';
  if (!resultMatchesFilter('Place', filter)) return [];

  const rows: SearchRenderableRow[] = [];
  for (const item of items) {
    if (options.mode === 'replace' && cityFilterActive && placeHasCityMismatch(item, options.destination, cityFilterActive)) {
      continue;
    }
    const placeId = resolvePlaceId(item);
    const cityMismatch = placeHasCityMismatch(item, options.destination, cityFilterActive);
    rows.push({
      key: `Place-${placeId}`,
      type: 'Place',
      item,
      added: excluded.has(placeId),
      cityMismatch,
      actionLabel: excluded.has(placeId) ? '✓ Added' : 'Add',
    });
  }
  return rows;
}
