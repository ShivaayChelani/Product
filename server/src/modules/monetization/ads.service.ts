import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { entitlementsService } from './entitlements.service';
import { pointRulesService } from '../point-rules/pointRules.service';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { admobSsvService } from './admob-ssv.service';

const DEFAULT_KEY = 'default';
export const ADMOB_SSV_TOKEN_PURPOSE = 'admob_ssv';
const SSV_CUSTOM_DATA_EXPIRES = '1h';

/** True only when server-side ad verification is configured (AdMob SSV or equivalent). */
export function isRewardedAdServerVerificationEnabled(): boolean {
  return Boolean(
    process.env.ADMOB_SSV_VERIFIER_URL?.trim()
    || process.env.REWARDED_AD_SSV_SECRET?.trim(),
  );
}

function ssvSigningSecret(): string {
  return env.jwt.secret;
}

export function signSsvCustomData(userId: string): string {
  return jwt.sign(
    { userId, purpose: ADMOB_SSV_TOKEN_PURPOSE },
    ssvSigningSecret(),
    { expiresIn: SSV_CUSTOM_DATA_EXPIRES, algorithm: 'HS256' },
  );
}

export function verifySsvCustomData(token: string): string {
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, ssvSigningSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    throw new ApiError(400, 'Invalid custom_data signature');
  }
  if (decoded.purpose !== ADMOB_SSV_TOKEN_PURPOSE || typeof decoded.userId !== 'string' || !decoded.userId) {
    throw new ApiError(400, 'Invalid custom_data signature');
  }
  return decoded.userId;
}

