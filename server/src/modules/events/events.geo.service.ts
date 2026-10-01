import { Prisma, EventStatus, EventType } from '@prisma/client';
import { prisma } from '../../config/database';
import { parsePositiveInt } from '../../shared/utils/pagination';
import { assertValidCoordinatePair } from '../../shared/utils/coordinates';
import { normalizeBounds } from '../places/services/places.geo.service';
import { appendPublicEventSql, startOfTodayUtc } from './events-public-visibility';
import { EVENT_TYPE_MARKER, mapEventRow, type EventWithRelations } from './events.helpers';
import type { EventMapQueryInput, NearbyEventsQueryInput } from './events.validation';

/**
 * PostGIS-backed reads for Community Events.
 *
 * Every query here is bounded three ways: a viewport predicate, a hard LIMIT,
 * and (where a total count is not required) a keyset cursor. The audit's
 * "Performance Requirements" were explicit about never loading a whole result
 * set to filter in JS, which is exactly what the legacy Places event endpoint
 * did.
 */
export const EVENT_MAP_MAX_LIMIT = 500;
/** Same 400 ms client debounce as the Places/Vendors map implies a tight budget. */
export const EVENT_MAP_DEFAULT_LIMIT = 200;
export const EVENT_MAP_MAX_TYPES = 11; // every EventType value

/**
 * Parse a `types=A,B,C` filter. Unknown keys are dropped rather than rejected so
 * a client that ships a stale enum value degrades to "no filter" instead of
 * erroring; an empty result set would be a worse failure.
 */
export function parseEventTypeFilter(raw?: string): EventType[] {
  if (!raw) return [];
  const wanted = raw
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const all = new Set<string>(Object.values(EventType));
  return wanted.filter((t) => all.has(t)).slice(0, EVENT_MAP_MAX_TYPES) as EventType[];
}

