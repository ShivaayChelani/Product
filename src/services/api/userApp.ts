import { apiClient } from './client';

export type UserPrivacySettings = {
  profileVisibility: 'public' | 'private';
  showTrips: boolean;
  showReviews: boolean;
  showReels: boolean;
  showWishlist: boolean;
};

export type UserNotificationSettings = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  travelAlerts: boolean;
  offerAlerts: boolean;
  rewardNotifications: boolean;
  systemNotifications: boolean;
};

export type UserSecuritySettings = {
  biometricLogin: boolean;
  pinLock: boolean;
  twoFactorEnabled: boolean;
};

export type UserAppearanceSettings = {
  theme: 'light' | 'system';
};

export type UserAppSettings = {
  privacy: UserPrivacySettings;
  notifications: UserNotificationSettings;
  security: UserSecuritySettings;
  appearance: UserAppearanceSettings;
  language: 'en' | 'hi' | 'auto';
  updatedAt: string;
};

export type MobileAppConfig = {
  latestVersion: string;
  latestBuild: string;
  minVersion: string;
  playStoreUrl: string;
  appStoreUrl: string;
  supportEmail: string;
  serverTime: string;
};

export type BlockedUserRow = {
  id: string;
  blockedUser: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    verificationStatus: string;
  };
  createdAt: string;
};

export type UserSessionRow = {
  id: string;
  createdAt: string;
  expiresAt: string;
};

function unwrap<T>(res: { data: T }): T {
  return res.data;
}

export const userAppApi = {
  async getSettings() {
    const res = await apiClient.get<UserAppSettings>('/user-app/settings');
    return unwrap(res);
  },

  async patchSettings(patch: Partial<UserAppSettings>) {
    const res = await apiClient.patch<UserAppSettings>('/user-app/settings', patch);
    return unwrap(res);
  },

  async listBlocks() {
    const res = await apiClient.get<BlockedUserRow[]>('/user-app/blocks');
    return unwrap(res);
  },

  async blockUser(blockedUserId: string) {
    const res = await apiClient.post<{ blocked: boolean }>('/user-app/blocks', { blockedUserId });
    return unwrap(res);
  },

  async unblockUser(blockId: string) {
    const res = await apiClient.delete<{ unblocked: boolean }>(`/user-app/blocks/${blockId}`);
    return unwrap(res);
  },

  async exportPersonalData() {
    const res = await apiClient.get<Record<string, unknown>>('/user-app/data-export');
    return unwrap(res);
  },

  async deletePersonalData() {
    const res = await apiClient.post<{ cleared: boolean }>('/user-app/data-delete', {});
    return unwrap(res);
  },

  async listSessions() {
    const res = await apiClient.get<UserSessionRow[]>('/user-app/sessions');
    return unwrap(res);
  },

  async revokeSession(sessionId: string) {
    const res = await apiClient.delete<{ revoked: boolean }>(`/user-app/sessions/${sessionId}`);
    return unwrap(res);
  },

  async revokeOtherSessions() {
    const refreshToken = await apiClient.getRefreshToken();
    const res = await apiClient.post<{ revokedOthers: boolean }>('/user-app/sessions/revoke-others', {
      refreshToken: refreshToken ?? undefined,
    });
    return unwrap(res);
  },

  async submitFeedback(category: 'bug' | 'feature' | 'support' | 'rating_fallback' | 'general', message: string, metadata?: Record<string, unknown>) {
    const res = await apiClient.post<{ id: string }>('/user-app/feedback', { category, message, metadata });
    return unwrap(res);
  },
};

export const appConfigApi = {
  async getMobileConfig() {
    const res = await apiClient.get<MobileAppConfig>('/app/mobile-config');
    return unwrap(res);
  },

  async getLicenses() {
    const res = await apiClient.get<{ title: string; packages: { name: string; license: string }[] }>('/app/licenses');
    return unwrap(res);
  },
};
