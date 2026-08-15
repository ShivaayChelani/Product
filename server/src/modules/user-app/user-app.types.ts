export const DEFAULT_PRIVACY = {
  profileVisibility: 'public' as 'public' | 'private',
  showTrips: true,
  showReviews: true,
  showReels: true,
  showWishlist: true,
};

export const DEFAULT_NOTIFICATIONS = {
  pushEnabled: true,
  emailEnabled: true,
  travelAlerts: true,
  offerAlerts: true,
  rewardNotifications: true,
  systemNotifications: true,
};

export const DEFAULT_SECURITY = {
  biometricLogin: false,
  pinLock: false,
  twoFactorEnabled: false,
};

export const DEFAULT_APPEARANCE = {
  theme: 'system' as 'light' | 'system',
};

export type UserPrivacySettings = typeof DEFAULT_PRIVACY;
export type UserNotificationSettings = typeof DEFAULT_NOTIFICATIONS;
export type UserSecuritySettings = typeof DEFAULT_SECURITY;
export type UserAppearanceSettings = typeof DEFAULT_APPEARANCE;

export type UserAppSettingsPayload = {
  privacy: UserPrivacySettings;
  notifications: UserNotificationSettings;
  security: UserSecuritySettings;
  appearance: UserAppearanceSettings;
  language: 'en' | 'hi' | 'auto';
  updatedAt: string;
};

function mergeJson<T extends Record<string, unknown>>(defaults: T, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults };
  return { ...defaults, ...(raw as Partial<T>) };
}

export function normalizeUserAppSettings(row: {
  privacy: unknown;
  notifications: unknown;
  security: unknown;
  appearance: unknown;
  language: string;
  updatedAt: Date;
}): UserAppSettingsPayload {
  const lang = row.language === 'en' || row.language === 'hi' || row.language === 'auto' ? row.language : 'auto';
  return {
    privacy: mergeJson(DEFAULT_PRIVACY, row.privacy),
    notifications: mergeJson(DEFAULT_NOTIFICATIONS, row.notifications),
    security: mergeJson(DEFAULT_SECURITY, row.security),
    appearance: mergeJson(DEFAULT_APPEARANCE, row.appearance),
    language: lang,
    updatedAt: row.updatedAt.toISOString(),
  };
}
