/**
 * Community Events API client.
 *
 * Contract source (server, do not drift):
 *   server/src/modules/events/events.routes.ts   — routes + middleware order
 *   server/src/modules/events/events.validation.ts — query/body schemas
 *   server/src/modules/events/events.helpers.ts    — `mapEventRow` projection
 *   server/src/modules/events/events.geo.service.ts — map / nearby / featured
 *
 * Public reads plus the owner-scoped create/update/delete. The router exposes
 * `/map`, `/nearby` and `/featured` BEFORE `/:idOrSlug`, so those three paths
 * are reserved and must never be appended to the detail path builder.
 */
import { apiClient, type StandardApiResponse } from './client';
import { API_CONFIG } from '../../config/api';

/** Mirrors the server `EventType` Prisma enum. */
export const EVENT_TYPES = [
  'FESTIVAL',
  'RELIGIOUS',
  'CULTURAL',
  'FAIR_MELA',
  'CONCERT',
  'EXHIBITION',
  'SPORTS',
  'FOOD',
  'COMMUNITY',
  'LOCAL',
  'OTHER',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Mirrors the server `EventStatus` Prisma enum. */
export const EVENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export type EventOrganizer = {
  id: string;
  name: string;
  avatar: string | null;
} | null;

/**
 * The public event projection (`mapEventRow`, `includeModerationFields: false`).
 *
 * Coordinates are `null` — never `0` — when the event has no position, so a
 * consumer must gate every map action on `hasCoordinates` rather than on
 * `latitude != null`.
 */
export type CommunityEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  eventType: EventType;
  status: EventStatus;
  /** ISO instant. */
  startDate: string;
  /** ISO instant. Always present on the server. */
  endDate: string;
  /** `HH:MM` wall-clock text or null. */
  startTime: string | null;
  endTime: string | null;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  coverImage: string | null;
  images: string[];
  isFeatured: boolean;
  isPast: boolean;
  placeId: string | null;
  placeName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  reelCount: number;
  reportCount: number;
  /**
   * Flyer facts. `mapEventRow` ships them to everyone (a listing nobody can
   * read the organiser/fee/teaser from is a listing nobody can attend), but
   * they stay optional here so a legacy payload without them still typechecks.
   */
  shortDescription?: string | null;
  organizerName?: string | null;
  organizerContact?: string | null;
  websiteUrl?: string | null;
  /** Rupees. `null` = not supplied; `0` = explicitly free. */
  entryFee?: number | null;
  createdBy: EventOrganizer;
  createdAt: string;
  updatedAt: string;
  legacyPlaceEventId: string | null;
  parentPlaceVisible: boolean;
};

/**
 * What `GET /events?mine=true` returns for rows the caller owns: the public
 * projection plus the moderation fields `mapEventRow` only reveals to the
 * owner or an admin. Never assume these exist on a public list row.
 */
export type OwnedCommunityEvent = CommunityEvent & {
  isOwner?: boolean;
  createdById?: string;
  approvedAt?: string | null;
  approvedBy?: { id: string; name: string } | null;
  rejectionReason?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  publishedAt?: string | null;
};

/** `/events/map` adds the server-side marker grouping. */
export type CommunityEventMapItem = CommunityEvent & {
  marker: { icon: string; label: string };
};

/** `/events/nearby` adds a true geodesic distance. */
export type CommunityEventNearbyItem = CommunityEvent & {
  distanceMeters: number;
};

export type EventMapMeta = {
  count: number;
  limit: number;
  truncated: boolean;
  bbox: { north: number; south: number; east: number; west: number };
  hasMore: boolean;
  nextCursor: string | null;
};

export type EventNearbyMeta = {
  count: number;
  radiusKm: number;
};

export type EventListQuery = {
  page?: number;
  limit?: number;
  /** Comma-separated EventType keys, as the server expects. */
  types?: string;
  city?: string;
  state?: string;
  q?: string;
  from?: string;
  to?: string;
  mine?: 'true' | 'false';
  featuredOnly?: 'true' | 'false';
};

export type EventMapQuery = {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom?: number;
  limit?: number;
  cursor?: string | null;
  types?: string;
  city?: string;
  state?: string;
  /** 'false' means "starts today or later"; an ongoing event stays visible. */
  includeOngoing?: 'true' | 'false';
  featuredOnly?: 'true' | 'false';
};

export type NearbyEventsQuery = {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
};

/**
 * Body for `POST /events` / `PATCH /events/:id`. Dates are the `YYYY-MM-DD`
 * strings the native date pickers produce; `entryFee` is rupees on the wire
 * (a blank string clears it, `0` means free). Coordinates stay `null` — the
 * server validates against Null-Island, never the client.
 */
export type CreateEventInput = {
  title: string;
  description?: string | null;
  eventType: EventType;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  coverImage?: string | null;
  images?: string[];
  linkedPlaceId?: string | null;
  linkedVendorId?: string | null;
  shortDescription?: string | null;
  organizerName?: string | null;
  organizerContact?: string | null;
  websiteUrl?: string | null;
  entryFee?: number | string | null;
};

export type UpdateEventInput = Partial<CreateEventInput>;

