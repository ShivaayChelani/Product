/**
 * Community Events query keys.
 *
 * Events are the one feed that is reached from four surfaces (Home, Search,
 * the map layer and deep links), so the keys have to be stable and shareable:
 * list keys are per-filter, detail keys are per-id, and `all` invalidates the
 * whole domain.
 */
import type { EventType } from '../../services/api/events';

export type EventListFilters = {
  q: string;
  type: EventType | null;
  city: string | null;
  state: string | null;
  featuredOnly: boolean;
};

export const DEFAULT_EVENT_FILTERS: EventListFilters = {
  q: '',
  type: null,
  city: null,
  state: null,
  featuredOnly: false,
};

/** Canonical filter signature — order-independent because it is built field-wise. */
export function eventFilterKey(filters: EventListFilters): string {
  return [
    `q=${filters.q.trim().toLowerCase()}`,
    `type=${filters.type ?? 'all'}`,
    `city=${filters.city ?? 'all'}`,
    `state=${filters.state ?? 'all'}`,
    `featured=${filters.featuredOnly ? '1' : '0'}`,
  ].join('&');
}

export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: (filters: EventListFilters) => [...eventKeys.lists(), eventFilterKey(filters)] as const,
  featured: (limit: number) => [...eventKeys.all, 'featured', limit] as const,
  /**
   * Prefix for every Home-strip entry (limit + coordinates are appended by the
   * hook). Invalidate this to drop a stale "no events near you" answer after a
   * moderation change, without touching detail/list caches.
   */
  homeStrip: () => [...eventKeys.all, 'featured'] as const,
  details: () => [...eventKeys.all, 'detail'] as const,
  detail: (idOrSlug: string) => [...eventKeys.details(), idOrSlug] as const,
  /** The caller's own submissions (`GET /events?mine=true`) — auth-scoped, so
   *  it must never share a key with the public list. */
  mine: () => [...eventKeys.all, 'mine'] as const,
  /**
   * The map layer shares the viewport feed. The bbox is deliberately excluded
   * from the key so panning the map reuses one cache entry and refetches in the
   * background instead of growing the cache on every frame.
   */
  mapFeed: (typesKey: string, city: string | null, state: string | null, featuredOnly: boolean) =>
    [...eventKeys.all, 'map', typesKey, city ?? 'all', state ?? 'all', featuredOnly ? '1' : '0'] as const,
};