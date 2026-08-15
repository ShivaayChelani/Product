import { prisma } from '../../config/database';
import { cache, cacheKey } from '../../config/cache';

export const growthAnalyticsService = {
  async getDashboard(params: {
    from?: string;
    to?: string;
  }) {
    const ck = cacheKey('growth-analytics', params.from || 'all', params.to || 'all');
    const cached = await cache.get(ck);
    if (cached) return cached;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const fromDate = params.from ? new Date(params.from) : new Date(todayStart.getTime() - 30 * 86400000);
    const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : todayEnd;

    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000);
    const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
    const monthAgo = new Date(todayStart.getTime() - 30 * 86400000);

    // Total Users
    const totalUsers = await prisma.user.count();

    // New Users Today / Week / Month
    const [newToday, newThisWeek, newThisMonth] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
    ]);

    // DAU / WAU / MAU (using check_ins as proxy for active users)
    const [dau, wau, mau] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT user_id) as count FROM check_ins WHERE created_at >= ${todayStart}`,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT user_id) as count FROM check_ins WHERE created_at >= ${weekAgo}`,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT user_id) as count FROM check_ins WHERE created_at >= ${monthAgo}`,
    ]);

    // D1 / D7 / D30 Retention (users who signed up and later checked in)
    const retentionRaw = await prisma.$queryRaw<{ period: string; rate: number }[]>`
      WITH signups AS (
        SELECT id, DATE(created_at) as signup_date
        FROM users
        WHERE created_at >= ${new Date(monthAgo.getTime() - 60 * 86400000)}
      ),
      retention AS (
        SELECT
          s.id,
          s.signup_date,
          COUNT(DISTINCT DATE(c.created_at)) FILTER (
            WHERE c.created_at >= s.signup_date + INTERVAL '1 day'
              AND c.created_at < s.signup_date + INTERVAL '2 days'
          ) AS d1,
          COUNT(DISTINCT DATE(c.created_at)) FILTER (
            WHERE c.created_at >= s.signup_date + INTERVAL '7 days'
              AND c.created_at < s.signup_date + INTERVAL '8 days'
          ) AS d7,
          COUNT(DISTINCT DATE(c.created_at)) FILTER (
            WHERE c.created_at >= s.signup_date + INTERVAL '30 days'
              AND c.created_at < s.signup_date + INTERVAL '31 days'
          ) AS d30
        FROM signups s
        LEFT JOIN check_ins c ON c.user_id = s.id
        GROUP BY s.id, s.signup_date
      )
      SELECT
        'd1' as period,
        CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE d1 > 0)::numeric / COUNT(*) * 100, 1) END as rate
      FROM retention
      UNION ALL
      SELECT 'd7', CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE d7 > 0)::numeric / COUNT(*) * 100, 1) END FROM retention
      UNION ALL
      SELECT 'd30', CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE d30 > 0)::numeric / COUNT(*) * 100, 1) END FROM retention
    `;

    const retention: Record<string, number> = { d1: 0, d7: 0, d30: 0 };
    for (const r of retentionRaw) {
      retention[r.period] = Number(r.rate);
    }

    // Daily Signup Chart
    const dailySignups = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Active Users Trend (DAU per day)
    const activeTrend = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(created_at) as date, COUNT(DISTINCT user_id)::int as count
      FROM check_ins
      WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Fill in missing dates
    const dateMap = new Map<string, { signups: number; active: number }>();
    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 86400000)) {
      const key = d.toISOString().split('T')[0];
      dateMap.set(key, { signups: 0, active: 0 });
    }
    for (const r of dailySignups) {
      const key = typeof r.date === 'string' ? r.date.split('T')[0] : r.date;
      if (dateMap.has(key)) dateMap.get(key)!.signups = Number(r.count);
    }
    for (const r of activeTrend) {
      const key = typeof r.date === 'string' ? r.date.split('T')[0] : r.date;
      if (dateMap.has(key)) dateMap.get(key)!.active = Number(r.count);
    }

    const trendData = Array.from(dateMap.entries()).map(([date, v]) => ({
      date,
      signups: v.signups,
      activeUsers: v.active,
    }));

    // Weekly growth (cumulative user count)
    let weeklyGrowth: { week: string; newUsers: number; totalUsers: number }[] = [];
    if (daysDiff > 60) {
      const weeklyRaw = await prisma.$queryRaw<{ week: string; count: bigint }[]>`
        SELECT DATE_TRUNC('week', created_at)::date as week, COUNT(*)::int as count
        FROM users
        WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week ASC
      `;
      let cumulative = await prisma.user.count({ where: { createdAt: { lt: fromDate } } });
      weeklyGrowth = weeklyRaw.map((r) => {
        cumulative += Number(r.count);
        return { week: r.week, newUsers: Number(r.count), totalUsers: cumulative };
      });
    }

    // Monthly growth
    const monthlyRaw = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT DATE_TRUNC('month', created_at)::date as month, COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${fromDate} AND created_at <= ${toDate}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `;
    let monthlyCumulative = await prisma.user.count({ where: { createdAt: { lt: fromDate } } });
    const monthlyGrowth = monthlyRaw.map((r) => {
      monthlyCumulative += Number(r.count);
      return { month: r.month, newUsers: Number(r.count), totalUsers: monthlyCumulative };
    });

    const result = {
      metrics: {
        totalUsers,
        newUsersToday: newToday,
        newUsersThisWeek: newThisWeek,
        newUsersThisMonth: newThisMonth,
        dau: Number(dau[0]?.count || 0),
        wau: Number(wau[0]?.count || 0),
        mau: Number(mau[0]?.count || 0),
        d1Retention: retention.d1,
        d7Retention: retention.d7,
        d30Retention: retention.d30,
      },
      charts: {
        dailySignups: trendData,
        weeklyGrowth,
        monthlyGrowth,
        activeUsersTrend: trendData.map(d => ({ date: d.date, activeUsers: d.activeUsers })),
        userGrowthTrend: trendData.map(d => ({ date: d.date, signups: d.signups })),
      },
    };
    await cache.set(ck, result, 300);
    return result;
  },
};
