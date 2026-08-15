import {
  PlanAudience,
  PaymentStatus,
  SubscriptionStatus,
  VendorSubscriptionStatus,
} from '@prisma/client';
import { prisma } from '../../config/database';
import {
  deriveVendorListingStatus,
  isPublicVendorListingVisible,
} from '../vendors/vendor-public-visibility';
import { UNLIMITED } from './plan-catalog.service';

const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.GRACE,
  SubscriptionStatus.PAST_DUE,
];

function featuresOf(features: unknown): Record<string, unknown> {
  if (features && typeof features === 'object' && !Array.isArray(features)) {
    return features as Record<string, unknown>;
  }
  return {};
}

function resolveLimit(
  limits: Array<{ limitKey: string; limitValue: number }>,
  features: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const fromTable = limits.find((l) => l.limitKey === key);
  if (fromTable) return fromTable.limitValue === -1 ? 999999 : fromTable.limitValue;
  const fromJson = Number(features[key]);
  return Number.isFinite(fromJson) ? fromJson : fallback;
}

function permissionsFromPlan(
  permissions: Array<{ permissionKey: string; enabled: boolean }>,
  features: Record<string, unknown>,
) {
  const out: Record<string, unknown> = { ...features };
  for (const p of permissions) {
    out[p.permissionKey] = p.enabled;
  }
  return out;
}

