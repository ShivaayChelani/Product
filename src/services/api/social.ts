import { apiClient } from './client';
import { CreatorAnalytics, CreatorDashboard, CreatorProfile, CreatorReelPage, CreatorLeaderboardEntry, Reel, ReelComment } from '../../types';

export const socialApi = {
  async applyCreator(data: {
    username: string;
    fullName: string;
    bio: string;
    travelCategories: string[];
    instagramUrl?: string;
    youtubeUrl?: string;
    sampleReelUrl?: string;
    applicationReason: string;
    avatar?: string;
    portfolioLinks?: string[];
    /** Set after the user confirmed that applying will retire their Vendor role. */
    confirmSwitch?: boolean;
  }) {
    return apiClient.post<CreatorProfile>('/social/creators/apply', data);
  },

  async updateCreatorProfile(data: {
    username?: string;
    bio?: string; avatar?: string; fullName?: string; travelCategories?: string[];
    instagramUrl?: string; youtubeUrl?: string; facebookUrl?: string;
    languages?: string[]; portfolioLinks?: string[];
  }) {
    return apiClient.patch<CreatorProfile>('/social/creators/profile', data);
  },

  async checkUsernameAvailability(username: string) {
    return apiClient.get<{ available: boolean; message?: string; username?: string }>(
      `/social/creators/check-username?username=${encodeURIComponent(username)}`
    );
  },

  async getCreatorDashboard() {
    return apiClient.get<CreatorDashboard>('/social/creators/me/dashboard');
  },

  async getCreatorAnalytics(period: '7d' | '30d' | 'all') {
    return apiClient.get<CreatorAnalytics>(`/social/creators/me/analytics?period=${period}`);
  },

  async getMyReels(page = 1, limit = 20) {
    return apiClient.get<CreatorReelPage>(`/social/creators/me/reels?page=${page}&limit=${limit}`);
  },

  async getCreatorLeaderboard(limit = 20) {
    return apiClient.get<CreatorLeaderboardEntry[]>(`/social/creators/leaderboard?limit=${limit}`);
  },

  async getCreatorProfile(username: string) {
    return apiClient.get<CreatorProfile>(`/social/creators/${username}`);
  },

  async followCreator(creatorProfileId: string) {
    return apiClient.post<any>(`/social/creators/${creatorProfileId}/follow`);
  },

  async unfollowCreator(creatorProfileId: string) {
    return apiClient.delete<any>(`/social/creators/${creatorProfileId}/follow`);
  },

  async createReel(data: {
    videoUrl: string;
    thumbnail?: string;
    title?: string;
    description?: string;
    placeId?: string;
    vendorId?: string;
    eventId?: string;
  }) {
    return apiClient.post<Reel>('/social/reels', data);
  },

  async getReelsFeed(params?: {
    category?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    page?: number;
    limit?: number;
  }) {
    const urlParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) urlParams.set(k, String(v));
      });
    }
    const qs = urlParams.toString();
    return apiClient.get<Reel[]>(`/social/reels${qs ? `?${qs}` : ''}`);
  },

  async getReelById(reelId: string) {
    return apiClient.get<Reel>(`/social/reels/${reelId}`);
  },

  async likeReel(reelId: string) {
    return apiClient.post<any>(`/social/reels/${reelId}/like`);
  },

  async unlikeReel(reelId: string) {
    return apiClient.delete<any>(`/social/reels/${reelId}/like`);
  },

  async saveReel(reelId: string) {
    return apiClient.post<any>(`/social/reels/${reelId}/save`);
  },

  async unsaveReel(reelId: string) {
    return apiClient.delete<any>(`/social/reels/${reelId}/save`);
  },

  async addComment(reelId: string, text: string) {
    return apiClient.post<ReelComment>(`/social/reels/${reelId}/comments`, { text });
  },

  async getComments(reelId: string) {
    return apiClient.get<ReelComment[]>(`/social/reels/${reelId}/comments`);
  },

  async reportReel(reelId: string, reason: string) {
    return apiClient.post<any>(`/social/reels/${reelId}/report`, { reason });
  },

  async incrementViews(reelId: string) {
    return apiClient.patch<any>(`/social/reels/${reelId}/views`);
  },

  async updateReel(
    reelId: string,
    data: { title?: string; description?: string; thumbnail?: string; placeId?: string; vendorId?: string; tags?: string[] }
  ) {
    return apiClient.patch<Reel>(`/social/reels/${reelId}`, data);
  },

  async deleteReel(reelId: string) {
    return apiClient.delete<void>(`/social/reels/${reelId}`);
  },

  async getAdminReels(params: { page?: number; limit?: number; q?: string } = {}) {
    const urlParams = new URLSearchParams();
    if (params.page) urlParams.set('page', String(params.page));
    if (params.limit) urlParams.set('limit', String(params.limit));
    if (params.q) urlParams.set('q', params.q);
    const qs = urlParams.toString();
    const res = await apiClient.get<any>(`/social/admin/reels${qs ? `?${qs}` : ''}`);
    return (res as any)?.data ?? res;
  },

  async adminDeleteReel(reelId: string) {
    return apiClient.delete<void>(`/social/admin/reels/${reelId}`);
  },

  async adminToggleFeatureReel(reelId: string) {
    return apiClient.patch<any>(`/social/admin/reels/${reelId}/feature`, {});
  },
};
