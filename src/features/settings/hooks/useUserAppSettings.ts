import { useRef } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userAppApi, type UserAppSettings } from '../../../services/api/userApp';
import { DEV_FLAGS } from '../../../config/devFlags';
import { settingsKeys } from '../queryKeys';
import { useSettingsStore } from '../store/settingsStore';
import {
  applyOwnedServerSettings,
  mergeUserAppSettings,
  rollbackFailedSettingsPatch,
  settingsPatchKeys,
} from '../mergeUserAppSettings';

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
  const seqRef = useRef(0);
  const latestByKeyRef = useRef(new Map<string, number>());

  const publish = (next: UserAppSettings) => {
    qc.setQueryData(settingsKeys.appSettings(), next);
    applyServerSettings(next);
  };

  return useMutation({
    mutationFn: (patch: Partial<UserAppSettings>) => userAppApi.patchSettings(patch),
    onMutate: async patch => {
      const id = ++seqRef.current;
      for (const key of settingsPatchKeys(patch)) latestByKeyRef.current.set(key, id);
      await qc.cancelQueries({ queryKey: settingsKeys.appSettings() });
      const previous = qc.getQueryData<UserAppSettings>(settingsKeys.appSettings()) ?? DEFAULT_SETTINGS;
      publish(mergeUserAppSettings(previous, patch));
      return { id, previous };
    },
    onError: (_err, patch, ctx) => {
      if (!ctx) return;
      const owns = (key: string) => latestByKeyRef.current.get(key) === ctx.id;
      const current = qc.getQueryData<UserAppSettings>(settingsKeys.appSettings()) ?? DEFAULT_SETTINGS;
      const rolled = rollbackFailedSettingsPatch(current, ctx.previous, patch, owns);
      const changed = JSON.stringify(rolled) !== JSON.stringify(current);
      if (changed) publish(rolled);
      if (settingsPatchKeys(patch).some(owns)) {
        Alert.alert('Could not save', 'Your setting was not updated. Check your connection and try again.');
      }
    },
    onSuccess: (data, patch, ctx) => {
      if (!ctx) return;
      const owns = (key: string) => latestByKeyRef.current.get(key) === ctx.id;
      const current = qc.getQueryData<UserAppSettings>(settingsKeys.appSettings()) ?? data;
      publish(applyOwnedServerSettings(current, data, patch, owns));
    },
  });
}