export const entitlementsService = {
  async getForUser(userId: string) {
    const now = new Date();
    await this.reconcileExpired(userId, now);

    const subscriptions = await prisma.userSubscription.findMany({
      where: {
        userId,
        status: { in: LIVE_STATUSES },
        currentPeriodEnd: { gte: now },
      },
      include: {
        plan: {
          include: {
            prices: true,
            limits: true,
            permissions: true,
          },
        },
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });

    const premium = subscriptions.find((s) => s.audience === PlanAudience.USER_PREMIUM) ?? null;
    const vendor = subscriptions.find((s) => s.audience === PlanAudience.VENDOR) ?? null;
    const creator = subscriptions.find((s) => s.audience === PlanAudience.CREATOR) ?? null;

    const isPremium = !!premium;
    const vendorFeatures = featuresOf(vendor?.plan.features);
    const creatorFeatures = featuresOf(creator?.plan.features);
    const premiumFeatures = featuresOf(premium?.plan.features);

    const [vendorRow, expiredPremium, latestVendorSub, pendingVendorPayment] = await Promise.all([
      prisma.vendor.findUnique({
        where: { userId },
        select: {
          id: true,
          status: true,
          subscriptionStatus: true,
          suspendedAt: true,
          showOnMap: true,
        },
      }),
      premium
        ? Promise.resolve(null)
        : prisma.userSubscription.findFirst({
            where: { userId, audience: PlanAudience.USER_PREMIUM },
            orderBy: { currentPeriodEnd: 'desc' },
            select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
          }),
      prisma.userSubscription.findFirst({
        where: { userId, audience: PlanAudience.VENDOR },
        orderBy: { updatedAt: 'desc' },
        select: { status: true },
      }),
      prisma.paymentTransaction.findFirst({
        where: { userId, status: PaymentStatus.PENDING, provider: 'RAZORPAY' },
        select: { id: true },
      }),
    ]);

    let vendorListing = null;
    if (vendorRow) {
      const usage = await Promise.all([
        prisma.vendorOffer.count({ where: { vendorId: vendorRow.id, isActive: true } }),
        prisma.vendorReel.count({
          where: {
            vendorId: vendorRow.id,
            createdAt: {
              gte: (() => {
                const d = new Date();
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                return d;
              })(),
            },
          },
        }),
      ]);
      const offersUsed = usage[0];
      const reelsUsedThisMonth = usage[1];
      const maxOffers = vendor ? (vendor.plan.limits ? resolveLimit(vendor.plan.limits, vendorFeatures, 'maxOffers', 0) : 0) : 0;
      const maxReels = vendor ? resolveLimit(vendor.plan.limits ?? [], vendorFeatures, 'maxReels', 0) : 0;
      const listingStatus = deriveVendorListingStatus({
        vendorStatus: vendorRow.status,
        subscriptionStatus: vendorRow.subscriptionStatus,
        suspendedAt: vendorRow.suspendedAt,
        hasPendingPayment: Boolean(pendingVendorPayment) && !vendor,
        latestSubscriptionStatus: latestVendorSub?.status ?? null,
      });
      const listingVisible = isPublicVendorListingVisible(vendorRow);
      vendorListing = {
        status: listingStatus,
        visible: listingVisible,
        mapListing: listingVisible && vendorRow.showOnMap !== false ? 'Active' : 'Hidden',
        planName: vendor?.plan.name ?? null,
        planSlug: vendor?.plan.slug ?? null,
        planId: vendor?.planId ?? null,
        expiresAt: vendor?.currentPeriodEnd ?? null,
        offersUsed,
        offersLimit: maxOffers >= 999999 ? UNLIMITED : maxOffers,
        reelsUsedThisMonth,
        reelsLimit: maxReels >= 999999 ? UNLIMITED : maxReels,
      };
    }

    return {
      isPremium,
      showAds: !isPremium,
      premiumBadge: isPremium ? (String(premiumFeatures.badge || premium?.plan.badge || 'Premium')) : null,
      premiumTheme: isPremium && premiumFeatures.premiumTheme !== false,
      premiumExpiresAt: premium?.currentPeriodEnd ?? null,
      premiumPlan: premium
        ? {
            id: premium.planId,
            name: premium.plan.name,
            status: premium.status,
            period: premium.billingPeriod,
            expiresAt: premium.currentPeriodEnd,
            features: premiumFeatures,
          }
        : null,
      premiumExpired: !isPremium && expiredPremium?.status === SubscriptionStatus.EXPIRED,
      vendorListing,
      vendorSubscription: vendor
        ? (() => {
            const limits = vendor.plan.limits ?? [];
            const perms = vendor.plan.permissions ?? [];
            const mergedFeatures = permissionsFromPlan(perms, vendorFeatures);
            return {
              id: vendor.id,
              planId: vendor.planId,
              name: vendor.plan.name,
              slug: vendor.plan.slug,
              status: vendor.status,
              period: vendor.billingPeriod,
              expiresAt: vendor.currentPeriodEnd,
              graceEndsAt: vendor.graceEndsAt,
              features: mergedFeatures,
              maxReels: resolveLimit(limits, vendorFeatures, 'maxReels', 0),
              maxOffers: resolveLimit(limits, vendorFeatures, 'maxOffers', 0),
              maxStaff: resolveLimit(limits, vendorFeatures, 'maxStaff', 1),
              analyticsLevel: String(mergedFeatures.analyticsLevel ?? 'basic'),
              featuredListing: Boolean(mergedFeatures.featuredListing),
              redemptionLimit: Number(mergedFeatures.redemptionLimit ?? 1000),
              canPalPointsPartner: Boolean(mergedFeatures.canPalPointsPartner),
            };
          })()
        : null,
      creatorMembership: creator
        ? {
            id: creator.id,
            planId: creator.planId,
            name: creator.plan.name,
            slug: creator.plan.slug,
            status: creator.status,
            period: creator.billingPeriod,
            expiresAt: creator.currentPeriodEnd,
            features: permissionsFromPlan(creator.plan.permissions ?? [], creatorFeatures),
            uploadLimit: resolveLimit(creator.plan.limits ?? [], creatorFeatures, 'uploadLimit', 30),
            analyticsLevel: String(creatorFeatures.analyticsLevel ?? 'basic'),
            verifiedBadge: Boolean(creatorFeatures.verifiedBadge),
            priorityRanking: Boolean(creatorFeatures.priorityRanking),
          }
        : null,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        audience: s.audience,
        status: s.status,
        planName: s.plan.name,
        period: s.billingPeriod,
        expiresAt: s.currentPeriodEnd,
        autoRenew: s.autoRenew,
        provider: s.provider,
      })),
    };
  },

  async reconcileExpired(userId: string, now = new Date()) {
    const expired = await prisma.userSubscription.findMany({
      where: {
        userId,
        status: { in: LIVE_STATUSES },
        currentPeriodEnd: { lt: now },
      },
    });

    for (const sub of expired) {
      const graceEnd = sub.graceEndsAt ?? sub.currentPeriodEnd;
      if (graceEnd > now && sub.status !== SubscriptionStatus.GRACE) {
        await prisma.userSubscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.GRACE },
        });
        if (sub.audience === PlanAudience.VENDOR) {
          await prisma.vendor.updateMany({
            where: { userId },
            data: { subscriptionStatus: VendorSubscriptionStatus.GRACE },
          });
        }
        continue;
      }

      if (graceEnd <= now) {
        await prisma.userSubscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.EXPIRED },
        });
        if (sub.audience === PlanAudience.VENDOR) {
          await prisma.vendor.updateMany({
            where: { userId },
            data: {
              subscriptionStatus: VendorSubscriptionStatus.EXPIRED,
              suspendedAt: now,
            },
          });
        }
        if (sub.audience === PlanAudience.CREATOR) {
          await prisma.creatorProfile.updateMany({
            where: { userId },
            data: { membershipExpiresAt: sub.currentPeriodEnd },
          });
        }
      }
    }
  },
};