function joinAnd(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} AND ${c}`);
}

const EVENT_LIST_SELECT = Prisma.sql`
  e.id, e.slug, e.title, e.description, e.event_type, e.status,
  e.start_date, e.end_date, e.start_time, e.end_time,
  e.latitude, e.longitude, e.address, e.city, e.state, e.country,
  e.cover_image, e.images, e.is_featured, e.published_at, e.rejected_at,
  e.rejection_reason, e.cancelled_at, e.cancellation_reason,
  e.created_by_id, e.approved_by_id, e.approved_at,
  e.linked_place_id, e.linked_vendor_id,
  e.legacy_place_event_id, e.created_at, e.updated_at`;

function distanceMetersSql(lat: number, lng: number): Prisma.Sql {
  return Prisma.sql`ST_Distance(e.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`;
}

/** Row shape Prisma returns for a hand-written SELECT (snake_case columns). */
function hydrateRow(raw: Record<string, unknown>): EventWithRelations {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: raw.id as string,
    slug: raw.slug as string,
    title: raw.title as string,
    description: (raw.description as string | null) ?? null,
    eventType: raw.event_type as EventType,
    status: raw.status as EventStatus,
    startDate: raw.start_date as Date,
    endDate: raw.end_date as Date,
    startTime: (raw.start_time as string | null) ?? null,
    endTime: (raw.end_time as string | null) ?? null,
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    address: (raw.address as string | null) ?? null,
    city: (raw.city as string | null) ?? '',
    state: (raw.state as string | null) ?? '',
    country: (raw.country as string | null) ?? 'India',
    coverImage: (raw.cover_image as string | null) ?? null,
    images: (raw.images as string[] | null) ?? [],
    isFeatured: (raw.is_featured as boolean | null) ?? false,
    createdById: (raw.created_by_id as string | null) ?? null,
    approvedById: (raw.approved_by_id as string | null) ?? null,
    approvedAt: (raw.approved_at as Date | null) ?? null,
    rejectedAt: (raw.rejected_at as Date | null) ?? null,
    rejectionReason: (raw.rejection_reason as string | null) ?? null,
    cancelledAt: (raw.cancelled_at as Date | null) ?? null,
    cancellationReason: (raw.cancellation_reason as string | null) ?? null,
    publishedAt: (raw.published_at as Date | null) ?? null,
    linkedPlaceId: (raw.linked_place_id as string | null) ?? null,
    linkedVendorId: (raw.linked_vendor_id as string | null) ?? null,
    legacyPlaceEventId: (raw.legacy_place_event_id as string | null) ?? null,
    createdAt: raw.created_at as Date,
    updatedAt: raw.updated_at as Date,
    createdBy: null,
    approvedBy: null,
    place: null,
    vendor: null,
    _count: { reels: Number(raw.reel_count ?? 0), reports: Number(raw.report_count ?? 0) },
  } as unknown as EventWithRelations;
}

export interface MapViewer {
  id?: string;
  isAdmin: boolean;
}

/**
 * Keyset cursor for the map feed.
 *
 * Offset pagination breaks here: the ordering key is
 * `(is_featured DESC, start_date ASC, id ASC)`, so inserting an event while a
 * user is panning silently shifts every later page and duplicates or drops
 * markers. A cursor pins the last row seen and resumes strictly after it.
 *
 * Encoded as base64url JSON rather than three separate query params so the
 * client cannot build a mismatched triple, and so `id` (a UUID) survives intact.
 */
export interface EventMapCursor {
  featured: boolean;
  startDate: string;
  id: string;
}

export function encodeEventMapCursor(cursor: EventMapCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeEventMapCursor(raw?: string | null): EventMapCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<EventMapCursor>;
    if (
      typeof parsed.featured !== 'boolean' ||
      typeof parsed.startDate !== 'string' ||
      Number.isNaN(Date.parse(parsed.startDate)) ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0
    ) {
      return null;
    }
    return { featured: parsed.featured, startDate: parsed.startDate, id: parsed.id };
  } catch {
    // A malformed cursor must not 500: treat it as "start from the beginning",
    // which is exactly what an absent cursor means.
    return null;
  }
}

/**
 * Strictly-after predicate matching the map ordering.
 *
 * Written out rather than using a row comparison because the leading column
 * sorts DESC while the rest sort ASC; `(a, b) > (c, d)` in Postgres compares
 * positionally and ignores each expression's direction, so it would be wrong
 * here.
 */
function eventMapCursorSql(cursor: EventMapCursor): Prisma.Sql {
  const start = new Date(cursor.startDate);
  return Prisma.sql`
    (
      (e.is_featured = false AND ${cursor.featured} = true)
      OR (
        e.is_featured = ${cursor.featured}
        AND (e.start_date > ${start} OR (e.start_date = ${start} AND e.id > ${cursor.id}))
      )
    )
  `;
}

function eventMapCursorOf(row: Record<string, unknown>): EventMapCursor {
  return {
    featured: Boolean(row.is_featured),
    startDate: (row.start_date as Date).toISOString(),
    id: row.id as string,
  };
}

export const eventsGeoService = {
  /**
   * Viewport feed for `GET /events/map`.
   *
   * The two-stage spatial predicate is deliberate: `&&` on the GIST index is a
   * cheap bbox reject, and only survivors pay for `ST_Intersects`. Removing
   * either stage is safe but slower; keeping both is what makes panning cheap.
   *
   * Ordering is `(is_featured DESC, start_date ASC, id ASC)` so featured events
   * lead and the keyset cursor is stable. `end_date ASC` is deliberately NOT
   * used: "what's on soonest" is what a traveller browsing a map wants.
   */
  async getMapEvents(query: EventMapQueryInput, viewer: MapViewer = { isAdmin: false }) {
    const { north, south, east, west } = normalizeBounds(
      parseFloat(query.north),
      parseFloat(query.south),
      parseFloat(query.east),
      parseFloat(query.west),
    );
    const limit = Math.min(EVENT_MAP_MAX_LIMIT, Math.max(1, parsePositiveInt(query.limit, EVENT_MAP_DEFAULT_LIMIT)));
    const types = parseEventTypeFilter(query.types);
    const cursor = decodeEventMapCursor(query.cursor);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.location && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`,
      Prisma.sql`ST_Intersects(e.location, ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326))`,
    ];
    // Public visibility (APPROVED, not ended, plottable, parent Place visible)
    // comes from the one shared helper, so the map can never drift from the list.
    appendPublicEventSql(conditions);

    if (query.city) conditions.push(Prisma.sql`LOWER(e.city) = LOWER(${query.city})`);
    if (query.state) conditions.push(Prisma.sql`LOWER(e.state) = LOWER(${query.state})`);
    if (query.featuredOnly === 'true' || query.featuredOnly === '1') {
      conditions.push(Prisma.sql`e.is_featured = true`);
    }
    if (types.length > 0) {
      conditions.push(Prisma.sql`e.event_type::text IN (${Prisma.join(types)})`);
    }
    // `includeOngoing=false` means "starting today or later", not "not started",
    // so an event already under way stays on the map while it is actually running.
    if (query.includeOngoing === 'false' || query.includeOngoing === '0') {
      conditions.push(Prisma.sql`e.start_date <= ${new Date(startOfTodayUtc().getTime() + 86_400_000)}`);
    }
    if (cursor) conditions.push(eventMapCursorSql(cursor));

    // Fetch one row past the limit: `hasMore` then means "there is genuinely
    // another page" instead of being guessed from a full page that may be last.
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT ${EVENT_LIST_SELECT},
             (SELECT COUNT(*) FROM reels r WHERE r.event_id = e.id)::int AS reel_count,
             (SELECT COUNT(*) FROM event_reports er WHERE er.event_id = e.id AND er.status = 'PENDING')::int AS report_count
      FROM events e
      WHERE ${joinAnd(conditions)}
      ORDER BY e.is_featured DESC, e.start_date ASC, e.id ASC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      events: page.map((r) => {
        const base = mapEventRow(hydrateRow(r), viewer);
        return { ...base, marker: EVENT_TYPE_MARKER[r.event_type as EventType] };
      }),
      meta: {
        count: page.length,
        limit,
        truncated: hasMore,
        bbox: { north, south, east, west },
        /** The client asks for more when it pans; there is no total-count query. */
        hasMore,
        nextCursor:
          hasMore && page.length > 0 ? encodeEventMapCursor(eventMapCursorOf(page[page.length - 1])) : null,
      },
    };
  },

  /**
   * Radius search for `GET /events/nearby`, ordered by true geodesic distance.
   *
   * The bounding box is derived from the radius and used as a pre-filter so the
   * GIST index can be used before computing exact distance. A naive
   * `ST_DWithin` would also be correct but cannot use the index without a
   * functional GIST wrapper.
   */
  async getNearbyEvents(query: NearbyEventsQueryInput, viewer: MapViewer = { isAdmin: false }) {
    const coord = assertValidCoordinatePair(query.lat, query.lng, { label: 'Your location' });
    const radiusKm = Math.min(500, Math.max(1, parsePositiveInt(query.radiusKm, 25)));
    const limit = Math.min(200, Math.max(1, parsePositiveInt(query.limit, 50)));

    // 1° latitude≈ 111.32 km. Longitude degrees shrink by cos(lat); at India's
    // southern latitudes cos(0) is worst case, so use that for the box.
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((coord.latitude * Math.PI) / 180), 0.01));
    const north = Math.min(90, coord.latitude + latDelta);
    const south = Math.max(-90, coord.latitude - latDelta);
    const east = Math.min(180, coord.longitude + lngDelta);
    const west = Math.max(-180, coord.longitude - lngDelta);

    const visibility: Prisma.Sql[] = [];
    appendPublicEventSql(visibility);

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT ${EVENT_LIST_SELECT},
             ${distanceMetersSql(coord.latitude, coord.longitude)} AS distance_m,
             (SELECT COUNT(*) FROM reels r WHERE r.event_id = e.id)::int AS reel_count,
             (SELECT COUNT(*) FROM event_reports er WHERE er.event_id = e.id AND er.status = 'PENDING')::int AS report_count
      FROM events e
      WHERE e.location && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
        AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint(${coord.longitude}, ${coord.latitude}), 4326)::geography, ${radiusKm * 1000})
        AND ${joinAnd(visibility)}
      ORDER BY distance_m ASC
      LIMIT ${limit}
    `);

    return {
      events: rows.map((r) => ({
        ...mapEventRow(hydrateRow(r), viewer),
        distanceMeters: Math.round(Number(r.distance_m ?? 0)),
      })),
      meta: { count: rows.length, radiusKm },
    };
  },

  /**
   * Curated "happening near you" strip for the home feed. Bounded to a small
   * limit and restricted to events ending soon so the carousel cannot be filled
   * by a festival that started months ago.
   */
  async getFeaturedEvents(limit = 10, viewer: MapViewer = { isAdmin: false }) {
    const capped = Math.min(24, Math.max(1, parsePositiveInt(String(limit), 10)));
    const visibility: Prisma.Sql[] = [Prisma.sql`e.is_featured = true`];
    appendPublicEventSql(visibility);

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT ${EVENT_LIST_SELECT},
             (SELECT COUNT(*) FROM reels r WHERE r.event_id = e.id)::int AS reel_count
      FROM events e
      WHERE ${joinAnd(visibility)}
      ORDER BY e.start_date ASC, e.id ASC
      LIMIT ${capped}
    `);
    return rows.map((r) => mapEventRow(hydrateRow(r), viewer));
  },
};