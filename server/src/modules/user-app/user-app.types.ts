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

export function readPrivacy(raw: unknown): UserPrivacySettings {
  return mergeJson(DEFAULT_PRIVACY, raw);
}

/** What a non-owner may see. Owners always see their own content. */
export function publicPrivacyMask(
  privacy: UserPrivacySettings,
  viewerIsOwner: boolean,
): {
  hideProfile: boolean;
  hideReels: boolean;
  hideTrips: boolean;
  hideReviews: boolean;
  hideWishlist: boolean;
} {
  if (viewerIsOwner) {
    return { hideProfile: false, hideReels: false, hideTrips: false, hideReviews: false, hideWishlist: false };
  }
  const hideProfile = privacy.profileVisibility === 'private';
  return {
    hideProfile,
    hideReels: hideProfile || privacy.showReels === false,
    hideTrips: hideProfile || privacy.showTrips === false,
    hideReviews: hideProfile || privacy.showReviews === false,
    hideWishlist: hideProfile || privacy.showWishlist === false,
  };
}

type SettingsPatch = {
  privacy?: Partial<UserPrivacySettings>;
  notifications?: Partial<UserNotificationSettings>;
  security?: Partial<UserSecuritySettings>;
  appearance?: Partial<UserAppearanceSettings>;
  language?: UserAppSettingsPayload['language'];
};

/** Merge one partial settings write onto the stored row without dropping sibling keys. */
export function applyUserAppSettingsPatch(
  current: {
    privacy: unknown;
    notifications: unknown;
    security: unknown;
    appearance: unknown;
  },
  patch: SettingsPatch,
): SettingsPatch {
  const data: SettingsPatch = {};
  if (patch.privacy) {
    data.privacy = { ...mergeJson(DEFAULT_PRIVACY, current.privacy), ...patch.privacy };
  }
  if (patch.notifications) {
    data.notifications = { ...mergeJson(DEFAULT_NOTIFICATIONS, current.notifications), ...patch.notifications };
  }
  if (patch.security) {
    data.security = { ...mergeJson(DEFAULT_SECURITY, current.security), ...patch.security };
  }
  if (patch.appearance) {
    data.appearance = { ...mergeJson(DEFAULT_APPEARANCE, current.appearance), ...patch.appearance };
  }
  if (patch.language) data.language = patch.language;
  return data;
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
