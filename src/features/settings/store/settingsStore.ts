import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserAppSettings } from '../../../services/api/userApp';

type SettingsUiState = {
  language: 'en' | 'hi' | 'auto';
  theme: 'light' | 'system';
  offlinePendingCount: number;
  setLanguage: (language: 'en' | 'hi' | 'auto') => void;
  setTheme: (theme: 'light' | 'system') => void;
  setOfflinePendingCount: (n: number) => void;
  applyServerSettings: (settings: UserAppSettings) => void;
};

export const useSettingsStore = create<SettingsUiState>()(
  persist(
    set => ({
      language: 'auto',
      theme: 'system',
      offlinePendingCount: 0,
      setLanguage: language => set({ language }),
      setTheme: theme => set({ theme }),
      setOfflinePendingCount: offlinePendingCount => set({ offlinePendingCount }),
      applyServerSettings: settings =>
        set({
          language: settings.language,
          theme: settings.appearance.theme,
        }),
    }),
    {
      name: 'ps-settings-ui',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ language: s.language, theme: s.theme }),
    },
  ),
);