export const adsService = {
  async ensureDefault() {
    const existing = await prisma.adConfiguration.findUnique({ where: { key: DEFAULT_KEY } });
    if (existing) return existing;
    return prisma.adConfiguration.create({
      data: { key: DEFAULT_KEY },
    });
  },

  async getAdminConfig() {
    return this.ensureDefault();
  },

  async update(input: Record<string, unknown>) {
    await this.ensureDefault();
    return prisma.adConfiguration.update({
      where: { key: DEFAULT_KEY },
      data: input as any,
    });
  },

  async getClientConfig(opts: {
    userId?: string;
    country?: string;
    appVersion?: string;
    platform?: 'android' | 'ios';
  }) {
    const config = await this.ensureDefault();
    let isPremium = false;
    if (opts.userId) {
      const entitlements = await entitlementsService.getForUser(opts.userId);
      isPremium = entitlements.isPremium;
    }

    const countryOk =
      !config.enabledCountries.length
      || !opts.country
      || config.enabledCountries.map((c) => c.toUpperCase()).includes(opts.country.toUpperCase());

    const versionOk =
      !config.enabledAppVersions.length
      || !opts.appVersion
      || config.enabledAppVersions.includes(opts.appVersion);

    const adsAllowed =
      !isPremium
      && config.adsEnabled
      && !config.killSwitch
      && countryOk
      && versionOk;

    const platform = opts.platform || 'android';

    const ssvCustomData = opts.userId ? signSsvCustomData(opts.userId) : undefined;

    return {
      showAds: adsAllowed,
      killSwitch: config.killSwitch,
      interstitialCooldownSec: config.interstitialCooldownSec,
      rewardedPoints: config.rewardedPoints,
      interstitial: adsAllowed && config.interstitialEnabled,
      rewarded: adsAllowed && config.rewardedEnabled,
      native: adsAllowed && config.nativeEnabled,
      units: {
        interstitial: platform === 'ios' ? config.interstitialAdUnitIdIos : config.interstitialAdUnitIdAndroid,
        rewarded: platform === 'ios' ? config.rewardedAdUnitIdIos : config.rewardedAdUnitIdAndroid,
        native: platform === 'ios' ? config.nativeAdUnitIdIos : config.nativeAdUnitIdAndroid,
      },
      ...(ssvCustomData ? { ssvCustomData } : {}),
    };
  },

  async generateRewardClaimPayload(userId: string) {
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }
    return { ssvCustomData: signSsvCustomData(userId) };
  },

  async claimRewardedAd(_userId: string, _eventId: string, _platform?: string) {
    // The existing rewarded-ad claim endpoint must NOT trust the mobile client
    // POST /monetization/ads/claim-reward must remain disabled/rejected
    throw new ApiError(
      503,
      'Direct client-side rewards are disabled. Rewards are securely processed in the background via AdMob SSV.',
    );
  },

  async processAdMobSsv(fullUrl: string, query: any) {
    const {
      ad_unit,
      custom_data,
      key_id,
      reward_amount,
      reward_item,
      signature,
      timestamp,
      transaction_id,
    } = query;

    if (!transaction_id) {
      throw new ApiError(400, 'Missing transaction_id');
    }
    
    // 1. Signature Verification
    await admobSsvService.verifySignature(fullUrl, String(key_id), String(signature));

    // 2. Extract Custom Data (userId) via purpose-bound JWT. Never trust client userId.
    const token = String(custom_data || '').trim();
    if (!token) {
      throw new ApiError(400, 'Missing custom_data');
    }
    const userId = verifySsvCustomData(token);

    // Google's AdMob "Set up and verify callback URL" tool sends a signed test
    // request with these exact documented fixed values. It has already passed
    // full Google SSV signature verification and purpose-bound custom_data JWT
    // verification above, but it must NEVER credit PalPoints or create wallet
    // transactions. Acknowledge it here and stop.
    // https://developers.google.com/admob/android/rewarded-ads-ssv
    if (
      String(ad_unit) === '1234567890'
      && String(reward_amount) === '10'
      && String(reward_item) === 'PalPoints'
      && String(transaction_id) === '123456789'
    ) {
      return {
        success: true,
        awarded: false,
        test: true,
        message: 'Callback verification test acknowledged',
      };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, 'Unknown user in custom_data');
    }

    // 3. Configuration Validation
    const config = await this.ensureDefault();
    if (!config.adsEnabled || config.killSwitch || !config.rewardedEnabled) {
      throw new ApiError(400, 'Rewarded ads are currently unavailable');
    }

    // Validate Ad Unit
    if (ad_unit !== config.rewardedAdUnitIdAndroid && ad_unit !== config.rewardedAdUnitIdIos) {
      throw new ApiError(400, 'Invalid ad unit');
    }

    // Validate Reward Amount and Type
    const rule = await pointRulesService.getPointsForAction('rewarded_ad');
    const expectedPoints = Math.max(0, Number(config.rewardedPoints) || rule?.points || 0);

    if (String(reward_amount) !== String(expectedPoints)) {
      throw new ApiError(400, 'Unexpected reward amount');
    }
    if (String(reward_item || '') !== 'PalPoints') {
      throw new ApiError(400, 'Unexpected reward item');
    }

    if (expectedPoints <= 0) {
      throw new ApiError(400, 'Rewarded ad points are not configured');
    }

    const entitlements = await entitlementsService.getForUser(userId);
    if (entitlements.isPremium) {
      throw new ApiError(400, 'Premium members cannot earn PalPoints from ads');
    }

    const cooldownSec = rule?.cooldownSec ?? 0;
    const maxDaily = rule?.maxDaily ?? 0;

    // 4. Exactly-Once Processing via Database Idempotency
    // Cooldown/daily caps live in the same transaction as the credit to close TOCTOU races.
    try {
      await prisma.$transaction(async (tx) => {
        if (cooldownSec > 0) {
          const since = new Date(Date.now() - cooldownSec * 1000);
          const recent = await tx.walletTransaction.findFirst({
            where: { userId, reason: 'rewarded_ad', createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
          });
          if (recent) {
            throw new ApiError(429, 'Please wait before claiming another ad reward');
          }
        }
        if (maxDaily > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const count = await tx.walletTransaction.count({
            where: { userId, reason: 'rewarded_ad', createdAt: { gte: today } },
          });
          if (count >= maxDaily) {
            throw new ApiError(429, 'Daily ad reward limit reached');
          }
        }

        await tx.adMobSsvEvent.create({
          data: {
            transactionId: String(transaction_id),
            userId,
            adUnit: String(ad_unit),
            rewardItem: reward_item ? String(reward_item) : null,
            rewardAmount: Number(reward_amount),
            timestamp: timestamp ? String(timestamp) : null,
          },
        });

        const wallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId, palPoints: expectedPoints, lifetimeEarned: expectedPoints },
          update: { palPoints: { increment: expectedPoints }, lifetimeEarned: { increment: expectedPoints } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: expectedPoints,
            type: 'EARN',
            reason: 'rewarded_ad',
            referenceId: String(transaction_id),
            referenceType: 'REWARDED_AD',
          },
        });
      });
      
      // Attempt to send notification outside transaction
      import('../../config/logger').then(({ logger }) => {
        import('../notifications/notification.service').then(({ notificationService }) => {
          notificationService
            .sendToUser(userId, `+${expectedPoints} Pal Points`, 'rewarded_ad', { type: 'points_earned', amount: expectedPoints }, 'points_earned')
            .catch((err: any) => logger.error({ err, userId }, 'Failed to send points notification'));
        });
      });
    } catch (err: any) {
      // Prisma unique constraint violation code is P2002
      if (err.code === 'P2002') {
        // Idempotency: Event already processed. Return success safely without awarding points again.
        return { success: true, message: 'Event already processed', awarded: false };
      }
      throw err;
    }

    return {
      success: true,
      awarded: true,
      points: expectedPoints,
      message: `+${expectedPoints} PalPoints earned via SSV`,
    };
  },
};
