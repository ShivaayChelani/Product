import { apiClient, type StandardApiResponse } from '../../../services/api/client';
import { socialApi } from '../../../services/api/social';
import type { CreatorAnalytics, CreatorDashboard, CreatorProfile, Reel } from '../../../types';

export interface CreatorTodayGoal {
  title: string;
  description: string;
  cta: string;
  ctaAction: string;
}

export interface CreatorOverview {
  views: number;
  followers: number;
  reels: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  reach: number;
}

export interface CreatorDashboardPayload {
  profile: CreatorProfile & { followingCount: number };
  todayGoal: CreatorTodayGoal;
  overview: CreatorOverview;
  reelCount: number;
  draftCount: number;
  archivedCount: number;
}

export interface CreatorDailyPoint {
  date: string;
  views: number;
  likes: number;
  shares: number;
}

export interface CreatorAnalyticsPayload {
  period: string;
  kpis: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
  };
  dailySeries: CreatorDailyPoint[];
  topReels: Reel[];
}

export interface CreatorReelsPage {
  items: (Reel & { commentsCount?: number })[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreatorResources {
  hashtags: { tag: string; posts: string }[];
  audio: { title: string; uses: string }[];
  contentIdeas: { title: string; category: string }[];
  photographyTips: string[];
  editingTips: string[];
  tourismEvents: { name: string; location: string; month: string }[];
}

const EMPTY_CREATOR_RESOURCES: CreatorResources = {
  hashtags: [],
  audio: [],
  contentIdeas: [],
  photographyTips: [],
  editingTips: [],
  tourismEvents: [],
};

function isRouteNotFound(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? '').toLowerCase();
  return status === 404 || message.includes('route not found');
}

async function withCreatorFallback<T>(
  creatorCall: () => Promise<StandardApiResponse<T>>,
  fallback: () => Promise<StandardApiResponse<T>>,
): Promise<StandardApiResponse<T>> {
  try {
    return await creatorCall();
  } catch (err) {
    if (!isRouteNotFound(err)) throw err;
    return fallback();
  }
}

function adaptSocialDashboard(base: CreatorDashboard): CreatorDashboardPayload {
  const views = base.profile.totalViews ?? 0;
  const todayGoal: CreatorTodayGoal =
    base.reelCount === 0
      ? {
          title: 'Upload 1 Reel',
          description: 'Share your latest travel moment with the PalSafar community.',
          cta: 'Create Reel',
          ctaAction: 'create_reel',
        }
      : {
          title: 'Review your analytics',
          description: 'See how your content performed this week.',
          cta: 'View Insights',
          ctaAction: 'insights',
        };

  return {
    profile: base.profile,
    todayGoal,
    overview: {
      views,
      followers: base.profile.followerCount ?? 0,
      reels: base.reelCount,
      likes: base.totalLikes,
      comments: base.totalComments,
      shares: (base.recentReels || []).reduce((sum, reel) => sum + (reel.shares || 0), 0),
      saved: 0,
      reach: views,
    },
    reelCount: base.reelCount,
    draftCount: 0,
    archivedCount: 0,
  };
}

function mapAnalyticsPeriod(period: '7d' | '30d' | '90d' | 'all' | 'custom'): '7d' | '30d' | 'all' {
  if (period === '90d' || period === 'custom') return '30d';
  return period;
}

function adaptSocialAnalytics(base: CreatorAnalytics, period: string): CreatorAnalyticsPayload {
  return {
    period,
    kpis: {
      views: base.kpis.views,
      likes: base.kpis.likes,
      comments: base.kpis.comments,
      shares: (base.topReels || []).reduce((sum, reel) => sum + (reel.shares || 0), 0),
      saves: base.kpis.saves,
      engagementRate: base.kpis.engagementRate,
    },
    dailySeries: [],
    topReels: base.topReels,
  };
}

export const creatorApi = {
  getDashboard() {
    return withCreatorFallback(
      () => apiClient.get<CreatorDashboardPayload>('/creator/dashboard'),
      async () => {
        const res = await socialApi.getCreatorDashboard();
        if (!res.data) return res as unknown as StandardApiResponse<CreatorDashboardPayload>;
        return { ...res, data: adaptSocialDashboard(res.data) };
      },
    );
  },

  getAnalytics(period: '7d' | '30d' | '90d' | 'all' | 'custom' = '7d') {
    return withCreatorFallback(
      () => apiClient.get<CreatorAnalyticsPayload>(`/creator/analytics?period=${period}`),
      async () => {
        const socialPeriod = mapAnalyticsPeriod(period);
        const res = await socialApi.getCreatorAnalytics(socialPeriod);
        if (!res.data) return res as unknown as StandardApiResponse<CreatorAnalyticsPayload>;
        return { ...res, data: adaptSocialAnalytics(res.data, period) };
      },
    );
  },

  getProfile() {
    return withCreatorFallback(
      () => apiClient.get<CreatorProfile>('/creator/profile'),
      async () => {
        const res = await socialApi.getCreatorDashboard();
        if (!res.data?.profile) return res as unknown as StandardApiResponse<CreatorProfile>;
        return { ...res, data: res.data.profile };
      },
    );
  },

  updateProfile(body: Record<string, unknown>) {
    return withCreatorFallback(
      () => apiClient.patch<CreatorProfile>('/creator/profile', body),
      () => socialApi.updateCreatorProfile(body as Parameters<typeof socialApi.updateCreatorProfile>[0]),
    );
  },

  listReels(params?: { page?: number; limit?: number; status?: string }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const status = params?.status?.toUpperCase();

    return withCreatorFallback(
      () => {
        const q = new URLSearchParams();
        if (params?.page) q.set('page', String(params.page));
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.status) q.set('status', params.status);
        const qs = q.toString();
        return apiClient.get<CreatorReelsPage>(`/creator/reels?_t=${Date.now()}${qs ? `&${qs}` : ''}`);
      },
      async () => {
        const res = await socialApi.getMyReels(page, limit);
        if (!res.data) return res as StandardApiResponse<CreatorReelsPage>;
        const items = status
          ? res.data.items.filter(r => String(r.status || 'APPROVED').toUpperCase() === status)
          : res.data.items;
        return {
          ...res,
          data: {
            items,
            pagination: status
              ? { ...res.data.pagination, total: items.length, totalPages: 1 }
              : res.data.pagination,
          },
        };
      },
    );
  },

