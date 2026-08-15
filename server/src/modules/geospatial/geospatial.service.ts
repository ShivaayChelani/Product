import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache, cacheKey } from '../../config/cache';
import { haversineDistance } from '../../shared/utils/geo';
import { resolvePlace } from '../places/services/places.helpers';
import { appendPublicPlaceSqlConditions, verifiedPlaceSqlP } from '../places/services/places-public-visibility';

function touristPlaceSqlFilters(extra: Prisma.Sql[] = []): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.status = 'APPROVED'`,
    Prisma.sql`p.merged_into_id IS NULL`,
    ...extra,
  ];
  appendPublicPlaceSqlConditions(conditions);
  return conditions;
}

function joinConditions(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} AND ${c}`);
}

function buildFallbackWhere(lat: number, lng: number, radius: number, category?: string): Prisma.Sql {
  const latRad = lat * Math.PI / 180;
  const lngScale = Math.cos(latRad) || 0.01;
  const degreeToMeter = 111000;
  const latDeg = radius / degreeToMeter;
  const lngDeg = radius / (degreeToMeter * lngScale);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`status = 'APPROVED'`,
    Prisma.sql`merged_into_id IS NULL`,
    Prisma.sql`latitude IS NOT NULL`,
    Prisma.sql`longitude IS NOT NULL`,
    Prisma.sql`ABS(latitude - ${lat}) < ${latDeg}`,
    Prisma.sql`ABS(longitude - ${lng}) < ${lngDeg}`,
  ];
  if (category) {
    conditions.push(Prisma.sql`category = ${category}`);
  }
  return joinConditions(conditions);
}

