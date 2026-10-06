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
import { eventKeys, type EventListFilters } from './queryKeys';

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

/** Home / discovery strip. Fails soft: an empty strip must not break Home. */
export function useFeaturedEvents(limit = 6) {
  const query = useQuery({
    queryKey: eventKeys.featured(limit),
    queryFn: async () => {
      const res = await eventsApi.featured(limit);
      return res.data ?? [];
    },
    staleTime: 5 * 60_000,
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