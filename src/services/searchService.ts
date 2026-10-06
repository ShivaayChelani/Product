import { apiClient as api } from './api/client';
import type { EventType } from './api/events';

/**
 * A Community Event as returned by `GET /search/universal`.
 *
 * Deliberately NOT `CommunityEvent`: universal search returns a slimmed
 * projection (see `normalizedEvents` in server search.service.ts) and omits
 * moderation counts, the creator relation and the map marker group. Treat it as
 * a search row only — open `EventDetail` to get the full record.
 */
export interface UniversalSearchEvent {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  coverImage?: string | null;
  eventType?: EventType | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  placeId?: string | null;
  vendorId?: string | null;
}

export interface UniversalSearchResult {
  places: any[];
  vendors: any[];
  reels: any[];
  creators: any[];
  events: UniversalSearchEvent[];
  offers: any[];
  hiddenGems: any[];
  meta: {
    query: string;
    totalResults: number;
  };
}

export function normalizeUniversalSearchResults(response: unknown): UniversalSearchResult {
  const envelope = (response as { data?: unknown; success?: boolean }) ?? {};
  const unwrapped =
    envelope.success !== undefined && envelope.data !== undefined && envelope.data !== null
      ? envelope.data
      : envelope.data ?? response ?? {};

  const payload = (unwrapped as Record<string, unknown>) ?? {};
  const arr = (key: string) => (Array.isArray(payload[key]) ? (payload[key] as unknown[]) : []);

  const places = arr('places');
  const hiddenGems = arr('hiddenGems');
  const vendors = arr('vendors');
  const reels = arr('reels');
  const creators = arr('creators');
  const events = arr('events') as UniversalSearchEvent[];
  const offers = arr('offers');

  const rawMeta = payload.meta as UniversalSearchResult['meta'] | undefined;
  const counted =
    places.length +
    hiddenGems.length +
    vendors.length +
    reels.length +
    creators.length +
    events.length +
    offers.length;
  const totalResults =
    typeof rawMeta?.totalResults === 'number' && rawMeta.totalResults >= 0
      ? rawMeta.totalResults
      : counted;

  return {
    places,
    hiddenGems,
    vendors,
    reels,
    creators,
    events,
    offers,
    meta: {
      query: typeof rawMeta?.query === 'string' ? rawMeta.query : '',
      totalResults,
    },
  };
}

export async function searchUniversal(query: string, limit: number = 20): Promise<UniversalSearchResult> {
  const response = await api.get(`/search/universal?q=${encodeURIComponent(query)}&limit=${limit}`);
  return normalizeUniversalSearchResults(response.data ?? response);
}

export async function getTrendingSearches(): Promise<{keyword: string, count: number}[]> {
  const response = await api.get('/search/trending');
  return (response.data || response) as any;
}