export const geospatialService = {
  async nearby(query: {
    lat: string;
    lng: string;
    radius?: string;
    category?: string;
    page?: string;
    limit?: string;
  }) {
    const lat = parseFloat(query.lat);
    const lng = parseFloat(query.lng);
    const radius = parseFloat(query.radius || '5000');
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;
    const category = query.category;

    const ck = cacheKey('geo', 'nearby', `${lat.toFixed(4)}:${lng.toFixed(4)}:${radius}:${category || 'all'}:${page}:${limit}`);
    const cached = await cache.get<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>(ck);
    if (cached) {
      return cached;
    }

    let raw: any[];
    let total: number;

    try {
      const distanceClause = Prisma.sql`(6371000 * 2 * ASIN(SQRT(POWER(SIN((radians(${lat}) - radians(p.latitude)) / 2), 2)
        + COS(radians(${lat})) * COS(radians(p.latitude))
        * POWER(SIN((radians(${lng}) - radians(p.longitude)) / 2), 2))))`;
      const conditions: Prisma.Sql[] = touristPlaceSqlFilters([
        Prisma.sql`p.latitude IS NOT NULL`,
        Prisma.sql`p.longitude IS NOT NULL`,
        Prisma.sql`${distanceClause} <= ${radius}`,
      ]);

      if (category) {
        conditions.push(Prisma.sql`p.category = ${category}`);
      }

      const whereClause = joinConditions(conditions);

      const countResult: any = await prisma.$queryRaw`SELECT COUNT(*) FROM places p WHERE ${whereClause}`;
      total = Number(countResult[0]?.count || 0);
      raw = total > 0 ? await prisma.$queryRaw`
        SELECT
          p.id, p.name, p.description, p.latitude, p.longitude,
          p.category, p.images, p.tags, p.status, p.created_at, p.updated_at,
          ${distanceClause} AS distance
        FROM places p
        WHERE ${whereClause}
        ORDER BY distance ASC
        OFFSET ${skip}
        LIMIT ${limit}
      ` : [];
    } catch {
      const fallbackWhere = buildFallbackWhere(lat, lng, radius, category);
      const fallbackCount: any = await prisma.$queryRaw`SELECT COUNT(*) FROM places WHERE ${fallbackWhere}`;
      total = Number(fallbackCount[0]?.count || 0);
      raw = total > 0 ? await prisma.$queryRaw`
        SELECT id, name, description, latitude, longitude,
          category, images, tags, status, created_at, updated_at
        FROM places WHERE ${fallbackWhere} ORDER BY name ASC
        OFFSET ${skip}
        LIMIT ${limit}
      ` : [];
    }

    const data = raw.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      category: r.category,
      images: r.images || [],
      tags: r.tags || [],
      status: r.status,
      distance: Math.round(r.distance === undefined
        ? haversineDistance(lat, lng, Number(r.latitude), Number(r.longitude))
        : Number(r.distance)),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const response = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await cache.set(ck, response, 120);
    return response;
  },

  async clusters(query: {
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

    let raw: any[];
    try {
      raw = await prisma.$queryRaw`
        WITH bounds AS (
          SELECT ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326) AS geom
        ),
        snapped AS (
          SELECT
            ST_SnapToGrid(p.location, ${gridSize}) AS cell,
            p.id, p.category, p.name
          FROM places p, bounds b
          WHERE p.status = 'APPROVED'
            AND p.merged_into_id IS NULL
            ${verifiedPlaceSqlP()}
            AND ST_Within(p.location, b.geom)
        ),
        grid AS (
          SELECT
            cell,
            COUNT(*) AS count,
            ARRAY_AGG(id) AS place_ids,
            ARRAY_AGG(DISTINCT category) AS categories,
            ARRAY_AGG(name) AS names
          FROM snapped
          GROUP BY cell
        )
        SELECT
          ST_X(ST_Centroid(cell)) AS lng,
          ST_Y(ST_Centroid(cell)) AS lat,
          count,
          place_ids,
          categories,
          names
        FROM grid
        ORDER BY count DESC
      `;
    } catch {
      raw = [];
    }

    return raw.map((r: any) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lng),
      count: Number(r.count),
      placeIds: r.place_ids,
      categories: r.categories,
      label: Number(r.count) === 1 ? r.names[0] : `${r.count} places`,
    }));
  },

  async nearest(query: {
    lat: string;
    lng: string;
    limit?: string;
    radius?: string;
    category?: string;
  }) {
    const lat = parseFloat(query.lat);
    const lng = parseFloat(query.lng);
    const resultLimit = Math.min(parseInt(query.limit || '10', 10), 50);
    const radius = parseInt(query.radius || '50000', 10);
    const category = query.category;

    const conditions: Prisma.Sql[] = touristPlaceSqlFilters([
      Prisma.sql`(6371000 * 2 * ASIN(SQRT(POWER(SIN((radians(${lat}) - radians(p.latitude)) / 2), 2)
        + COS(radians(${lat})) * COS(radians(p.latitude))
        * POWER(SIN((radians(${lng}) - radians(p.longitude)) / 2), 2)))) <= ${radius}`,
    ]);

    if (category) {
      conditions.push(Prisma.sql`p.category = ${category}`);
    }

    const whereClause = joinConditions(conditions);

    const raw: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.description, p.latitude, p.longitude,
        p.category, p.images, p.tags, p.created_at,
        COUNT(ps.id) AS total_engagement,
        COUNT(ps.id) FILTER (WHERE ps.action = 'view') AS views,
        COUNT(ps.id) FILTER (WHERE ps.action = 'like') AS likes,
        CASE
          WHEN COUNT(ps.id) FILTER (WHERE ps.action = 'view') > 0
          THEN ROUND(
            (COUNT(ps.id) FILTER (WHERE ps.action = 'like'))::numeric /
            NULLIF((COUNT(ps.id) FILTER (WHERE ps.action = 'view'))::numeric, 0) * 100, 1
          )
          ELSE 0
        END AS like_ratio,
        (6371000 * 2 * ASIN(SQRT(POWER(SIN((radians(${lat}) - radians(p.latitude)) / 2), 2)
          + COS(radians(${lat})) * COS(radians(p.latitude))
          * POWER(SIN((radians(${lng}) - radians(p.longitude)) / 2), 2)))) AS distance
      FROM places p
      LEFT JOIN place_stats ps ON ps."placeId" = p.id
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY distance ASC
      LIMIT ${resultLimit}
    `;

    return raw.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      category: r.category,
      images: r.images || [],
      tags: r.tags || [],
      distance: Math.round(Number(r.distance)),
      createdAt: r.created_at,
    }));
  },

  async route(query: {
    lat: string;
    lng: string;
    waypoints: string;
    radius?: string;
    limit?: string;
  }) {
    const originLat = parseFloat(query.lat);
    const originLng = parseFloat(query.lng);
    const radius = parseFloat(query.radius || '5000');
    const lim = Math.min(parseInt(query.limit || '20', 10), 50);

    const rawWaypointIds = query.waypoints
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const waypointIds = rawWaypointIds.length > 0
      ? (await Promise.all(
          rawWaypointIds.map(async (w) => {
            try {
              const { id } = await resolvePlace(w);
              return id;
            } catch {
              return null;
            }
          }),
        )).filter(Boolean) as string[]
      : [];

    const waypointPlaces = waypointIds.length > 0
      ? await prisma.place.findMany({
          where: { id: { in: waypointIds }, status: 'APPROVED', latitude: { not: null }, longitude: { not: null } },
          select: { id: true, name: true, latitude: true, longitude: true, category: true },
        })
      : [];

    let raw: any[];
    try {
      raw = await prisma.$queryRaw`
        SELECT
          p.id, p.name, p.description, p.latitude, p.longitude,
          p.category, p.images, p.created_at,
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)) AS distance
        FROM places p
        WHERE p.status = 'APPROVED'
          AND p.merged_into_id IS NULL
          ${verifiedPlaceSqlP()}
          AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326), ${radius})
          AND p.id != ALL(${waypointIds.length > 0 ? waypointIds : ['']}::text[])
        ORDER BY distance ASC
      LIMIT ${lim}
      `;
    } catch {
      raw = [];
    }

    const discovered = raw.map((r: any) => ({
      id: r.id,
      name: r.name,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      category: r.category,
      distanceFromPrev: Math.round(Number(r.distance)),
      order: 0,
    }));

    const waypoints = waypointPlaces.reduce((acc: any[], place) => {
      const idx = waypointIds.indexOf(place.id);
      if (idx >= 0) {
        const p = place as typeof place & { latitude: number; longitude: number };
        const prevLat = idx === 0 ? originLat : waypointPlaces.find((w) => w.id === waypointIds[idx - 1])?.latitude ?? originLat;
        const prevLng = idx === 0 ? originLng : waypointPlaces.find((w) => w.id === waypointIds[idx - 1])?.longitude ?? originLng;
        acc.push({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
          category: p.category,
          order: idx + 1,
          distanceFromPrev: Math.round(haversineDistance(prevLat, prevLng, p.latitude, p.longitude)),
        });
      }
      return acc;
    }, []);

    const allWaypoints = [...waypoints, ...discovered.map((d: any, i: number) => ({
      ...d,
      order: waypoints.length + i + 1,
    }))];

    const totalDistance = allWaypoints.reduce((sum: number, w: any) => sum + w.distanceFromPrev, 0);

    return { waypoints: allWaypoints, totalDistance: Math.round(totalDistance) };
  },

  async geofence(query: {
    lat: string;
    lng: string;
    radius?: string;
  }) {
    const lat = parseFloat(query.lat);
    const lng = parseFloat(query.lng);
    const fenceRadius = parseFloat(query.radius || '100');

    let raw: any[];
    try {
      raw = await prisma.$queryRaw`
        SELECT
          p.id, p.name, p.category,
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) AS distance
        FROM places p
        WHERE p.status = 'APPROVED'
          AND p.merged_into_id IS NULL
          ${verifiedPlaceSqlP()}
          AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${fenceRadius})
        ORDER BY distance ASC
        LIMIT 1
      `;
    } catch {
      raw = [];
    }

    if (raw.length === 0) {
      return { inside: false, place: null, distance: 0 };
    }

    return {
      inside: true,
      place: { id: raw[0].id, name: raw[0].name, category: raw[0].category },
      distance: Math.round(Number(raw[0].distance)),
    };
  },

  async heatmap(query: {
    neLat: string;
    neLng: string;
    swLat: string;
    swLng: string;
    zoom?: string;
    days?: string;
  }) {
    const neLat = parseFloat(query.neLat);
    const neLng = parseFloat(query.neLng);
    const swLat = parseFloat(query.swLat);
    const swLng = parseFloat(query.swLng);
    const zoom = parseInt(query.zoom || '8', 10);
    const days = parseInt(query.days || '30', 10);
    const since = new Date(Date.now() - days * 86400000);

    const earthWidth = 40075016.686;
    const gridSize = earthWidth / Math.pow(2, zoom + 2);

    let raw: any[];
    try {
      raw = await prisma.$queryRaw`
        WITH bounds AS (
          SELECT ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326) AS geom
        ),
        recent_stats AS (
          SELECT ps."placeId" AS place_id, ps.action
          FROM place_stats ps
          WHERE ps.created_at >= ${since}
        ),
        place_scores AS (
          SELECT
            p.id,
            p.location,
            COUNT(rs.*) *
              CASE
                WHEN rs.action = 'like' THEN 2.0
                WHEN rs.action = 'save' THEN 3.0
                WHEN rs.action = 'share' THEN 4.0
                WHEN rs.action = 'view' THEN 1.0
                ELSE 1.0
              END AS score
          FROM places p
          LEFT JOIN recent_stats rs ON rs.place_id = p.id
          WHERE p.status = 'APPROVED'
            AND p.merged_into_id IS NULL
            ${verifiedPlaceSqlP()}
          GROUP BY p.id, p.location
        )
        SELECT
          ST_X(ST_Centroid(ST_SnapToGrid(ps.location, ${gridSize}))) AS lng,
          ST_Y(ST_Centroid(ST_SnapToGrid(ps.location, ${gridSize}))) AS lat,
          COUNT(ps.id) AS place_count,
          SUM(ps.score) AS total_score
        FROM place_scores ps, bounds b
        WHERE ST_Within(ps.location, b.geom)
        GROUP BY ST_SnapToGrid(ps.location, ${gridSize})
        HAVING COUNT(ps.id) > 0
        ORDER BY total_score DESC
      `;
    } catch {
      raw = [];
    }

    return raw.map((r: any) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lng),
      count: Number(r.place_count),
      weight: Math.round(Number(r.total_score) * 10) / 10,
    }));
  },

  async trends(query: {
    days?: string;
    category?: string;
    limit?: string;
  }) {
    const days = parseInt(query.days || '30', 10);
    const lim = Math.min(parseInt(query.limit || '10', 10), 50);
    const category = query.category;
    const since = new Date(Date.now() - days * 86400000);

    const conditions: Prisma.Sql[] = touristPlaceSqlFilters();
    if (category) {
      conditions.push(Prisma.sql`p.category = ${category}`);
    }
    const categoryClause = joinConditions(conditions);
    const intervalDays = Prisma.sql`${days} * INTERVAL '1 day'`;

    const raw: any[] = await prisma.$queryRaw`
      WITH recent_stats AS (
        SELECT ps."placeId" AS place_id, COUNT(*) AS engagement
        FROM place_stats ps
        WHERE ps.created_at >= ${since}
        GROUP BY ps."placeId"
      ),
      prev_stats AS (
        SELECT ps."placeId" AS place_id, COUNT(*) AS prev_engagement
        FROM place_stats ps
        WHERE ps.created_at >= ${since} - ${intervalDays}
          AND ps.created_at < ${since}
        GROUP BY ps."placeId"
      ),
      place_regions AS (
        SELECT
          p.id,
          ROUND(p.latitude * 2) / 2 AS region_lat,
          ROUND(p.longitude * 2) / 2 AS region_lng,
          p.name, p.latitude, p.longitude, p.category
        FROM places p
        WHERE ${categoryClause}
      )
      SELECT
        pr.region_lat AS lat,
        pr.region_lng AS lng,
        COUNT(DISTINCT pr.id) AS places,
        COALESCE(SUM(rs.engagement), 0) AS engagement,
        COALESCE(SUM(ps.prev_engagement), 0) AS prev_engagement
      FROM place_regions pr
      LEFT JOIN recent_stats rs ON rs.place_id = pr.id
      LEFT JOIN prev_stats ps ON ps.place_id = pr.id
      GROUP BY pr.region_lat, pr.region_lng
      HAVING COUNT(DISTINCT pr.id) > 0
      ORDER BY engagement DESC
      LIMIT ${lim}
    `;

    return raw.map((r: any) => ({
      region: `${Number(r.lat).toFixed(1)}, ${Number(r.lng).toFixed(1)}`,
      lat: Number(r.lat),
      lng: Number(r.lng),
      places: Number(r.places),
      engagement: Number(r.engagement),
      growth: Number(r.prev_engagement) > 0
        ? Math.round(((Number(r.engagement) - Number(r.prev_engagement)) / Number(r.prev_engagement)) * 100)
        : Number(r.engagement) > 0 ? 100 : 0,
    }));
  },
};
