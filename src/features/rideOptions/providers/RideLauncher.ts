import { Linking, Platform } from 'react-native';
import type { LaunchTarget, RideLaunchPayload, RideProviderId } from './types';

const STORE_LINKS: Record<RideProviderId, { ios: string; android: string }> = {
  uber: {
    ios: 'https://apps.apple.com/app/uber/id368677368',
    android: 'market://details?id=com.ubercab',
  },
  ola: {
    ios: 'https://apps.apple.com/app/ola-cabs/id539179365',
    android: 'market://details?id=com.olacabs.customer',
  },
  rapido: {
    ios: 'https://apps.apple.com/app/rapido-bike-taxi-auto-cabs/id1198464606',
    android: 'market://details?id=com.rapido.passenger',
  },
  blusmart: {
    ios: 'https://apps.apple.com/app/blusmart/id6443709189',
    android: 'market://details?id=com.blusmart.rider',
  },
};

async function tryOpen(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Launches a ride provider via official deep link, website, or app store.
 * PalSafar never books rides — it only hands off to the provider.
 */
export const rideLauncher = {
  async launch(payload: RideLaunchPayload, target: LaunchTarget): Promise<void> {
    if (target === 'website') {
      const opened = await tryOpen(payload.webFallbackLink ?? '');
      if (opened) return;
      throw new Error('WEB_LAUNCH_FAILED');
    }

    const openedApp = await tryOpen(payload.deepLink);
    if (openedApp) return;

    const store =
      Platform.OS === 'ios'
        ? payload.appStore || STORE_LINKS[payload.provider]?.ios
        : payload.playStore || STORE_LINKS[payload.provider]?.android;

    const openedStore = await tryOpen(store ?? '');
    if (openedStore) return;

    throw new Error('APP_LAUNCH_FAILED');
  },

  async openStore(provider: RideProviderId, payload?: Pick<RideLaunchPayload, 'appStore' | 'playStore'>): Promise<void> {
    const store =
      Platform.OS === 'ios'
        ? payload?.appStore || STORE_LINKS[provider]?.ios
        : payload?.playStore || STORE_LINKS[provider]?.android;
    if (!store || !(await tryOpen(store))) {
      throw new Error('STORE_LAUNCH_FAILED');
    }
  },
};
