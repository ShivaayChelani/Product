import { Platform } from 'react-native';
import { monetizationApi } from './api/monetization';

export type ClientAdConfig = {
  showAds: boolean;
  killSwitch: boolean;
  interstitialCooldownSec: number;
  rewardedPoints: number;
  interstitial: boolean;
  rewarded: boolean;
  native: boolean;
  units: {
    interstitial?: string | null;
    rewarded?: string | null;
    native?: string | null;
  };
  ssvCustomData?: string;
};

let cached: ClientAdConfig | null = null;
let lastInterstitialAt = 0;
let mobileAdsReady = false;

function loadAds(): any | null {
  try {
     
    return require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
}

const FALLBACK: ClientAdConfig = {
  showAds: false,
  killSwitch: true,
  interstitialCooldownSec: 120,
  rewardedPoints: 0,
  interstitial: false,
  rewarded: false,
  native: false,
  units: {},
};

let clientIsPremium = false;
let clientShowAds = true;

export const adsService = {
  setEntitlementState(isPremium: boolean, showAds: boolean) {
    clientIsPremium = isPremium;
    clientShowAds = showAds;
  },

  isSdkAvailable(): boolean {
    return !!loadAds();
  },

  async init(): Promise<void> {
    const ads = loadAds();
    if (!ads || mobileAdsReady) return;

    try {
      await ads.mobileAds().initialize();
    } catch (error) {
      if (__DEV__) {
        console.warn('[Ads] SDK initialization warning:', error);
      }
    }

    // Native Google Mobile Ads SDK may continue initialization even if
    // the JS initialize promise rejects. Do not block ad loading/showing.
    mobileAdsReady = true;
  },

  async refreshConfig(opts?: { country?: string; appVersion?: string }): Promise<ClientAdConfig> {
    try {
      const data = await monetizationApi.getAdConfig({
        country: opts?.country,
        appVersion: opts?.appVersion,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
      cached = {
        showAds: !!data.showAds,
        killSwitch: !!data.killSwitch,
        interstitialCooldownSec: Number(data.interstitialCooldownSec ?? 120),
        rewardedPoints: Number(data.rewardedPoints ?? 0),
        interstitial: !!data.interstitial,
        rewarded: !!data.rewarded,
        native: !!data.native,
        units: data.units || {},
        ssvCustomData: data.ssvCustomData,
      };
      if (__DEV__) {
        console.info(
          '[Ads] config refreshed',
          JSON.stringify({
            showAds: cached.showAds,
            killSwitch: cached.killSwitch,
            interstitial: cached.interstitial,
            rewarded: cached.rewarded,
            native: cached.native,
            rewardedPoints: cached.rewardedPoints,
            hasRewardedUnit: !!cached.units.rewarded,
            hasSsvCustomData: !!cached.ssvCustomData,
            platform: Platform.OS,
          })
        );
      }
      return cached;
    } catch {
      cached = FALLBACK;
      if (__DEV__) {
        console.warn('[Ads] config refresh failed, using fallback config');
      }
      return cached;
    }
  },

  getConfig(): ClientAdConfig {
    return cached || FALLBACK;
  },

  /**
   * Official Google test ad units, used ONLY in debug/dev builds (__DEV__)
   * so the ad pipeline can be verified without touching the production
   * adConfiguration row. Production/release builds always use server units.
   */
  resolveUnit(kind: 'interstitial' | 'rewarded' | 'native'): string | null {
    if (__DEV__) {
      const ads = loadAds();
      const test = ads?.TestIds;
      if (test) {
        if (kind === 'interstitial') return test.INTERSTITIAL;
        if (kind === 'rewarded') return test.REWARDED;
        if (kind === 'native') return test.NATIVE;
      }
      return null;
    }
    const configured = this.getConfig().units[kind];
    if (configured) return configured;
    return null;
  },

  /** Premium / kill-switch / admin disable → never show ads */
  canShow(kind: 'interstitial' | 'rewarded' | 'native'): boolean {
    if (clientIsPremium || !clientShowAds) return false;
    const c = this.getConfig();
    if (!c.showAds || c.killSwitch) return false;
    return !!c[kind] && !!this.resolveUnit(kind);
  },

  async showInterstitial(): Promise<boolean> {
    if (!this.canShow('interstitial')) return false;
    const ads = loadAds();
    if (!ads) return false;
    const unit = this.resolveUnit('interstitial');
    if (!unit) return false;
    const cooldown = this.getConfig().interstitialCooldownSec * 1000;
    if (Date.now() - lastInterstitialAt < cooldown) return false;

    await this.init();
    return new Promise((resolve) => {
      const interstitial = ads.InterstitialAd.createForAdRequest(unit, {
        requestNonPersonalizedAdsOnly: true,
      });
      const unsubLoaded = interstitial.addAdEventListener(ads.AdEventType.LOADED, () => {
        interstitial.show();
      });
      const unsubClosed = interstitial.addAdEventListener(ads.AdEventType.CLOSED, () => {
        lastInterstitialAt = Date.now();
        unsubLoaded();
        unsubClosed();
        unsubError();
        resolve(true);
      });
      const unsubError = interstitial.addAdEventListener(ads.AdEventType.ERROR, (error: any) => {
        console.warn('[Ads] interstitial load error:', error);
        unsubLoaded();
        unsubClosed();
        unsubError();
        resolve(false);
      });
      interstitial.load();
    });
  },

  async showRewarded(): Promise<{ watched: boolean; points: number }> {
    await this.refreshConfig();
    if (!this.canShow('rewarded')) {
      if (__DEV__) console.warn('[Ads] showRewarded blocked: canShow returned false');
      return { watched: false, points: 0 };
    }
    const ads = loadAds();
    if (!ads) {
      if (__DEV__) console.warn('[Ads] showRewarded blocked: SDK unavailable');
      return { watched: false, points: 0 };
    }
    const unit = this.resolveUnit('rewarded');
    if (!unit) {
      if (__DEV__) console.warn('[Ads] showRewarded blocked: rewarded unit missing');
      return { watched: false, points: 0 };
    }
    const ssvCustomData = this.getConfig().ssvCustomData;
    if (!ssvCustomData) {
      if (__DEV__) console.warn('[Ads] showRewarded blocked: ssvCustomData missing');
      return { watched: false, points: 0 };
    }
    await this.init();
    if (!mobileAdsReady && __DEV__) {
      console.warn('[Ads] showRewarded: SDK initialization failed');
    }

    const requestOptions: any = {
      requestNonPersonalizedAdsOnly: true,
      serverSideVerificationOptions: { customData: ssvCustomData },
    };

    return new Promise((resolve) => {
      const rewarded = ads.RewardedAd.createForAdRequest(unit, requestOptions);
      let earned = false;
      const unsubLoaded = rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => rewarded.show());
      const unsubEarned = rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      });
      const unsubClosed = rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
        unsubLoaded();
        unsubEarned();
        unsubClosed();
        unsubError();
        resolve({ watched: earned, points: 0 });
      });
      const unsubError = rewarded.addAdEventListener(ads.AdEventType.ERROR, (error: any) => {
        console.warn('[Ads] rewarded load error:', error);
        unsubLoaded();
        unsubEarned();
        unsubClosed();
        unsubError();
        resolve({ watched: false, points: 0 });
      });
      rewarded.load();
    });
  },
};
