import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userAppApi, type UserAppSettings } from '../../../services/api/userApp';
import { DEV_FLAGS } from '../../../config/devFlags';
import { settingsKeys } from '../queryKeys';
import { useSettingsStore } from '../store/settingsStore';

const DEFAULT_SETTINGS: UserAppSettings = {
  privacy: {
    profileVisibility: 'public',
    showTrips: true,
    showReviews: true,
    showReels: true,
    showWishlist: true,
  },
  notifications: {
    pushEnabled: true,
    emailEnabled: true,
    travelAlerts: true,
    offerAlerts: true,
    rewardNotifications: true,
    systemNotifications: true,
  },
  security: {
    biometricLogin: false,
    pinLock: false,
    twoFactorEnabled: false,
  },
  appearance: { theme: 'system' },
  language: 'auto',
  updatedAt: new Date(0).toISOString(),
};

export function useUserAppSettings(enabled: boolean) {
  const applyServerSettings = useSettingsStore(s => s.applyServerSettings);
  return useQuery({
    queryKey: settingsKeys.appSettings(),
    queryFn: async () => {
      const data = await userAppApi.getSettings();
      applyServerSettings(data);
      return data;
    },
    enabled: enabled && DEV_FLAGS.USE_SERVER_API,
    staleTime: 15_000,
    placeholderData: DEFAULT_SETTINGS,
  });
}

export function usePatchUserAppSettings() {
  const qc = useQueryClient();
  const applyServerSettings = useSettingsStore(s => s.applyServerSettings);
  return useMutation({
    mutationFn: (patch: Partial<UserAppSettings>) => userAppApi.patchSettings(patch),
    onSuccess: data => {
      qc.setQueryData(settingsKeys.appSettings(), data);
      applyServerSettings(data);
    },
  });
}
