/**
 * Community Events data hooks.
 *
 * Three hooks, one per access shape, because the server paginates them
 * differently: the list is page-based, the detail is a single record, and
 * featured is a capped strip. Nothing here re-implements filtering — the
 * server owns visibility (APPROVED, not ended, parent place visible) so every
 * surface sees exactly the same set.
 */
import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { eventsApi, type CommunityEvent, type EventListQuery } from '../../services/api/events';
import { isValidLatLng } from '../../services/location/distance';
import { eventKeys, type EventListFilters } from './queryKeys';
import { eventLifecycle } from './eventFormat';

const LIST_PAGE_SIZE = 20;

/**
 * Maps UI filter state onto the server's exact query keys.
 *
 * Empty filters are omitted rather than sent blank: the schemas are optional
 * without defaults on most keys, so `city=` would be an empty-string equality
 * match instead of "no city filter".
 */
export function toEventListQuery(filters: EventListFilters, page: number): EventListQuery {
  const query: EventListQuery = { page, limit: LIST_PAGE_SIZE };
  const q = filters.q.trim();
  if (q) query.q = q;
  if (filters.type) query.types = filters.type;
  if (filters.city) query.city = filters.city;
  if (filters.state) query.state = filters.state;
  if (filters.featuredOnly) query.featuredOnly = 'true';
  return query;
}

/** Paged discovery feed with pull-to-refresh and load-more. */
export function useEventsList(filters: EventListFilters, options?: { enabled?: boolean }) {
  const query = useInfiniteQuery({
    queryKey: eventKeys.list(filters),
    enabled: options?.enabled !== false,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await eventsApi.list(toEventListQuery(filters, pageParam));
      return { events: res.data ?? [], pagination: res.pagination ?? null };
    },
    getNextPageParam: (lastPage, _all, lastPageParam) => {
      if (lastPage.pagination?.hasNext) return lastPageParam + 1;
      const count = lastPage.events?.length ?? 0;
      return count >= LIST_PAGE_SIZE ? lastPageParam + 1 : undefined;
    },
    staleTime: 60_000,
  });

  const events = useMemo(() => {
    const seen = new Set<string>();
    const rows: CommunityEvent[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const event of page.events ?? []) {
        // A moderation change can shift rows across pages; dedupe by id.
        if (!event?.id || seen.has(event.id)) continue;
        seen.add(event.id);
        rows.push(event);
      }
    }
    return rows;
  }, [query.data?.pages]);

  const total = query.data?.pages?.[0]?.pagination?.total ?? null;

  return {
    events,
    total,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    isError: query.isError,
    error: query.error,
    refresh: query.refetch,
    loadMore: query.fetchNextPage,
  };
}

/** Single event by cuid or slug. */
export function useEventDetail(eventIdOrSlug: string) {
  const id = (eventIdOrSlug || '').trim();

  const query = useQuery({
    queryKey: eventKeys.detail(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await eventsApi.getByIdOrSlug(id);
      return res.data;
    },
    // Deep links resolve once and stay put; an event's schedule does not move
    // often enough to justify refetching on every focus.
    staleTime: 5 * 60_000,
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });

  return { ...query, event: query.data ?? null };
}

/**
 * Home / discovery strip.
 *
 * The curated `/events/featured` feed is the first choice, but it only fills
 * up once an admin has flagged an event, and it is the *only* source Home ever
 * asked for — so a freshly approved event could never surface under "Events
 * Near You" and the section read as permanently empty. The strip therefore
 * degrades through the other two public feeds instead of failing closed:
 *
 *   1. `/events/featured`   — curated first, unchanged behaviour when it has rows
 *   2. `/events/nearby`     — radius search when we have a usable GPS fix
 *   3. `/events`            — plain APPROVED-and-not-ended list as the last resort
 *
 * Every source applies the same server-owned visibility predicate, so this
 * fallback chain cannot widen what the public may see; it only stops Home from
 * rendering an empty state while approved events exist. An error is surfaced
 * only when *every* source failed.
 */
export const HOME_EVENT_RADIUS_KM = 25;

export type HomeEventsLocation = {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
};

/** The three public event reads the strip may use, narrow for testability. */
export type HomeEventsSource = {
  featured: (limit: number) => Promise<{ data?: CommunityEvent[] | null }>;
  nearby: (query: {
    lat: number;
    lng: number;
    radiusKm: number;
    limit: number;
  }) => Promise<{ data?: CommunityEvent[] | null }>;
  list: (query: { limit: number }) => Promise<{ data?: CommunityEvent[] | null }>;
};

export type HomeEventsLoadOptions = {
  limit: number;
  location?: HomeEventsLocation | null;
};

function usableLocation(location: HomeEventsLocation | null | undefined) {
  if (!location) return null;
  const { latitude, longitude } = location;
  if (!isValidLatLng(latitude, longitude)) return null;
  return { latitude: latitude as number, longitude: longitude as number };
}

function dedupeById(rows: CommunityEvent[]): CommunityEvent[] {
  const seen = new Set<string>();
  const out: CommunityEvent[] = [];
  for (const row of rows) {
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function prioritizeUpcomingEvents(rows: CommunityEvent[]): CommunityEvent[] {
  const now = new Date();
  return rows
    .map((event, index) => ({
      event,
      index,
      priority: eventLifecycle(event, now) === 'UPCOMING' ? 0 : 1,
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ event }) => event);
}

/**
 * Ordered fallback across the three public feeds. Pure (no React, no network
 * client) so the eligibility chain can be asserted directly in tests.
 */
export async function loadHomeStripEvents(
  source: HomeEventsSource,
  { limit, location }: HomeEventsLoadOptions,
): Promise<CommunityEvent[]> {
  const coord = usableLocation(location);
  const attempts: Array<() => Promise<CommunityEvent[]>> = [
    async () => (await source.featured(limit)).data ?? [],
  ];
  if (coord) {
    attempts.push(async () => {
      const res = await source.nearby({
        lat: coord.latitude,
        lng: coord.longitude,
        radiusKm: HOME_EVENT_RADIUS_KM,
        limit,
      });
      // The strip renders one card; prefer upcoming events to ongoing ones,
      // preserving the nearby feed's distance order within each lifecycle.
      return prioritizeUpcomingEvents(res.data ?? []);
    });
  }
  attempts.push(async () => (await source.list({ limit })).data ?? []);

  const failures: unknown[] = [];
  for (const attempt of attempts) {
    try {
      const rows = dedupeById(await attempt());
      if (rows.length > 0) return rows.slice(0, limit);
    } catch (error) {
      failures.push(error);
    }
  }
  // A source that answered "nothing" is a real answer — only a strip where
  // every request failed deserves the error state.
  if (failures.length === attempts.length) throw failures[0];
  return [];
}

/**
 * Home strip feed. Fails soft: an empty strip must not break Home.
 *
 * The query key carries the coordinates so a late GPS fix refetches instead of
 * pinning the first (location-less) response for the whole stale window.
 */
export function useFeaturedEvents(limit = 6, location?: HomeEventsLocation | null) {
  const coord = usableLocation(location);

  const query = useQuery({
    queryKey: [...eventKeys.featured(limit), coord?.latitude ?? null, coord?.longitude ?? null],
    queryFn: () =>
      loadHomeStripEvents(eventsApi, {
        limit,
        location: coord ? { latitude: coord.latitude, longitude: coord.longitude } : null,
      }),
    // Home returns from other tabs constantly; a moderation change (a newly
    // approved event) must not sit behind a long stale window.
    staleTime: 60_000,
    retry: 1,
  });

  const events = query.data ?? [];
  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: query.refetch,
  };
}