import { apiClient } from './client';

export interface WalletProfileResponse {
  userId: string;
  palPoints: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  email?: string;
  palPoints: number;
  lifetimeEarned?: number;
  roleLabel?: string;
}


export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  stats?: {
    totalUsers?: number;
    averagePoints?: number;
    topScore?: number;
  };
}

export const gamificationApi = {
  async getLeaderboard(page = 1, limit = 50): Promise<LeaderboardResponse> {
    const res = await apiClient.get<any>(`/wallet/leaderboard?page=${page}&limit=${limit}`);
    if (res.success && res.data) {
      const items = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.data)
          ? res.data.data
          : [];
      return {
        entries: items,
        stats: res.data.stats,
      };
    }
    return { entries: [] };
  },

  async getProfile(): Promise<WalletProfileResponse> {
    try {
      const res = await apiClient.get<any>('/wallet/profile');
      if (res.success && res.data) {
        const d = res.data;
        return {
          userId: d.userId || d.id || '',
          palPoints: d.palPoints || 0,
          lifetimeEarned: d.lifetimeEarned || 0,
          lifetimeSpent: d.lifetimeSpent || 0,
        };
      }
    } catch {
      // fall through
    }
    return {
      userId: '', palPoints: 0, lifetimeEarned: 0, lifetimeSpent: 0,
    };
  },
};
