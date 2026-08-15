import { prisma } from '../../../config/database';
import { eventBus, AppEvents } from '../../../config/events';
import { resolvePlace } from './places.helpers';

export const placesStatsService = {
  async recordStat(placeIdOrSlug: string, action: string, userId?: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);

    await prisma.placeStat.create({
      data: { placeId, userId: userId || null, action },
    });

    eventBus.emit(AppEvents.STAT_RECORDED, { placeId, userId, action });
  },

  async getStats(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);

    const [views, likes, saves, shares, gameCompletions] = await Promise.all([
      prisma.placeStat.count({ where: { placeId, action: 'view' } }),
      prisma.placeStat.count({ where: { placeId, action: 'like' } }),
      prisma.placeStat.count({ where: { placeId, action: 'save' } }),
      prisma.placeStat.count({ where: { placeId, action: 'share' } }),
      prisma.placeStat.count({ where: { placeId, action: 'game_complete' } }),
    ]);

    return { views, likes, saves, shares, gameCompletions };
  },

  async getAnalytics(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const [
      totalViews, totalLikes, totalSaves, totalShares, totalCheckins,
      recentViews, recentLikes,
      reviewStats,
      dailyStats,
      checkinCount,
    ] = await Promise.all([
      prisma.placeStat.count({ where: { placeId, action: 'view' } }),
      prisma.placeStat.count({ where: { placeId, action: 'like' } }),
      prisma.placeStat.count({ where: { placeId, action: 'save' } }),
      prisma.placeStat.count({ where: { placeId, action: 'share' } }),
      prisma.placeStat.count({ where: { placeId, action: 'checkin' } }),
      prisma.placeStat.count({ where: { placeId, action: 'view', createdAt: { gte: sevenDaysAgo } } }),
      prisma.placeStat.count({ where: { placeId, action: 'like', createdAt: { gte: sevenDaysAgo } } }),
      prisma.review.aggregate({ where: { placeId, status: 'APPROVED' }, _avg: { rating: true }, _count: true }),
      prisma.$queryRaw`
        SELECT
          DATE(created_at) AS day,
          COUNT(*) FILTER (WHERE action = 'view') AS views,
          COUNT(*) FILTER (WHERE action = 'like') AS likes,
          COUNT(*) FILTER (WHERE action = 'save') AS saves
        FROM place_stats
        WHERE "placeId" = ${placeId}
          AND created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `,
      prisma.checkIn.count({ where: { placeId } }),
    ]);

    return {
      overview: {
        totalViews,
        totalLikes,
        totalSaves,
        totalShares,
        totalCheckins,
        totalCheckinsAll: checkinCount,
        averageRating: reviewStats._avg.rating ? Number(reviewStats._avg.rating.toFixed(1)) : null,
        totalReviews: reviewStats._count,
      },
      trends: {
        views7d: recentViews,
        likes7d: recentLikes,
        engagement7d: recentViews + recentLikes,
      },
      daily: (dailyStats as any[]).map((d: any) => ({
        date: d.day,
        views: Number(d.views),
        likes: Number(d.likes),
        saves: Number(d.saves),
      })),
    };
  },
};
