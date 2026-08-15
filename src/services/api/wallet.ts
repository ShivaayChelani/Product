import { apiClient } from './client';

export interface WalletProfile {
  id: string;
  userId: string;
  palPoints: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  recentTransactions: WalletTransaction[];
  thisMonthEarned?: number;
  thisMonthRedeemed?: number;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  userId: string;
  amount: number;
  type: 'EARN' | 'SPEND' | 'REFUND';
  reason: string;
  referenceId: string | null;
  referenceType: string | null;
  metadata: any;
  createdAt: string;
}

export const walletApi = {
  async getProfile() {
    return apiClient.get<WalletProfile>('/wallet/profile');
  },

  async getTransactions(page = 1, limit = 20) {
    return apiClient.get<WalletTransaction[]>(`/wallet/transactions?page=${page}&limit=${limit}`);
  },

  async earn(amount: number, reason: string, userId: string, referenceId?: string, referenceType?: string) {
    return apiClient.post('/wallet/earn', { amount, reason, userId, referenceId, referenceType });
  },

  async adjustWallet(userId: string, data: { palPoints?: number; totalXp?: number; reason: string }) {
    return apiClient.post(`/wallet/adjust/${userId}`, data);
  },

  async completeGame(gameName = 'Memory Match') {
    const res = await apiClient.post<{ success: boolean; palPoints: number }>('/wallet/game-completion', { gameName });
    return res.data;
  },

  async getRegionalLeaderboard(city: string) {
    const res = await apiClient.get<{ rank: number; userId: string; name: string; email: string; avatar: string | null; checkInCount: number }[]>(
      `/wallet/leaderboard/regional?city=${city}`
    );
    return res.data;
  },

  async getDailyLoginStatus() {
    const res = await apiClient.get<{
      claimedToday: boolean;
      points: number;
      streak: number;
      longestStreak: number;
    }>('/wallet/daily-login/status');
    return res.data;
  },

  async claimDailyLogin() {
    const res = await apiClient.post<{
      awarded: boolean;
      points: number;
      streak: number;
      longestStreak: number;
      alreadyClaimed: boolean;
    }>('/wallet/daily-login/claim', {});
    return res.data;
  },

};
