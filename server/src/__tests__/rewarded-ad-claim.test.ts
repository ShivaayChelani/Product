import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: {
    adConfiguration: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    walletTransaction: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/modules/wallet/wallet.service', () => ({
  walletService: {
    earn: vi.fn(async () => ({ palPoints: 110 })),
    getOrCreateWallet: vi.fn(async () => ({ palPoints: 110 })),
  },
}));

vi.mock('../../src/modules/point-rules/pointRules.service', () => ({
  pointRulesService: {
    getPointsForAction: vi.fn(async () => ({ points: 10, cooldownSec: 30, maxDaily: 20 })),
    checkCooldown: vi.fn(async () => false),
    checkDailyLimit: vi.fn(async () => false),
  },
}));

vi.mock('../../src/modules/monetization/entitlements.service', () => ({
  entitlementsService: {
    getForUser: vi.fn(async () => ({ isPremium: false })),
  },
}));

import { prisma } from '../../src/config/database';
import { adsService } from '../../src/modules/monetization/ads.service';
import { walletService } from '../../src/modules/wallet/wallet.service';

describe('rewarded ad claim', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ADMOB_SSV_VERIFIER_URL;
    delete process.env.REWARDED_AD_SSV_SECRET;
    (prisma.adConfiguration.findUnique as any).mockResolvedValue({
      key: 'default',
      adsEnabled: true,
      killSwitch: false,
      rewardedEnabled: true,
      rewardedPoints: 10,
      enabledCountries: [],
      enabledAppVersions: [],
      interstitialEnabled: false,
      nativeEnabled: false,
      interstitialCooldownSec: 120,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects claim when server-side ad verification is not configured', async () => {
    await expect(
      adsService.claimRewardedAd('user1', 'ad_event_abc12345', 'android'),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(walletService.earn).not.toHaveBeenCalled();
  });

  it('always rejects claim as client-side rewards are disabled', async () => {
    await expect(
      adsService.claimRewardedAd('user1', 'ad_event_abc12345', 'android'),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(walletService.earn).not.toHaveBeenCalled();
  });
});
