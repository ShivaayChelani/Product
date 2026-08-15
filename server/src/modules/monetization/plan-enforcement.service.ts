import { PlanAudience } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { entitlementsService } from './entitlements.service';
import { UNLIMITED } from './plan-catalog.service';

async function getSettingNumber(key: string, fallback: number): Promise<number> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (row?.value != null) return Number(row.value) || fallback;
  } catch { /* optional */ }
  return fallback;
}

function monthStart(now = new Date()) {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatLimitLabel(value: number, unlimited = false) {
  if (unlimited || value === UNLIMITED || value >= 999999) return 'unlimited';
  return String(value);
}

export const planEnforcementService = {
  async getVendorLimits(userId: string) {
    const entitlements = await entitlementsService.getForUser(userId);
    const sub = entitlements.vendorSubscription;
    const defaultMaxOffers = await getSettingNumber('vendor_default_max_offers', 0);
    const defaultMaxReels = await getSettingNumber('vendor_default_max_reels', 0);

    if (sub) {
      return {
        maxOffers: sub.maxOffers >= 999999 ? UNLIMITED : sub.maxOffers,
        maxReels: sub.maxReels >= 999999 ? UNLIMITED : sub.maxReels,
        permissions: sub.features ?? {},
        planId: sub.planId,
        planName: sub.name,
        slug: sub.slug,
      };
    }

    return {
      maxOffers: defaultMaxOffers,
      maxReels: defaultMaxReels,
      permissions: {},
      planId: null,
      planName: null,
      slug: null,
    };
  },

  async getCreatorLimits(userId: string) {
    const entitlements = await entitlementsService.getForUser(userId);
    const sub = entitlements.creatorMembership;
    const defaultUpload = await getSettingNumber('creator_default_upload_limit', 5);

    if (sub) {
      const limit = sub.uploadLimit >= 999999 ? UNLIMITED : sub.uploadLimit;
      return {
        uploadLimit: limit,
        permissions: sub.features ?? {},
        planId: sub.planId,
        planName: sub.name,
      };
    }

    return {
      uploadLimit: defaultUpload,
      permissions: {},
      planId: null,
      planName: null,
    };
  },

  async assertVendorCanCreateOffer(userId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const limits = await this.getVendorLimits(userId);
    if (limits.maxOffers === UNLIMITED) return limits;

    const activeCount = await prisma.vendorOffer.count({
      where: { vendorId: vendor.id, isActive: true },
    });

    if (!limits.planId || limits.maxOffers <= 0) {
      throw new ApiError(
        403,
        'Subscribe to a vendor plan to add offers.',
        true,
        ErrorCodes.PLAN_LIMIT_REACHED,
        { kind: 'offer', used: activeCount, limit: limits.maxOffers, planName: limits.planName },
      );
    }

    if (activeCount >= limits.maxOffers) {
      throw new ApiError(
        403,
        `Your current plan allows up to ${limits.maxOffers} active offer${limits.maxOffers === 1 ? '' : 's'}. Upgrade your plan to add more.`,
        true,
        ErrorCodes.PLAN_LIMIT_REACHED,
        { kind: 'offer', used: activeCount, limit: limits.maxOffers, planName: limits.planName },
      );
    }
    return limits;
  },

  async assertVendorCanCreateReel(userId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const limits = await this.getVendorLimits(userId);
    if (limits.maxReels === UNLIMITED) return limits;

    const reelCount = await prisma.vendorReel.count({
      where: { vendorId: vendor.id, createdAt: { gte: monthStart() } },
    });

    if (!limits.planId || limits.maxReels <= 0) {
      throw new ApiError(
        403,
        'Subscribe to a vendor plan to publish reels.',
        true,
        ErrorCodes.PLAN_LIMIT_REACHED,
        { kind: 'reel', used: reelCount, limit: limits.maxReels, planName: limits.planName },
      );
    }

    if (reelCount >= limits.maxReels) {
      const planLabel = limits.planName || 'current';
      throw new ApiError(
        403,
        `Your ${planLabel} plan includes ${limits.maxReels} reel${limits.maxReels === 1 ? '' : 's'} per month. Upgrade to Unlimited to publish more.`,
        true,
        ErrorCodes.PLAN_LIMIT_REACHED,
        { kind: 'reel', used: reelCount, limit: limits.maxReels, planName: limits.planName },
      );
    }
    return limits;
  },

  async assertCreatorCanUploadReel(userId: string) {
    const profile = await prisma.creatorProfile.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!profile) throw new ApiError(403, 'Approved creator profile required.');

    const limits = await this.getCreatorLimits(userId);
    if (limits.uploadLimit === UNLIMITED) return limits;

    const count = await prisma.reel.count({
      where: {
        creatorId: profile.id,
        createdAt: { gte: monthStart() },
        status: { notIn: ['HIDDEN', 'DRAFT'] },
      },
    });

    if (count >= limits.uploadLimit) {
      throw new ApiError(
        403,
        `Monthly upload limit reached (${limits.uploadLimit}). Upgrade to Creator Pro for unlimited uploads.`,
        true,
        ErrorCodes.PLAN_LIMIT_REACHED,
        { kind: 'creator_reel', used: count, limit: limits.uploadLimit, planName: limits.planName },
      );
    }
    return limits;
  },

  async hasPermission(userId: string, audience: PlanAudience, permissionKey: string): Promise<boolean> {
    if (audience === PlanAudience.VENDOR) {
      const limits = await this.getVendorLimits(userId);
      return Boolean((limits.permissions as Record<string, unknown>)?.[permissionKey]);
    }
    if (audience === PlanAudience.CREATOR) {
      const limits = await this.getCreatorLimits(userId);
      return Boolean((limits.permissions as Record<string, unknown>)?.[permissionKey]);
    }
    return false;
  },

  async isDiamondVendor(userId: string): Promise<boolean> {
    const entitlements = await entitlementsService.getForUser(userId);
    const sub = entitlements.vendorSubscription;
    if (!sub) return false;
    if (Boolean(sub.canPalPointsPartner) || Boolean((sub.features as Record<string, unknown>)?.canPalPointsPartner)) {
      return true;
    }
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: sub.planId } });
    return plan?.slug === 'vendor-unlimited' || plan?.slug === 'vendor-diamond';
  },

  async countVendorUsage(vendorId: string) {
    const [offersUsed, reelsUsedThisMonth] = await Promise.all([
      prisma.vendorOffer.count({ where: { vendorId, isActive: true } }),
      prisma.vendorReel.count({ where: { vendorId, createdAt: { gte: monthStart() } } }),
    ]);
    return { offersUsed, reelsUsedThisMonth };
  },

  async assertVendorCanCollaborate(userId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const entitlements = await entitlementsService.getForUser(userId);
    const subscribed =
      Boolean(entitlements.vendorSubscription) || entitlements.vendorListing?.visible === true;
    if (!subscribed) {
      throw new ApiError(
        403,
        'Subscribe to a vendor plan to send collaboration requests.',
        true,
        ErrorCodes.PLAN_LIMIT_REACHED,
        { kind: 'collaboration' },
      );
    }
    return entitlements;
  },

  formatLimitLabel,
};
