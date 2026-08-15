import { settingsService } from '../settings/settings.service';

function parseSetting(settings: { key: string; value: unknown }[], key: string, fallback: string) {
  const row = settings.find(s => s.key === key);
  if (row?.value === undefined || row?.value === null) return fallback;
  return String(row.value);
}

export const appPublicService = {
  async getMobileConfig() {
    const settings = await settingsService.getAll();
    const latestVersion = parseSetting(settings, 'latest_app_version', '');
    const latestBuild = parseSetting(settings, 'latest_app_build', '');
    const minVersion = parseSetting(settings, 'force_update_min_version', '');
    const playStoreUrl = parseSetting(settings, 'play_store_url', 'https://play.google.com/store/apps/details?id=com.palsafar');
    const appStoreUrl = parseSetting(settings, 'app_store_url', 'https://apps.apple.com/app/id0000000000');
    const supportEmail = parseSetting(settings, 'support_email', 'support@palsafar.com');

    return {
      latestVersion,
      latestBuild,
      minVersion,
      playStoreUrl,
      appStoreUrl,
      supportEmail,
      serverTime: new Date().toISOString(),
    };
  },

  async getOpenSourceLicenses() {
    return {
      title: 'Open Source Licenses',
      packages: [
        { name: 'React Native', license: 'MIT' },
        { name: '@react-navigation/native', license: 'MIT' },
        { name: '@tanstack/react-query', license: 'MIT' },
        { name: 'zustand', license: 'MIT' },
        { name: 'react-native-reanimated', license: 'MIT' },
        { name: 'react-hook-form', license: 'MIT' },
      ],
    };
  },
};