export type EventsListResponse = StandardApiResponse<CommunityEvent[]>;
export type EventDetailResponse = StandardApiResponse<CommunityEvent>;
export type EventMapResponse = StandardApiResponse<CommunityEventMapItem[]> & {
  meta?: EventMapMeta;
};
export type EventNearbyResponse = StandardApiResponse<CommunityEventNearbyItem[]> & {
  meta?: EventNearbyMeta;
};

/**
 * Builds a query string from defined values only.
 *
 * The server schemas are `.optional()` without `.default('')` on most keys, so
 * sending `city=` would be an empty-string equality match, not "no filter".
 */
function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * `GET /events` — public, APPROVED-and-not-ended events.
 *
 * Pagination is page-based and `limit` is capped at 100 server-side, so the
 * list must keep incrementing `page` rather than reusing the same request.
 */
async function list(query?: EventListQuery): Promise<EventsListResponse> {
  const qs = queryString({
    page: query?.page,
    limit: query?.limit,
    types: query?.types,
    city: query?.city,
    state: query?.state,
    q: query?.q,
    from: query?.from,
    to: query?.to,
    mine: query?.mine,
    featuredOnly: query?.featuredOnly,
  });
  return apiClient.get<CommunityEvent[]>(`${API_CONFIG.endpoints.events.list}${qs}`);
}

/**
 * `GET /events?mine=true` — the caller's own submissions.
 *
 * Requires auth (the server 401s without a viewer) and returns moderation
 * fields for rows the caller owns, so the screen can show PENDING / REJECTED
 * plus the admin's reason without a second request.
 */
async function listMine(limit = 50): Promise<StandardApiResponse<OwnedCommunityEvent[]>> {
  const qs = queryString({ page: 1, limit, mine: 'true' });
  return apiClient.get<OwnedCommunityEvent[]>(`${API_CONFIG.endpoints.events.list}${qs}`);
}

/**
 * `GET /events/featured` — curated strip.
 *
 * Same envelope as the detail endpoint (`{ success, data, message }`) but with
 * an array payload and no pagination, so it gets its own response type.
 */
async function featured(limit = 6): Promise<EventsListResponse> {
  const qs = queryString({ limit });
  return apiClient.get<CommunityEvent[]>(`${API_CONFIG.endpoints.events.featured}${qs}`);
}

/**
 * `GET /events/:idOrSlug` — accepts the cuid or the slug.
 *
 * The id is a single path segment; anything with a slash is rejected here so a
 * crafted id can never climb out of `/events/`.
 */
async function getByIdOrSlug(idOrSlug: string): Promise<EventDetailResponse> {
  const id = String(idOrSlug ?? '').trim();
  if (!id || id.includes('/') || id.includes('\\')) {
    const err = new Error('Event not found.') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return apiClient.get<CommunityEvent>(API_CONFIG.endpoints.events.byIdOrSlug(id));
}

/** `GET /events/map` — bbox feed with a keyset cursor. */
async function mapFeed(query: EventMapQuery): Promise<EventMapResponse> {
  const qs = queryString({
    north: query.north,
    south: query.south,
    east: query.east,
    west: query.west,
    zoom: query.zoom,
    limit: query.limit,
    cursor: query.cursor,
    types: query.types,
    city: query.city,
    state: query.state,
    includeOngoing: query.includeOngoing,
    featuredOnly: query.featuredOnly,
  });
  const res = await apiClient.get<CommunityEventMapItem[]>(`${API_CONFIG.endpoints.events.map}${qs}`);
  // `meta` is not on StandardApiResponse; carry it through for the cursor loop.
  return { ...res, meta: (res as { meta?: EventMapMeta }).meta };
}

/** `GET /events/nearby` — radius search ordered by real distance. */
async function nearby(query: NearbyEventsQuery): Promise<EventNearbyResponse> {
  const qs = queryString({
    lat: query.lat,
    lng: query.lng,
    radiusKm: query.radiusKm,
    limit: query.limit,
  });
  const res = await apiClient.get<CommunityEventNearbyItem[]>(`${API_CONFIG.endpoints.events.nearby}${qs}`);
  return { ...res, meta: (res as { meta?: EventNearbyMeta }).meta };
}

/**
 * `POST /events` — create a community event (owner-scoped, lands in PENDING).
 * Coordinates must arrive as a complete pair; omit both to skip the map pin.
 */
async function create(data: CreateEventInput): Promise<EventDetailResponse> {
  return apiClient.post<CommunityEvent>(API_CONFIG.endpoints.events.create, data);
}

/** `PATCH /events/:id` — edit an event the caller created (owner or admin). */
async function update(id: string, data: UpdateEventInput): Promise<EventDetailResponse> {
  return apiClient.patch<CommunityEvent>(API_CONFIG.endpoints.events.byIdOrSlug(id), data);
}

/** `DELETE /events/:id` — remove a non-public submission the caller created. */
async function remove(id: string): Promise<EventDetailResponse> {
  return apiClient.delete<CommunityEvent>(API_CONFIG.endpoints.events.byIdOrSlug(id));
}

export const eventsApi = {
  list,
  listMine,
  featured,
  getByIdOrSlug,
  mapFeed,
  nearby,
  create,
  update,
  remove,
};