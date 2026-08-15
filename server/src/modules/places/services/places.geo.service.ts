import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../shared/utils/ApiError';
import { getPaginationParams, paginatedResponse } from '../../../shared/utils/pagination';
import { cache, cacheKey } from '../../../config/cache';
import { mapPlaceRow, mapViewportRow, mapMapPlaceRow, placeApproved, excludeCommercialPlacesSql, excludeCommercialPlacesWhere, resolvePlace } from './places.helpers';
import { dedupePlacesByLocation } from '../../../shared/utils/placeDedupe';
import { normalizeForMatch } from '../../../shared/utils/canonicalText';
import { appendPublicPlaceSqlConditions, verifiedPlaceSqlP } from './places-public-visibility';
import { env } from '../../../config/env';
import { hybridSearchService } from '../../canonical/services/hybrid-search.service';

function joinConditions(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} AND ${c}`);
}

function joinOr(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`FALSE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} OR ${c}`);
}

export const placesGeoService = {
  async search(query: {
    q?: string;
    category?: string;
    tags?: string;
    lat?: string;
    lng?: string;
    radius?: string;
    sort?: string;
    page?: string;
    limit?: string;
  }) {
    const pagination = getPaginationParams(query);
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'APPROVED'`,
      Prisma.sql`p.merged_into_id IS NULL`,
      excludeCommercialPlacesSql,
    ];
    appendPublicPlaceSqlConditions(conditions);

    if (query.q && query.q.trim() !== '') {
      const q = query.q.trim();
      const qCollapsed = q.toLowerCase().replace(/([a-z])\1+/g, '$1');
      const qNorm = normalizeForMatch(q);
      conditions.push(Prisma.sql`(
        p.search_vector @@ plainto_tsquery('english', ${q})
        OR p.city ILIKE ${'%' + q + '%'}
        OR p.state ILIKE ${'%' + q + '%'}
        OR p.district ILIKE ${'%' + q + '%'}
        OR p.name ILIKE ${'%' + q + '%'}
        OR regexp_replace(lower(p.name), '([a-z])\\1+', '\\1', 'g') LIKE ${'%' + qCollapsed + '%'}
        OR similarity(p.name, ${q}) > 0.3
        OR word_similarity(p.name, ${q}) > 0.4
        OR EXISTS (
          SELECT 1 FROM place_aliases pa
          WHERE pa.place_id = p.id
            AND (
              pa.normalized_alias = ${qNorm}
              OR pa.alias ILIKE ${'%' + q + '%'}
              OR similarity(pa.alias, ${q}) > 0.35
              OR word_similarity(pa.alias, ${q}) > 0.5
            )
        )
      )`);
    }

    if (query.category) {
      conditions.push(Prisma.sql`LOWER(p.category) = LOWER(${query.category})`);
    }

    if (query.tags) {
      const tagList = query.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        const tagConditions = tagList.map((t) => Prisma.sql`${t} = ANY(p.tags)`);
        conditions.push(Prisma.sql`(${joinOr(tagConditions)})`);
      }
    }

    let lat = NaN;
    let lng = NaN;
    if (query.lat != null && query.lng != null) {
      lat = parseFloat(query.lat);
      lng = parseFloat(query.lng);
    }

    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
    if (hasGeo) {
      const radius = parseFloat(query.radius || '50000');
      conditions.push(Prisma.sql`ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})`);
    }

    const whereClause = joinConditions(conditions);

    let orderClause: Prisma.Sql = Prisma.sql`p.created_at DESC`;
    if (query.sort === 'relevance' && query.q && query.q.trim() !== '') {
      if (query.q.trim()) {
        orderClause = Prisma.sql`ts_rank(p.search_vector, plainto_tsquery('english', ${query.q.trim()})) DESC, p.created_at DESC`;
      }
    } else if (query.sort === 'popularity') {
      orderClause = Prisma.sql`p.popularity_score DESC NULLS LAST, p.review_count DESC, p.created_at DESC`;
    } else if (query.sort === 'distance' && hasGeo) {
      orderClause = Prisma.sql`distance ASC`;
    }

    const countResult: any = await prisma.$queryRaw`SELECT COUNT(*) FROM places p WHERE ${whereClause}`;
    const total = Number(countResult[0]?.count || 0);

    const distanceSelect = hasGeo
      ? Prisma.sql`, ST_Distance(p.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance`
      : Prisma.sql``;

    const rawData: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.hidden_gem_score, p.popularity_score, p.verification_level,
        p.best_time_to_visit, p.best_time_reason,
        p.created_at, p.updated_at
        ${distanceSelect}
      FROM places p
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      OFFSET ${pagination.skip}
      LIMIT ${pagination.limit}
    `;

    const data = dedupePlacesByLocation(rawData.map(mapPlaceRow));

    if (env.hybridSearchEnabled && query.q?.trim()) {
      const hybrid = await hybridSearchService.search(query.q.trim(), pagination.limit);
      const rank = new Map(hybrid.map((h, i) => [h.id, i]));
      data.sort((a: { id: string }, b: { id: string }) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
    }

    return paginatedResponse(data, total, pagination);
  },

  async nearby(query: {
    lat: string;
    lng: string;
    radius?: string;
    category?: string;
    page?: string;
    limit?: string;
  }) {
    const pagination = getPaginationParams(query);
    const lat = parseFloat(query.lat);
    const lng = parseFloat(query.lng);
    const radius = parseFloat(query.radius || '5000');

    const ck = cacheKey('places', 'nearby', `${lat.toFixed(4)}`, `${lng.toFixed(4)}`, `${radius}`, query.category || 'all');
    const cached = await cache.get(ck);
    if (cached) {
      const { data, total } = cached as any;
      const paged = data.slice(pagination.skip, pagination.skip + pagination.limit);
      return paginatedResponse(paged, total, pagination);
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'APPROVED'`,
      Prisma.sql`p.merged_into_id IS NULL`,
      excludeCommercialPlacesSql,
      Prisma.sql`ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})`,
    ];
    appendPublicPlaceSqlConditions(conditions);

    if (query.category) {
      conditions.push(Prisma.sql`LOWER(p.category) = LOWER(${query.category})`);
    }

    const whereClause = joinConditions(conditions);

    const countResult: any = await prisma.$queryRaw`SELECT COUNT(*) FROM places p WHERE ${whereClause}`;
    const total = Number(countResult[0]?.count || 0);
    if (total === 0) return paginatedResponse([], 0, pagination);

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.hidden_gem_score, p.popularity_score, p.verification_level,
        p.best_time_to_visit, p.best_time_reason,
        p.created_at, p.updated_at,
        ST_Distance(p.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance
      FROM places p
      WHERE ${whereClause}
      ORDER BY distance ASC
    `;

    const data = dedupePlacesByLocation(raw.map(mapPlaceRow));
    const allData = { data, total: data.length };
    await cache.set(ck, allData, 120);

    const paged = data.slice(pagination.skip, pagination.skip + pagination.limit);
    return paginatedResponse(paged, data.length, pagination);
  },

  async viewport(query: {
    north: string;
    south: string;
    east: string;
    west: string;
    category?: string;
    tags?: string;
    limit?: string;
  }) {
    const north = parseFloat(query.north);
    const south = parseFloat(query.south);
    const east = parseFloat(query.east);
    const west = parseFloat(query.west);
    const limit = Math.min(parseInt(query.limit || '200', 10), 500);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'APPROVED'`,
      Prisma.sql`p.merged_into_id IS NULL`,
      excludeCommercialPlacesSql,
      Prisma.sql`p.latitude BETWEEN ${south} AND ${north}`,
      Prisma.sql`p.longitude BETWEEN ${west} AND ${east}`,
    ];
    appendPublicPlaceSqlConditions(conditions);

    if (query.category) {
      conditions.push(Prisma.sql`LOWER(p.category) = LOWER(${query.category})`);
    }

    if (query.tags) {
      const tags = query.tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        const tagConditions = tags.map((t) => Prisma.sql`${t} = ANY(p.tags)`);
        conditions.push(Prisma.sql`(${joinOr(tagConditions)})`);
      }
    }

    const whereClause = joinConditions(conditions);

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.hidden_gem_score, p.popularity_score, p.verification_level,
        p.best_time_to_visit, p.best_time_reason,
        p.created_at
      FROM places p
      WHERE ${whereClause}
      ORDER BY p.popularity_score DESC NULLS LAST, p.review_count DESC
      LIMIT ${limit}
    `;

    return dedupePlacesByLocation(raw.map(mapViewportRow));
  },

  async getClusters(query: {
    neLat: string;
    neLng: string;
    swLat: string;
    swLng: string;
    zoom?: string;
  }) {
    const neLat = parseFloat(query.neLat);
    const neLng = parseFloat(query.neLng);
    const swLat = parseFloat(query.swLat);
    const swLng = parseFloat(query.swLng);
    const zoom = parseInt(query.zoom || '10', 10);

    const earthWidth = 40075016.686;
    const gridSize = earthWidth / Math.pow(2, zoom + 1);

    const gridDeg = gridSize / 111320.0;
    const placesInBounds = await prisma.place.findMany({
      where: {
        status: 'APPROVED',
        mergedIntoId: null,
        ...excludeCommercialPlacesWhere,
        ...(env.placesPublicVerifiedOnly ? { dataQuality: 'VERIFIED' as const } : {}),
        latitude: { not: null, gte: swLat, lte: neLat },
        longitude: { not: null, gte: swLng, lte: neLng },
      },
      select: { id: true, name: true, category: true, latitude: true, longitude: true },
    });
    const clusterMap = new Map<string, { latSum: number; lngSum: number; count: number; ids: string[]; categories: Set<string>; names: string[] }>();
    for (const p of placesInBounds) {
      const latGroup = Math.floor(p.latitude! / gridDeg);
      const lngGroup = Math.floor(p.longitude! / gridDeg);
      const key = `${latGroup}:${lngGroup}`;
      let cluster = clusterMap.get(key);
      if (!cluster) {
        cluster = { latSum: 0, lngSum: 0, count: 0, ids: [], categories: new Set(), names: [] };
        clusterMap.set(key, cluster);
      }
      cluster.latSum += p.latitude!;
      cluster.lngSum += p.longitude!;
      cluster.count += 1;
      cluster.ids.push(p.id);
      cluster.categories.add(p.category);
      cluster.names.push(p.name);
    }
    const raw = Array.from(clusterMap.entries())
      .map(([, c]) => ({
        lat: c.latSum / c.count,
        lng: c.lngSum / c.count,
        count: c.count,
        place_ids: c.ids,
        categories: Array.from(c.categories),
        names: c.names,
      }))
      .sort((a, b) => b.count - a.count);

    return raw.map((r: any) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lng),
      count: Number(r.count),
      placeIds: r.place_ids,
      categories: r.categories,
      label: Number(r.count) === 1 ? r.names[0] : `${r.count} places`,
    }));
  },

  async viewportSearch(query: {
    q?: string;
    north: string;
    south: string;
    east: string;
    west: string;
    category?: string;
    limit?: string;
  }) {
    const north = parseFloat(query.north);
    const south = parseFloat(query.south);
    const east = parseFloat(query.east);
    const west = parseFloat(query.west);
    const limit = Math.min(parseInt(query.limit || '200', 10), 500);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'APPROVED'`,
      Prisma.sql`p.merged_into_id IS NULL`,
      excludeCommercialPlacesSql,
      Prisma.sql`p.location && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`,
      Prisma.sql`ST_Within(p.location, ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326))`,
    ];
    appendPublicPlaceSqlConditions(conditions);

    if (query.q && query.q.trim() !== '') {
      const q = query.q.trim();
      const qCollapsed = q.toLowerCase().replace(/([a-z])\1+/g, '$1');
      const qNorm = normalizeForMatch(q);
      conditions.push(Prisma.sql`(
        p.search_vector @@ plainto_tsquery('english', ${q})
        OR p.city ILIKE ${'%' + q + '%'}
        OR p.state ILIKE ${'%' + q + '%'}
        OR p.name ILIKE ${'%' + q + '%'}
        OR regexp_replace(lower(p.name), '([a-z])\\1+', '\\1', 'g') LIKE ${'%' + qCollapsed + '%'}
        OR similarity(p.name, ${q}) > 0.3
        OR word_similarity(p.name, ${q}) > 0.4
        OR EXISTS (
          SELECT 1 FROM place_aliases pa
          WHERE pa.place_id = p.id
            AND (
              pa.normalized_alias = ${qNorm}
              OR pa.alias ILIKE ${'%' + q + '%'}
              OR similarity(pa.alias, ${q}) > 0.35
              OR word_similarity(pa.alias, ${q}) > 0.5
            )
        )
      )`);
    }

    if (query.category) {
      conditions.push(Prisma.sql`LOWER(p.category) = LOWER(${query.category})`);
    }

    const whereClause = joinConditions(conditions);

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.hidden_gem_score, p.popularity_score, p.verification_level,
        p.best_time_to_visit, p.best_time_reason,
        p.created_at
      FROM places p
      WHERE ${whereClause}
      ORDER BY p.popularity_score DESC NULLS LAST, p.review_count DESC
      LIMIT ${limit}
    `;

    return dedupePlacesByLocation(raw.map(mapViewportRow));
  },

  async getTrending(limit: number = 20) {
    const ck = cacheKey('places', 'trending');
    const cached = await cache.get<any[]>(ck);
    if (cached) return cached;

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.popularity_score,
        p.best_time_to_visit, p.best_time_reason, p.created_at,
        COUNT(ps.id) AS engagement
      FROM places p
      LEFT JOIN place_stats ps ON ps."placeId" = p.id AND ps.created_at >= ${sevenDaysAgo}
      WHERE p.status = ${placeApproved}
        AND p.merged_into_id IS NULL
        AND p.category::text NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')
        ${verifiedPlaceSqlP()}
      GROUP BY p.id
      ORDER BY engagement DESC
      LIMIT ${limit}
    `;

    const result = dedupePlacesByLocation(
      raw.map((r: any) => ({
        ...mapViewportRow(r),
        engagement: Number(r.engagement),
      })),
    );

    await cache.set(ck, result, 300);
    return result;
  },

  async getHiddenGems(limit: number = 20) {
    const ck = cacheKey('places', 'hidden-gems');
    const cached = await cache.get<any[]>(ck);
    if (cached) return cached;

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.hidden_gem_score, p.popularity_score,
        p.best_time_to_visit, p.best_time_reason, p.created_at
      FROM places p
      WHERE p.status = ${placeApproved}
        AND p.merged_into_id IS NULL
        AND p.source = 'HIDDEN_GEM'
        AND 'hidden-gem' = ANY(p.tags)
        AND p.category::text NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')
        ${verifiedPlaceSqlP({ includeApprovedHiddenGems: true })}
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;

    const result = dedupePlacesByLocation(
      raw.map((r: any) => ({
        ...mapViewportRow(r),
      })),
    );

    await cache.set(ck, result, 300);
    return result;
  },

  async getHotspots(query: {
    days?: string;
    minEngagement?: string;
    limit?: string;
  }) {
    const days = parseInt(query.days || '30', 10);
    const minEngagement = parseInt(query.minEngagement || '10', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const since = new Date(Date.now() - days * 86400000);

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.latitude, p.longitude,
        p.category, p.city, p.state, p.popularity_score, p.hidden_gem_score,
        COUNT(ps.id) AS total_engagement,
        COUNT(ps.id) FILTER (WHERE ps.action = 'view') AS views,
        COUNT(ps.id) FILTER (WHERE ps.action = 'like') AS likes,
        COUNT(ps.id) FILTER (WHERE ps.action = 'save') AS saves,
        COUNT(ps.id) FILTER (WHERE ps.action = 'checkin') AS checkins
      FROM places p
      JOIN place_stats ps ON ps."placeId" = p.id
      WHERE p.status = ${placeApproved}
        AND p.merged_into_id IS NULL
        AND p.category::text NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')
        AND ps.created_at >= ${since}
        ${verifiedPlaceSqlP()}
      GROUP BY p.id
      HAVING COUNT(ps.id) >= ${minEngagement}
      ORDER BY total_engagement DESC
      LIMIT ${limit}
    `;

    return raw.map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      category: r.category,
      city: r.city,
      state: r.state,
      popularityScore: r.popularity_score ? Number(r.popularity_score) : null,
      hiddenGemScore: r.hidden_gem_score ? Number(r.hidden_gem_score) : null,
      engagement: {
        total: Number(r.total_engagement),
        views: Number(r.views),
        likes: Number(r.likes),
        saves: Number(r.saves),
        checkins: Number(r.checkins),
      },
    }));
  },

  /** Zoom-aware map feed: PostGIS clusters at low zoom, paginated pins at high zoom. */
  async map(query: {
    north: string;
    south: string;
    east: string;
    west: string;
    zoom?: string;
    categories?: string;
    category?: string;
    verifiedOnly?: string;
    limit?: string;
    cursor?: string;
  }) {
    const north = parseFloat(query.north);
    const south = parseFloat(query.south);
    const east = parseFloat(query.east);
    const west = parseFloat(query.west);
    const zoom = parseInt(query.zoom || '12', 10);
    const limit = Math.min(parseInt(query.limit || '1000', 10), 1000);
    const verifiedOnly = query.verifiedOnly === 'true' || query.verifiedOnly === '1';
    const CLUSTER_MAX_ZOOM = -1; // Disabled clustering per user request

    const categoryList = [
      ...(query.categories?.split(',').map((c) => c.trim()).filter(Boolean) || []),
      ...(query.category ? [query.category.trim()] : []),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'APPROVED'`,
      Prisma.sql`p.merged_into_id IS NULL`,
      excludeCommercialPlacesSql,
      Prisma.sql`p.location IS NOT NULL`,
      Prisma.sql`ST_Intersects(p.location, ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326))`,
    ];
    appendPublicPlaceSqlConditions(conditions);
    if (verifiedOnly) {
      conditions.push(Prisma.sql`p.data_quality = 'VERIFIED'`);
    }
    if (categoryList.length > 0) {
      const catConditions = categoryList.map((c) => Prisma.sql`LOWER(p.category::text) = LOWER(${c})`);
      conditions.push(Prisma.sql`(${joinOr(catConditions)})`);
    }
    const whereClause = joinConditions(conditions);

    const ck = cacheKey(
      'places', 'map',
      south.toFixed(3), north.toFixed(3), west.toFixed(3), east.toFixed(3),
      String(zoom), categoryList.join(',') || 'all',
      verifiedOnly ? 'verified' : 'all',
      query.cursor || 'start',
    );
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    if (zoom <= CLUSTER_MAX_ZOOM) {
      const earthWidth = 40075016.686;
      const gridSize = earthWidth / Math.pow(2, zoom + 1);

      const clusters: any[] = await prisma.$queryRaw`
        WITH filtered AS (
          SELECT p.id, p.name, p.category, p.location
          FROM places p
          WHERE ${whereClause}
        ),
        snapped AS (
          SELECT
            ST_SnapToGrid(f.location, ${gridSize}) AS cell,
            f.id, f.category, f.name
          FROM filtered f
        ),
        grid AS (
          SELECT
            cell,
            COUNT(*)::int AS count,
            ARRAY_AGG(id) AS place_ids,
            ARRAY_AGG(DISTINCT category::text) AS categories,
            ARRAY_AGG(name) AS names
          FROM snapped
          GROUP BY cell
        )
        SELECT
          ST_X(ST_Centroid(cell)) AS longitude,
          ST_Y(ST_Centroid(cell)) AS latitude,
          count,
          place_ids,
          categories,
          names
        FROM grid
        ORDER BY count DESC
        LIMIT ${Math.min(limit, 300)}
      `;

      const totalResult: any = await prisma.$queryRaw`SELECT COUNT(*) FROM places p WHERE ${whereClause}`;
      const totalInViewport = Number(totalResult[0]?.count || 0);

      const result = {
        mode: 'clusters' as const,
        zoom,
        bounds: { north, south, east, west },
        clusters: clusters.map((r) => ({
          id: `cluster-${Number(r.latitude).toFixed(5)}-${Number(r.longitude).toFixed(5)}`,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          count: Number(r.count),
          placeIds: r.place_ids as string[],
          categories: r.categories as string[],
          label: Number(r.count) === 1 ? (r.names as string[])[0] : `${r.count} places`,
          markerType: 'cluster',
        })),
        places: [] as ReturnType<typeof mapMapPlaceRow>[],
        nextCursor: null as string | null,
        totalInViewport,
      };
      await cache.set(ck, result, 60);
      return result;
    }

    let cursorScore = 0;
    let cursorId: string | null = null;
    if (query.cursor) {
      try {
        const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
        const pipe = decoded.indexOf('|');
        if (pipe > 0) {
          const scorePart = decoded.slice(0, pipe);
          cursorScore = scorePart === 'null' ? 0 : parseFloat(scorePart);
          cursorId = decoded.slice(pipe + 1);
        }
      } catch {
        /* ignore malformed cursor */
      }
    }

    const cursorCondition = cursorId
      ? Prisma.sql`AND (
          COALESCE(p.popularity_score, 0) < ${cursorScore}
          OR (COALESCE(p.popularity_score, 0) = ${cursorScore} AND p.id < ${cursorId})
        )`
      : Prisma.empty;

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.slug, p.short_description, p.latitude, p.longitude,
        p.category, p.subcategory, p.images, p.thumbnail, p.tags,
        p.city, p.state, p.country,
        p.ticket_price,
        p.rating, p.review_count, p.hidden_gem_score, p.popularity_score,
        p.verification_level, p.data_quality, 
        FALSE AS is_featured,
        p.created_at
      FROM places p
      WHERE ${whereClause}
      ${cursorCondition}
      ORDER BY p.popularity_score DESC NULLS LAST, p.id DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = raw.length > limit;
    const slice = hasMore ? raw.slice(0, limit) : raw;
    const places = dedupePlacesByLocation(slice.map(mapMapPlaceRow));

    let nextCursor: string | null = null;
    if (hasMore && slice.length > 0) {
      const last = slice[slice.length - 1];
      const scoreVal = last.popularity_score == null ? 'null' : String(last.popularity_score);
      nextCursor = Buffer.from(`${scoreVal}|${last.id}`).toString('base64url');
    }

    const countResult: any = await prisma.$queryRaw`SELECT COUNT(*) FROM places p WHERE ${whereClause}`;
    const totalInViewport = Number(countResult[0]?.count || 0);

    const result = {
      mode: 'places' as const,
      zoom,
      bounds: { north, south, east, west },
      places,
      clusters: [] as object[],
      nextCursor,
      totalInViewport,
    };
    await cache.set(ck, result, 60);
    return result;
  },

  /** Distinct place categories for dynamic map filters. */
  async mapCategories() {
    const ck = cacheKey('places', 'map-categories');
    const cached = await cache.get<any[]>(ck);
    if (cached) return cached;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status = 'APPROVED'`,
      Prisma.sql`p.merged_into_id IS NULL`,
      excludeCommercialPlacesSql,
    ];
    appendPublicPlaceSqlConditions(conditions);
    const whereClause = joinConditions(conditions);

    const raw: any[] = await prisma.$queryRaw`
      SELECT LOWER(p.category::text) AS category, COUNT(*)::int AS count
      FROM places p
      WHERE ${whereClause}
      GROUP BY LOWER(p.category::text)
      HAVING COUNT(*) > 0
      ORDER BY count DESC, category ASC
    `;

    const result = raw.map((r) => ({
      key: r.category,
      count: Number(r.count),
    }));
    await cache.set(ck, result, 300);
    return result;
  },

  async getNearbyVendors(placeIdOrSlug: string, query: { radius?: string; limit?: string; category?: string }) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!place || place.latitude == null || place.longitude == null) {
      throw new ApiError(404, 'Place not found.');
    }

    const radius = parseFloat(query.radius || '5000');
    const limit = parseInt(query.limit || '10', 10);
    const categoryCondition = query.category ? Prisma.sql`AND v.category = ${query.category}` : Prisma.empty;

    const vendors = await prisma.$queryRaw<any[]>`
      SELECT v.id, v.business_name as "businessName", v.category, v.rating,
             v.latitude, v.longitude, v.thumbnail_url as "thumbnailUrl",
             ST_Distance(
               v.location::geography,
               ST_SetSRID(ST_MakePoint(${place.longitude}, ${place.latitude}), 4326)::geography
             ) as distance
      FROM vendors v
      WHERE v.status = 'APPROVED'
        AND v.suspended_at IS NULL
        AND EXISTS (
          SELECT 1 FROM user_subscriptions us
          WHERE us.user_id = v.user_id
            AND us.audience = 'VENDOR'
            AND us.status IN ('ACTIVE', 'TRIALING')
            AND us.current_period_end >= NOW()
        )
        AND ST_DWithin(
          v.location::geography,
          ST_SetSRID(ST_MakePoint(${place.longitude}, ${place.latitude}), 4326)::geography,
          ${radius}
        )
        ${categoryCondition}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
    return vendors;
  },
};
