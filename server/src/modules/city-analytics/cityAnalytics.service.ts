import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache, cacheKey } from '../../config/cache';

function joinConditions(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} AND ${c}`);
}

export const cityAnalyticsService = {
  async getDashboard(params: {
    state?: string;
    city?: string;
    from?: string;
    to?: string;
  }) {
    const ck = cacheKey('city-analytics', params.state || 'all', params.city || 'all', params.from || 'all', params.to || 'all');
    const cached = await cache.get(ck);
    if (cached) return cached;

    const now = new Date();
    const fromDate = params.from ? new Date(params.from) : new Date(now.getTime() - 30 * 86400000);
    const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : now;

    const filters: Prisma.Sql[] = [];
    if (params.state) filters.push(Prisma.sql`p.state = ${params.state}`);
    if (params.city) filters.push(Prisma.sql`p.city = ${params.city}`);
    const filterSql = filters.length > 0 ? Prisma.sql`AND ${joinConditions(filters)}` : Prisma.sql``;

    // Total Visitors per city
    const cityVisitors = await prisma.$queryRaw<{ city: string; state: string; visitors: bigint; unique_visitors: bigint; checkins: bigint }[]>`
      SELECT
        p.city, p.state,
        COUNT(DISTINCT c.user_id)::int as unique_visitors,
        COUNT(*)::int as visitors,
        COUNT(DISTINCT c.id) as checkins
      FROM check_ins c
      JOIN places p ON c.place_id = p.id
      WHERE c.created_at >= ${fromDate} AND c.created_at <= ${toDate}
        ${filterSql}
      GROUP BY p.city, p.state
      ORDER BY visitors DESC
    `;

    // Most Visited Places
    const topPlaces = await prisma.$queryRaw<{ place_id: string; name: string; city: string; state: string; visits: bigint; category: string }[]>`
      SELECT
        p.id as place_id, p.name, p.city, p.state, p.category,
        COUNT(*)::int as visits
      FROM check_ins c
      JOIN places p ON c.place_id = p.id
      WHERE c.created_at >= ${fromDate} AND c.created_at <= ${toDate}
        ${filterSql}
      GROUP BY p.id, p.name, p.city, p.state, p.category
      ORDER BY visits DESC
      LIMIT 20
    `;

    // Most Viewed Places (from place_stats)
    const topViewed = await prisma.$queryRaw<{ place_id: string; name: string; city: string; views: bigint }[]>`
      SELECT
        p.id as place_id, p.name, p.city,
        COUNT(*)::int as views
      FROM place_stats ps
      JOIN places p ON ps."placeId" = p.id
      WHERE ps.action = 'view'
        AND ps.created_at >= ${fromDate} AND ps.created_at <= ${toDate}
        ${filterSql}
      GROUP BY p.id, p.name, p.city
      ORDER BY views DESC
      LIMIT 20
    `;

    // Top Categories
    const topCategories = await prisma.$queryRaw<{ category: string; count: bigint }[]>`
      SELECT p.category, COUNT(*)::int as count
      FROM check_ins c
      JOIN places p ON c.place_id = p.id
      WHERE c.created_at >= ${fromDate} AND c.created_at <= ${toDate}
        ${filterSql}
      GROUP BY p.category
      ORDER BY count DESC
    `;

    // Hidden Gem Popularity
    const hiddenGemStats = await prisma.$queryRaw<{ place_id: string; name: string; city: string; visits: bigint; views: bigint }[]>`
      SELECT
        p.id as place_id, p.name, p.city,
        COUNT(DISTINCT c.id)::int as visits,
        COUNT(DISTINCT ps.id) FILTER (WHERE ps.action = 'view')::int as views
      FROM places p
      LEFT JOIN check_ins c ON c.place_id = p.id
      LEFT JOIN place_stats ps ON ps."placeId" = p.id
      WHERE p.status = 'APPROVED' AND p.hidden_gem_score IS NOT NULL AND p.hidden_gem_score > 0
      GROUP BY p.id, p.name, p.city
      ORDER BY views DESC
      LIMIT 10
    `;

    // Reels per city
    const reelsByCity = await prisma.$queryRaw<{ city: string; count: bigint }[]>`
      SELECT p.city, COUNT(*)::int as count
      FROM reels r
      JOIN places p ON r.place_id = p.id
      WHERE r.created_at >= ${fromDate} AND r.created_at <= ${toDate}
      GROUP BY p.city
      ORDER BY count DESC
    `;

    // State list for filter dropdown
    const statesRaw = await prisma.$queryRaw<{ state: string }[]>`
      SELECT DISTINCT state FROM places WHERE state IS NOT NULL AND state != '' ORDER BY state ASC
    `;
    const states = statesRaw.map(s => s.state);

    // City list for filter dropdown
    const citiesRaw = await prisma.$queryRaw<{ city: string; state: string }[]>`
      SELECT DISTINCT city, state FROM places WHERE city IS NOT NULL AND city != '' ORDER BY city ASC
    `;
    const cities = citiesRaw.map(c => ({ city: c.city, state: c.state }));

    // Fill in avg visit duration (check_ins has no updated_at, return empty)
    const avgDuration: { city: string; avg_minutes: number }[] = [];

    const result = {
      cityVisitors: cityVisitors.map(r => ({
        city: r.city,
        state: r.state,
        visitors: Number(r.visitors),
        uniqueVisitors: Number(r.unique_visitors),
        checkins: Number(r.checkins),
      })),
      topPlaces: topPlaces.map(r => ({
        placeId: r.place_id,
        name: r.name,
        city: r.city,
        state: r.state,
        category: r.category,
        visits: Number(r.visits),
      })),
      topViewed: topViewed.map(r => ({
        placeId: r.place_id,
        name: r.name,
        city: r.city,
        views: Number(r.views),
      })),
      topCategories: topCategories.map(r => ({
        category: r.category,
        count: Number(r.count),
      })),
      hiddenGemStats: hiddenGemStats.map(r => ({
        placeId: r.place_id,
        name: r.name,
        city: r.city,
        visits: Number(r.visits),
        views: Number(r.views),
      })),
      reelsByCity: reelsByCity.map(r => ({
        city: r.city,
        count: Number(r.count),
      })),
      avgDuration: avgDuration.map(r => ({
        city: r.city,
        avgMinutes: Number(r.avg_minutes),
      })),
      filters: {
        states,
        cities,
      },
    };
    await cache.set(ck, result, 300);
    return result;
  },
};