  createReel(body: {
    videoUrl: string;
    thumbnail?: string;
    title?: string;
    description?: string;
    placeId?: string;
    vendorId?: string;
  }) {
    return withCreatorFallback(
      () => apiClient.post<Reel>('/creator/reels', body),
      () => socialApi.createReel(body),
    );
  },

  saveDraft(body: {
    videoUrl: string;
    thumbnail?: string;
    title?: string;
    description?: string;
    placeId?: string;
    vendorId?: string;
  }) {
    return apiClient.post<Reel>('/creator/drafts', body);
  },

  publishDraft(id: string) {
    return apiClient.post<Reel>(`/creator/drafts/${id}/publish`);
  },

  deleteReel(id: string) {
    return withCreatorFallback(
      () => apiClient.delete(`/creator/reels/${id}`),
      () => socialApi.deleteReel(id),
    );
  },

  getReelAnalytics(id: string) {
    return withCreatorFallback(
      () =>
        apiClient.get<{
          reelId: string;
          views: number;
          likes: number;
          shares: number;
          saves: number;
          comments: number;
          engagementRate: number;
        }>(`/creator/reels/${id}/analytics`),
      async () => {
        const res = await socialApi.getReelById(id);
        const reel = res.data;
        if (!reel) return res as unknown as StandardApiResponse<never>;
        const comments = (reel as Reel & { commentsCount?: number }).commentsCount ?? 0;
        const views = reel.views ?? 0;
        return {
          ...res,
          data: {
            reelId: id,
            views,
            likes: reel.likes ?? 0,
            shares: reel.shares ?? 0,
            saves: reel.saves ?? 0,
            comments,
            engagementRate: views
              ? Number((((reel.likes ?? 0) + comments + (reel.saves ?? 0)) / views) * 100).toFixed(2)
              : 0,
          },
        };
      },
    );
  },

  getResources() {
    return withCreatorFallback(
      () => apiClient.get<CreatorResources>('/creator/resources'),
      async () => ({
        success: true,
        data: EMPTY_CREATOR_RESOURCES,
        message: 'Creator resources',
      }),
    );
  },

  getCollaborations() {
    return withCreatorFallback(
      () => apiClient.get<{ items: unknown[] }>('/creator/collaborations'),
      async () => ({
        success: true,
        data: { items: [] },
        message: 'Collaborations',
      }),
    );
  },

  getChallenges() {
    return withCreatorFallback(
      () => apiClient.get<unknown[]>('/creator/challenges'),
      async () => ({
        success: true,
        data: [],
        message: 'Challenges',
      }),
    );
  },

  getLeaderboard(limit = 20) {
    return withCreatorFallback(
      () => apiClient.get<unknown[]>(`/creator/leaderboard?limit=${limit}`),
      () => socialApi.getCreatorLeaderboard(limit),
    );
  },
};
