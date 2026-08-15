import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { socialService } from '../social/social.service';
import { ReelStatus } from '@prisma/client';

const RESOURCE_HASHTAGS = [
  { tag: '#IncredibleIndia', posts: '2.1M' },
  { tag: '#HiddenGems', posts: '890K' },
  { tag: '#TravelReels', posts: '1.4M' },
  { tag: '#PalSafar', posts: '12K' },
];

const RESOURCE_AUDIO = [
  { title: 'Wanderlust Beats', uses: '45K' },
  { title: 'Mountain Echo', uses: '32K' },
  { title: 'Coastal Vibes', uses: '28K' },
];

function periodDays(period: string): number {
  if (period === '30d') return 30;
  if (period === '90d') return 90;
  if (period === 'custom') return 30;
  return 7;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function getApprovedProfile(userId: string) {
  return socialService.getApprovedCreatorProfile(userId);
}

export const creatorService = {
  async getDashboard(userId: string) {
    const base = await socialService.getCreatorDashboard(userId);
    const profile = await getApprovedProfile(userId);

    const todayStart = startOfDay(new Date());
    const [totals, reelsToday, draftCount, hiddenCount] = await Promise.all([
      prisma.reel.aggregate({
        where: { creatorId: profile.id, status: { in: [ReelStatus.APPROVED, ReelStatus.PENDING] } },
        _sum: { views: true, likes: true, shares: true, saves: true },
      }),
      prisma.reel.count({
        where: { creatorId: profile.id, createdAt: { gte: todayStart }, status: { not: ReelStatus.HIDDEN } },
      }),
      prisma.reel.count({ where: { creatorId: profile.id, status: ReelStatus.DRAFT } }),
      prisma.reel.count({ where: { creatorId: profile.id, status: ReelStatus.HIDDEN } }),
    ]);

    let todayGoal: { title: string; description: string; cta: string; ctaAction: string };
    if (draftCount > 0) {
      todayGoal = {
        title: 'Publish your draft',
        description: `You have ${draftCount} draft reel${draftCount > 1 ? 's' : ''} ready to publish.`,
        cta: 'View Drafts',
        ctaAction: 'drafts',
      };
    } else if (reelsToday === 0) {
      todayGoal = {
        title: 'Upload 1 Reel',
        description: 'Share your latest travel moment with the PalSafar community.',
        cta: 'Create Reel',
        ctaAction: 'create_reel',
      };
    } else {
      todayGoal = {
        title: 'Review your analytics',
        description: 'See how your content performed this week.',
        cta: 'View Insights',
        ctaAction: 'insights',
      };
    }

    const views = totals._sum.views ?? 0;
    const likes = totals._sum.likes ?? 0;
    const shares = totals._sum.shares ?? 0;
    const saves = totals._sum.saves ?? 0;

    return {
      profile: base.profile,
      todayGoal,
      overview: {
        views,
        followers: base.profile.followerCount,
        reels: base.reelCount,
        likes,
        comments: base.totalComments,
        shares,
        saved: saves,
        reach: views,
      },
      reelCount: base.reelCount,
      draftCount,
      archivedCount: hiddenCount,
    };
  },

  async getAnalytics(userId: string, period = '7d') {
    const allowed = ['7d', '30d', '90d', 'all', 'custom'];
    if (!allowed.includes(period)) {
      throw new ApiError(400, 'Period must be one of 7d, 30d, 90d, all, custom.');
    }

    const profile = await getApprovedProfile(userId);
    const days = period === 'all' ? 90 : periodDays(period);
    const since = period === 'all' ? undefined : startOfDay(new Date(Date.now() - days * 86400000));

    const reels = await prisma.reel.findMany({
      where: {
        creatorId: profile.id,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { views: true, likes: true, shares: true, saves: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const bucketMap = new Map<string, { views: number; likes: number; shares: number }>();
    const bucketCount = period === 'all' ? 90 : days;

    for (let i = bucketCount - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      bucketMap.set(key, { views: 0, likes: 0, shares: 0 });
    }

    reels.forEach(r => {
      const key = r.createdAt.toISOString().slice(0, 10);
      if (!bucketMap.has(key)) return;
      const b = bucketMap.get(key)!;
      b.views += r.views;
      b.likes += r.likes;
      b.shares += r.shares;
    });

    const dailySeries = [...bucketMap.entries()].map(([date, v]) => ({
      date,
      views: v.views,
      likes: v.likes,
      shares: v.shares,
    }));

    const totals = reels.reduce(
      (acc, r) => ({
        views: acc.views + r.views,
        likes: acc.likes + r.likes,
        shares: acc.shares + r.shares,
        saves: acc.saves + r.saves,
      }),
      { views: 0, likes: 0, shares: 0, saves: 0 },
    );

    const comments = await prisma.reelComment.count({
      where: { reel: { creatorId: profile.id, ...(since ? { createdAt: { gte: since } } : {}) } },
    });

    const topReels = await prisma.reel.findMany({
      where: { creatorId: profile.id },
      orderBy: { views: 'desc' },
      take: 5,
      include: { creator: { select: { id: true, username: true, avatar: true, verified: true } } },
    });

    return {
      period,
      kpis: {
        views: totals.views,
        likes: totals.likes,
        comments,
        shares: totals.shares,
        saves: totals.saves,
        engagementRate: totals.views
          ? Number((((totals.likes + comments + totals.saves) / totals.views) * 100).toFixed(2))
          : 0,
      },
      dailySeries,
      topReels,
    };
  },

  async getProfile(userId: string) {
    let profile = await prisma.creatorProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const defaultUsername = `creator_${Date.now()}`;
      profile = await prisma.creatorProfile.create({
        data: {
          userId,
          username: defaultUsername,
          fullName: user?.name || 'Creator',
          status: 'APPROVED',
        },
      });
    }
    return profile;
  },

  async getResources() {
    return {
      hashtags: RESOURCE_HASHTAGS,
      audio: RESOURCE_AUDIO,
      contentIdeas: [
        { title: 'Sunrise at a hidden viewpoint', category: 'Photography' },
        { title: 'Local street food tour', category: 'Food' },
        { title: 'Weekend getaway under ₹5000', category: 'Budget' },
      ],
      photographyTips: [
        'Shoot during golden hour for warm tones.',
        'Use leading lines to draw the eye.',
        'Keep horizons level with grid lines.',
      ],
      editingTips: [
        'Trim the first 2 seconds for stronger hooks.',
        'Add captions for silent viewers.',
        'Keep reels under 60 seconds for retention.',
      ],
      tourismEvents: [
        { name: 'Hornbill Festival', location: 'Nagaland', month: 'December' },
        { name: 'Pushkar Fair', location: 'Rajasthan', month: 'November' },
      ],
    };
  },

  async listReels(userId: string, query: { page?: string; limit?: string; status?: string }) {
    const profile = await getApprovedProfile(userId);
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    const statusFilter = query.status?.toUpperCase();
    const where: { creatorId: string; status?: ReelStatus } = { creatorId: profile.id };
    if (statusFilter && Object.values(ReelStatus).includes(statusFilter as ReelStatus)) {
      where.status = statusFilter as ReelStatus;
    }

    const [items, total] = await Promise.all([
      prisma.reel.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: { select: { id: true, username: true, avatar: true, verified: true, userId: true } },
          place: { select: { id: true, name: true } },
          _count: { select: { comments: true, likesList: true, savesList: true } },
        },
      }),
      prisma.reel.count({ where }),
    ]);

    return {
      items: items.map(item => ({
        ...item,
        likes: item._count?.likesList ?? item.likes ?? 0,
        commentsCount: item._count?.comments ?? 0,
        saves: item._count?.savesList ?? item.saves ?? 0,
        views: item.views ?? 0,
        shares: item.shares ?? 0,
        _count: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async createDraft(
    userId: string,
    input: {
      videoUrl: string;
      thumbnail?: string;
      title?: string;
      description?: string;
      placeId?: string;
      vendorId?: string;
    },
  ) {
    const profile = await getApprovedProfile(userId);
    let resolvedPlaceId: string | null = null;
    if (input.placeId?.trim()) {
      const foundPlace = await prisma.place.findFirst({
        where: {
          OR: [
            { id: input.placeId },
            { slug: input.placeId },
            { name: { equals: input.placeId, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      resolvedPlaceId = foundPlace?.id ?? null;
    }
    return prisma.reel.create({
      data: {
        creatorId: profile.id,
        videoUrl: input.videoUrl,
        thumbnail: input.thumbnail,
        title: input.title,
        description: input.description,
        placeId: resolvedPlaceId,
        vendorId: input.vendorId,
        status: ReelStatus.DRAFT,
      },
    });
  },

  async publishDraft(userId: string, reelId: string) {
    const profile = await getApprovedProfile(userId);
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.creatorId !== profile.id) throw new ApiError(404, 'Draft not found.');
    if (reel.status !== ReelStatus.DRAFT) throw new ApiError(400, 'Only drafts can be published this way.');
    const updated = await prisma.reel.update({
      where: { id: reelId },
      data: { status: ReelStatus.APPROVED },
    });
    const reward = await socialService.awardDailyReelUploadReward(userId, profile.id, reelId);
    return {
      ...updated,
      rewardPoints: reward.rewardPoints,
      dailyRewardClaimed: reward.dailyRewardClaimed,
      dailyRewardDate: reward.dailyRewardDate,
    };
  },

  async getReelAnalytics(userId: string, reelId: string) {
    const profile = await getApprovedProfile(userId);
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel || reel.creatorId !== profile.id) throw new ApiError(404, 'Reel not found.');

    const [comments, likes, saves] = await Promise.all([
      prisma.reelComment.count({ where: { reelId } }),
      prisma.reelLike.count({ where: { reelId } }),
      prisma.reelSave.count({ where: { reelId } }),
    ]);
    return {
      reelId,
      views: reel.views,
      likes,
      shares: reel.shares,
      saves,
      comments,
      engagementRate: reel.views
        ? Number((((likes + comments + saves) / reel.views) * 100).toFixed(2))
        : 0,
    };
  },

  async getCollaborations(userId: string, query?: { page?: string; limit?: string; bucket?: string; search?: string }) {
    await getApprovedProfile(userId);
    const { collaborationsService } = await import('../collaborations/collaborations.service');
    const result = await collaborationsService.listForCreator(userId, {
      page: query?.page,
      limit: query?.limit,
      bucket: query?.bucket as any,
      search: query?.search,
    });
    return { items: result.data, pagination: result.pagination };
  },

  async getLeaderboard(limit = 20) {
    return socialService.getCreatorLeaderboard(String(limit));
  },

  async getChallenges(userId: string) {
    const challenges = await prisma.challenge.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return challenges;
  },
};
