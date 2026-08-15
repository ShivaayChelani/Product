import { prisma } from '../../config/database';
import { cache, cacheKey } from '../../config/cache';

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export const analyticsService = {
  async getDashboard() {
    const ck = cacheKey('analytics', 'dashboard_v3');
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 86400000);

    // CTE 1: All scalar KPIs in a single query using FILTER clauses
    const kpis = await safeQuery(async () => {
      const r = await prisma.$queryRaw<any[]>`
        WITH
          user_c AS (SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at < ${today})::int AS total_prev,
            COUNT(*) FILTER (WHERE created_at >= ${today})::int AS new_today
          FROM users),
          vendor_c AS (SELECT
            COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
            COUNT(*) FILTER (WHERE status = 'APPROVED' AND created_at < ${today})::int AS approved_prev,
            COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
          FROM vendors),
          checkin_c AS (SELECT
            COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${today})::int AS dau,
            COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${yesterday} AND created_at < ${today})::int AS dau_prev,
            COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${thirtyDaysAgo})::int AS mau,
            COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${sixtyDaysAgo} AND created_at < ${thirtyDaysAgo})::int AS mau_prev,
            COUNT(*) FILTER (WHERE created_at >= ${today})::int AS checkins_today
          FROM check_ins),
          redemption_c AS (SELECT
            COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS total,
            COUNT(*) FILTER (WHERE status = 'VERIFIED' AND created_at < ${today})::int AS total_prev,
            COUNT(*) FILTER (WHERE status = 'VERIFIED' AND created_at >= ${today})::int AS today_qty
          FROM redemptions),
          place_c AS (SELECT COUNT(*)::int AS cnt FROM places WHERE source = 'HIDDEN_GEM' AND status = 'PENDING'),
          reel_c AS (SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE created_at < ${today})::int AS prev
          FROM reels),
          review_c AS (SELECT COUNT(*) FILTER (WHERE created_at >= ${today})::int AS reviews_today FROM reviews)
        SELECT * FROM user_c, vendor_c, checkin_c, redemption_c, place_c, reel_c, review_c
      `;
      return r[0] || {};
    }, {});

    // CTE 2: Growth chart data (30-day user/vendor growth)
    const [userGrowthRaw, vendorGrowthRaw] = await Promise.all([
      safeQuery(() => prisma.$queryRaw<{ date: string; new_users: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(*)::int as new_users
        FROM users WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at) ORDER BY date ASC
      `, []),
      safeQuery(() => prisma.$queryRaw<{ date: string; new_vendors: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(*)::int as new_vendors
        FROM vendors WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at) ORDER BY date ASC
      `, []),
    ]);

    // CTE 3: Redemption pie chart + city analytics in one query each
    const [redemptionsOverviewRaw, cityAnalyticsRaw] = await Promise.all([
      safeQuery(() => prisma.$queryRaw<{ category: string; count: bigint }[]>`
        SELECT COALESCE(vo.category, 'Other') as category, COUNT(r.id)::int as count
        FROM redemptions r LEFT JOIN vendor_offers vo ON r.offer_id = vo.id
        WHERE r.status = 'VERIFIED'
        GROUP BY vo.category ORDER BY count DESC
      `, []),
      safeQuery(() => prisma.$queryRaw<{ city: string; users: bigint }[]>`
        SELECT COALESCE(p.city, 'Unknown') as city, COUNT(DISTINCT c.user_id)::int as users
        FROM check_ins c JOIN places p ON c.place_id = p.id
        GROUP BY p.city ORDER BY users DESC LIMIT 5
      `, []),
    ]);

    // CTE 4: Recent activity
    const recentActivityRaw = await safeQuery(() => prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } }
    }), []);

    const result = {
      kpis: {
        totalUsers: { value: kpis.total || 0, prev: kpis.total_prev || 0 },
        dau: { value: kpis.dau || 0, prev: kpis.dau_prev || 0 },
        mau: { value: kpis.mau || 0, prev: kpis.mau_prev || 0 },
        activeVendors: { value: kpis.approved || 0, prev: kpis.approved_prev || 0 },
        qrRedemptions: { value: kpis.total || 0, prev: kpis.total_prev || 0 },
        hiddenGems: { value: kpis.cnt || 0 },
        reelsUploaded: { value: kpis.total || 0, prev: kpis.prev || 0 },
      },
      charts: {
        userGrowth: (userGrowthRaw as any[]).map((r: any) => ({
          date: r.date, newUsers: Number(r.new_users),
        })),
        vendorGrowth: (vendorGrowthRaw as any[]).map((r: any) => ({
          date: r.date, vendors: Number(r.new_vendors),
        })),
        redemptionsPie: (redemptionsOverviewRaw as any[]).map((r: any) => ({
          name: r.category || 'Other', value: Number(r.count),
        })),
      },
      cityAnalytics: (cityAnalyticsRaw as any[]).map((r: any) => ({
        city: r.city || 'Unknown', users: Number(r.users),
      })),
      pendingApprovals: {
        hiddenGems: kpis.cnt || 0,
        vendors: kpis.pending || 0,
      },
      recentActivity: (recentActivityRaw as any[]).map((a: any) => ({
        id: a.id, action: a.action,
        user: a.actor?.name || 'System',
        target: a.entityType, time: a.createdAt,
      })),
      quickStats: {
        newUsers: kpis.new_today || 0,
        reelsUploaded: Math.max(0, (kpis.total || 0) - (kpis.prev || 0)),
        reviews: kpis.reviews_today || 0,
        checkIns: kpis.checkins_today || 0,
        qrRedeemed: kpis.today_qty || 0,
      },
    };

    await cache.set(ck, result, 300);
    return result;
  },

  async getPlacesAnalytics(query: { page?: string; limit?: string }) {
    const ck = cacheKey('analytics', 'places', query.page || '1', query.limit || '20');
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    const pagination = { skip: 0, take: 20 };
    const data = await prisma.place.findMany({
      select: {
        id: true, name: true, category: true, status: true, createdAt: true,
        _count: { select: { stats: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });

    const result = data.map((p) => ({
      ...p, statsCount: p._count.stats, _count: undefined,
    }));

    await cache.set(ck, result, 300);
    return result;
  },

  async getCitiesDashboard() {
    const ck = cacheKey('analytics', 'cities');
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    const raw = await prisma.$queryRaw<{ city: string; users: bigint; checkIns: bigint }[]>`
      SELECT COALESCE(p.city, 'Unknown') as city,
        COUNT(DISTINCT c.user_id)::int as users,
        COUNT(c.id)::int as "checkIns"
      FROM check_ins c
      JOIN places p ON c.place_id = p.id
      WHERE p.city IS NOT NULL AND p.city != ''
      GROUP BY p.city
      ORDER BY users DESC
    `;
    const result = raw.map((r) => ({
      city: r.city, users: Number(r.users), checkIns: Number(r.checkIns),
    }));
    await cache.set(ck, result, 300);
    return result;
  },

  async getGrowthDashboard() {
    const ck = cacheKey('analytics', 'growth');
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [userGrowthRaw, vendorGrowthRaw] = await Promise.all([
      prisma.$queryRaw<{ date: string; new_users: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(*)::int as new_users
        FROM users WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at) ORDER BY date ASC
      `,
      prisma.$queryRaw<{ date: string; new_vendors: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(*)::int as new_vendors
        FROM vendors WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at) ORDER BY date ASC
      `,
    ]);

    const result = {
      userGrowth: (userGrowthRaw as any[]).map((r: any) => ({
        date: r.date, newUsers: Number(r.new_users),
      })),
      vendorGrowth: (vendorGrowthRaw as any[]).map((r: any) => ({
        date: r.date, newVendors: Number(r.new_vendors),
      })),
    };
    await cache.set(ck, result, 300);
    return result;
  },

  async getRevenueDashboard() {
    const ck = cacheKey('analytics', 'revenue');
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    const redemptionsOverviewRaw = await prisma.$queryRaw<{ category: string; count: bigint; total: any }[]>`
      SELECT COALESCE(vo.category, 'Other') as category,
        COUNT(r.id)::int as count,
        COALESCE(SUM(vo.points_required), 0)::int as total
      FROM redemptions r
      LEFT JOIN vendor_offers vo ON r.offer_id = vo.id
      WHERE r.status = 'VERIFIED'
      GROUP BY vo.category
    `;
    const totalRevenue = redemptionsOverviewRaw.reduce((s, r) => s + Number(r.total), 0);

    const result = {
      totalRevenue,
      redemptionsPie: redemptionsOverviewRaw.map((r: any) => ({
        name: r.category || 'Other', value: Number(r.count),
      })),
    };
    await cache.set(ck, result, 300);
    return result;
  },

  async getUsersAnalytics() {
    const ck = cacheKey('analytics', 'users');
    const cached = await cache.get<any>(ck);
    if (cached) return cached;

    const queryResult = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(created_at)::text AS date, COUNT(*)::int AS count
      FROM users GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
    `;

    const result = queryResult.map((r: any) => ({
      date: r.date, count: Number(r.count),
    }));

    await cache.set(ck, result, 300);
    return result;
  },
};
