import {
  FeatureAudience,
  PlanAudience,
  PlanHighlightType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database';

const UNLIMITED = -1;

/** Seeded when missing. Admin-configured prices/limits are never overwritten at runtime. */
export const CANONICAL_PLAN_SLUGS = {
  premium: 'user-premium',
  vendorStarter: 'vendor-starter',
  vendorGrowth: 'vendor-growth',
  vendorUnlimited: 'vendor-unlimited',
  creatorPro: 'creator-pro',
} as const;

/** Retired catalog slugs — archived (not deleted) so existing subscriptions keep working. */
export const LEGACY_PLAN_SLUGS = [
  'vendor-silver',
  'vendor-gold',
  'vendor-platinum',
  'vendor-diamond',
  'user-premium-3mo',
] as const;

/** Public checkout only exposes these slugs. Admin may keep other rows; they must not appear in the app. */
export const PUBLIC_LAUNCH_SLUGS: Record<PlanAudience, readonly string[] | null> = {
  USER_PREMIUM: [CANONICAL_PLAN_SLUGS.premium],
  VENDOR: [
    CANONICAL_PLAN_SLUGS.vendorStarter,
    CANONICAL_PLAN_SLUGS.vendorGrowth,
    CANONICAL_PLAN_SLUGS.vendorUnlimited,
  ],
  CREATOR: [CANONICAL_PLAN_SLUGS.creatorPro],
};

export type PlanCatalogInput = {
  limits?: Array<{ limitKey: string; limitValue: number; displayLabel?: string; sortOrder?: number }>;
  permissions?: Array<{ permissionKey: string; enabled?: boolean }>;
  featureKeys?: Array<{ key: string; displayValue?: string; sortOrder?: number }>;
  highlights?: PlanHighlightType[];
};

const FEATURE_CATALOG: Array<{
  key: string;
  name: string;
  audience: FeatureAudience;
  sortOrder: number;
}> = [
  { key: 'business_listing', name: 'Business Listing', audience: FeatureAudience.VENDOR, sortOrder: 1 },
  { key: 'basic_analytics', name: 'Basic Analytics', audience: FeatureAudience.VENDOR, sortOrder: 2 },
  { key: 'advanced_analytics', name: 'Advanced Analytics', audience: FeatureAudience.VENDOR, sortOrder: 3 },
  { key: 'featured_listing', name: 'Featured Listing', audience: FeatureAudience.VENDOR, sortOrder: 4 },
  { key: 'qr_rewards', name: 'QR Reward Support', audience: FeatureAudience.VENDOR, sortOrder: 5 },
  { key: 'email_support', name: 'Email Support', audience: FeatureAudience.VENDOR, sortOrder: 6 },
  { key: 'priority_support', name: 'Priority Support', audience: FeatureAudience.VENDOR, sortOrder: 7 },
  { key: 'business_insights', name: 'Business Insights', audience: FeatureAudience.VENDOR, sortOrder: 8 },
  { key: 'campaign_promotion', name: 'Campaign Promotion', audience: FeatureAudience.VENDOR, sortOrder: 9 },
  { key: 'top_search', name: 'Top Search Placement', audience: FeatureAudience.VENDOR, sortOrder: 10 },
  { key: 'dedicated_support', name: 'Dedicated Support', audience: FeatureAudience.VENDOR, sortOrder: 11 },
  { key: 'premium_badge', name: 'Premium Business Badge', audience: FeatureAudience.VENDOR, sortOrder: 12 },
  { key: 'seasonal_promotions', name: 'Seasonal Promotions', audience: FeatureAudience.VENDOR, sortOrder: 13 },
  { key: 'performance_reports', name: 'Performance Reports', audience: FeatureAudience.VENDOR, sortOrder: 14 },
  { key: 'homepage_featured', name: 'Homepage Featured Placement', audience: FeatureAudience.VENDOR, sortOrder: 15 },
  { key: 'account_manager', name: 'Dedicated Account Manager', audience: FeatureAudience.VENDOR, sortOrder: 16 },
  { key: 'social_marketing', name: 'Social Media Marketing Support', audience: FeatureAudience.VENDOR, sortOrder: 17 },
  { key: 'event_promotion', name: 'Premium Event Promotion', audience: FeatureAudience.VENDOR, sortOrder: 18 },
  { key: 'diamond_badge', name: 'Exclusive Diamond Badge', audience: FeatureAudience.VENDOR, sortOrder: 19 },
  { key: 'creator_profile', name: 'Creator Profile', audience: FeatureAudience.CREATOR, sortOrder: 1 },
  { key: 'unlimited_reels', name: 'Unlimited Reel Uploads', audience: FeatureAudience.CREATOR, sortOrder: 2 },
  { key: 'campaign_opportunities', name: 'Campaign Opportunities', audience: FeatureAudience.CREATOR, sortOrder: 3 },
  { key: 'creator_analytics', name: 'Creator Analytics', audience: FeatureAudience.CREATOR, sortOrder: 4 },
  { key: 'audience_insights', name: 'Audience Insights', audience: FeatureAudience.CREATOR, sortOrder: 5 },
  { key: 'monetization_tools', name: 'Monetization Tools', audience: FeatureAudience.CREATOR, sortOrder: 6 },
  { key: 'creator_badge', name: 'Creator Badge', audience: FeatureAudience.CREATOR, sortOrder: 7 },
  { key: 'priority_creator_support', name: 'Priority Creator Support', audience: FeatureAudience.CREATOR, sortOrder: 8 },
  { key: 'early_access', name: 'Early Access Features', audience: FeatureAudience.CREATOR, sortOrder: 9 },
];

export const planCatalogInclude = {
  prices: { orderBy: { period: 'asc' as const } },
  featureAssignments: {
    orderBy: { sortOrder: 'asc' as const },
    include: { feature: true },
  },
  limits: { orderBy: { sortOrder: 'asc' as const } },
  permissions: true,
  highlights: true,
  faqs: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.SubscriptionPlanInclude;

function limitDisplay(value: number, unit: string): string {
  if (value === UNLIMITED) return 'Unlimited';
  return `${value} ${unit}`;
}

export function buildFeaturesJsonFromCatalog(
  limits: Array<{ limitKey: string; limitValue: number }>,
  permissions: Array<{ permissionKey: string; enabled: boolean }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const l of limits) {
    const v = l.limitValue === UNLIMITED ? 999999 : l.limitValue;
    if (l.limitKey === 'maxOffers') out.maxOffers = v;
    if (l.limitKey === 'maxReels') out.maxReels = v;
    if (l.limitKey === 'maxCampaigns') out.maxCampaigns = v;
    if (l.limitKey === 'maxBranches') out.maxBranches = v;
    if (l.limitKey === 'maxStaff') out.maxStaff = v;
    if (l.limitKey === 'uploadLimit') out.uploadLimit = v;
  }
  for (const p of permissions) {
    out[p.permissionKey] = p.enabled;
  }
  if (permissions.find((p) => p.permissionKey === 'canAccessPremiumAnalytics' && p.enabled)) {
    out.analyticsLevel = 'premium';
  } else if (permissions.find((p) => p.permissionKey === 'canAccessAdvancedAnalytics' && p.enabled)) {
    out.analyticsLevel = 'advanced';
  } else if (!out.analyticsLevel) {
    out.analyticsLevel = permissions.find((p) => p.permissionKey === 'canAccessAnalytics' && p.enabled)
      ? 'basic'
      : 'basic';
  }
  if (permissions.find((p) => p.permissionKey === 'featuredListing' && p.enabled)) {
    out.featuredListing = true;
  }
  if (permissions.find((p) => p.permissionKey === 'verifiedBadge' && p.enabled)) {
    out.verifiedBadge = true;
  }
  if (permissions.find((p) => p.permissionKey === 'priorityRanking' && p.enabled)) {
    out.priorityRanking = true;
  }
  return out;
}

/** Map legacy admin `features` JSON into relational catalog rows. */
export function inferCatalogFromLegacyFeatures(
  audience: PlanAudience,
  features: Record<string, unknown> = {},
): PlanCatalogInput {
  const catalog: PlanCatalogInput = { limits: [], permissions: [] };

  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  if (audience === PlanAudience.VENDOR) {
    catalog.limits!.push(
      { limitKey: 'maxOffers', limitValue: num(features.maxOffers, 2) },
      { limitKey: 'maxReels', limitValue: num(features.maxReels, 5) },
      { limitKey: 'maxCampaigns', limitValue: num(features.maxCampaigns, 0) },
    );
    catalog.permissions!.push(
      { permissionKey: 'canCreateOffer', enabled: true },
      { permissionKey: 'canAccessAnalytics', enabled: true },
      { permissionKey: 'canAccessAdvancedAnalytics', enabled: features.analyticsLevel === 'advanced' || features.analyticsLevel === 'premium' },
      { permissionKey: 'canAccessPremiumAnalytics', enabled: features.analyticsLevel === 'premium' },
      { permissionKey: 'featuredListing', enabled: Boolean(features.featuredListing) },
      { permissionKey: 'canExportReports', enabled: Boolean(features.canExportReports) },
      { permissionKey: 'canCreateCampaign', enabled: Boolean(features.canCreateCampaign) },
      { permissionKey: 'canPalPointsPartner', enabled: Boolean(features.canPalPointsPartner) },
    );
  } else if (audience === PlanAudience.CREATOR) {
    catalog.limits!.push({ limitKey: 'uploadLimit', limitValue: num(features.uploadLimit, 30) });
    catalog.permissions!.push(
      { permissionKey: 'canUploadReel', enabled: true },
      { permissionKey: 'canAccessCreatorAnalytics', enabled: features.analyticsLevel !== 'basic' },
      { permissionKey: 'verifiedBadge', enabled: Boolean(features.verifiedBadge) },
      { permissionKey: 'priorityRanking', enabled: Boolean(features.priorityRanking) },
    );
  } else {
    catalog.permissions!.push(
      { permissionKey: 'premiumTheme', enabled: Boolean(features.premiumTheme) },
      { permissionKey: 'premiumBadge', enabled: Boolean(features.premiumBadge ?? features.premiumBadge) },
    );
  }

  return catalog;
}

export const planCatalogService = {
  async ensureFeatureCatalog() {
    for (const f of FEATURE_CATALOG) {
      await prisma.subscriptionFeature.upsert({
        where: { key: f.key },
        create: f,
        update: { name: f.name, audience: f.audience, sortOrder: f.sortOrder },
      });
    }
  },

  async applyCatalogToPlan(planId: string, catalog: PlanCatalogInput, tx: any = prisma) {
    if (catalog.limits?.length) {
      await tx.planLimit.deleteMany({ where: { planId } });
      await tx.planLimit.createMany({
        data: catalog.limits.map((l, i) => ({
          planId,
          limitKey: l.limitKey,
          limitValue: l.limitValue,
          displayLabel: l.displayLabel ?? null,
          sortOrder: l.sortOrder ?? i,
        })),
      });
    }
    if (catalog.permissions?.length) {
      await tx.planPermission.deleteMany({ where: { planId } });
      await tx.planPermission.createMany({
        data: catalog.permissions.map((p) => ({
          planId,
          permissionKey: p.permissionKey,
          enabled: p.enabled ?? true,
        })),
      });
    }
    if (catalog.featureKeys?.length) {
      await tx.planFeatureAssignment.deleteMany({ where: { planId } });
      for (const fk of catalog.featureKeys) {
        const feature = await tx.subscriptionFeature.findUnique({ where: { key: fk.key } });
        if (!feature) continue;
        await tx.planFeatureAssignment.create({
          data: {
            planId,
            featureId: feature.id,
            displayValue: fk.displayValue ?? null,
            sortOrder: fk.sortOrder ?? 0,
          },
        });
      }
    }
    if (catalog.highlights?.length) {
      await tx.planHighlight.deleteMany({ where: { planId } });
      await tx.planHighlight.createMany({
        data: catalog.highlights.map((type) => ({ planId, type })),
      });
    }

    const limits = await tx.planLimit.findMany({ where: { planId } });
    const permissions = await tx.planPermission.findMany({ where: { planId } });
    const featuresJson = buildFeaturesJsonFromCatalog(limits, permissions);
    await tx.subscriptionPlan.update({
      where: { id: planId },
      data: { features: featuresJson as Prisma.InputJsonValue },
    });
  },

  formatPlanForClient(plan: Prisma.SubscriptionPlanGetPayload<{ include: typeof planCatalogInclude }>) {
    const featureBullets = plan.featureAssignments.map((a) => a.feature.name);
    const limitSummary = plan.limits.map((l) => ({
      key: l.limitKey,
      value: l.limitValue,
      label: l.displayLabel ?? (l.limitValue === UNLIMITED ? 'Unlimited' : String(l.limitValue)),
      unlimited: l.limitValue === UNLIMITED,
    }));
    return {
      ...plan,
      featureBullets,
      limitSummary,
      highlights: plan.highlights.map((h) => h.type),
    };
  },

  async getDefaultPlansSpec() {
    await this.ensureFeatureCatalog();
    return defaultPlansSpec();
  },
};

export function defaultPlansSpec(): Array<{
  slug: string;
  audience: PlanAudience;
  name: string;
  description: string;
  badge: string;
  color: string;
  sortOrder: number;
  isMostPopular?: boolean;
  isBestValue?: boolean;
  isRecommended?: boolean;
  prices: Array<{ period: string; amountPaise: number }>;
  catalog: PlanCatalogInput;
}> {
  return [
      {
        slug: CANONICAL_PLAN_SLUGS.premium,
        audience: PlanAudience.USER_PREMIUM,
        name: 'Premium',
        description: 'Ad-free PalSafar while your Premium subscription is active.',
        badge: 'Premium',
        color: '#0369A1',
        sortOrder: 0,
        prices: [{ period: 'MONTHLY', amountPaise: 5000 }],
        catalog: {
          permissions: [
            { permissionKey: 'premiumTheme', enabled: true },
            { permissionKey: 'premiumBadge', enabled: true },
            { permissionKey: 'adFree', enabled: true },
          ],
        },
      },
      {
        slug: CANONICAL_PLAN_SLUGS.vendorStarter,
        audience: PlanAudience.VENDOR,
        name: 'Starter',
        description: 'Get discovered on the PalSafar map with a business listing, 1 offer, and 2 reels per month.',
        badge: 'Starter',
        color: '#0E7490',
        sortOrder: 20,
        prices: [{ period: 'MONTHLY', amountPaise: 9900 }],
        catalog: {
          featureKeys: [
            { key: 'business_listing', sortOrder: 1 },
            { key: 'basic_analytics', sortOrder: 2 },
            { key: 'email_support', sortOrder: 3 },
          ],
          limits: [
            { limitKey: 'maxOffers', limitValue: 1, displayLabel: limitDisplay(1, 'active offer') },
            { limitKey: 'maxReels', limitValue: 2, displayLabel: limitDisplay(2, 'reels / month') },
          ],
          permissions: [
            { permissionKey: 'canCreateOffer', enabled: true },
            { permissionKey: 'canAccessAnalytics', enabled: true },
            { permissionKey: 'mapListing', enabled: true },
            { permissionKey: 'featuredListing', enabled: false },
          ],
        },
      },
      {
        slug: CANONICAL_PLAN_SLUGS.vendorGrowth,
        audience: PlanAudience.VENDOR,
        name: 'Growth',
        description: 'Grow with 5 active offers and 7 reels per month, plus a live map listing.',
        badge: 'Growth',
        color: '#0284C7',
        sortOrder: 21,
        isMostPopular: true,
        prices: [{ period: 'MONTHLY', amountPaise: 39900 }],
        catalog: {
          featureKeys: [
            { key: 'business_listing', sortOrder: 1 },
            { key: 'featured_listing', sortOrder: 2 },
            { key: 'advanced_analytics', sortOrder: 3 },
            { key: 'priority_support', sortOrder: 4 },
          ],
          limits: [
            { limitKey: 'maxOffers', limitValue: 5, displayLabel: limitDisplay(5, 'active offers') },
            { limitKey: 'maxReels', limitValue: 7, displayLabel: limitDisplay(7, 'reels / month') },
          ],
          permissions: [
            { permissionKey: 'canCreateOffer', enabled: true },
            { permissionKey: 'canAccessAnalytics', enabled: true },
            { permissionKey: 'canAccessAdvancedAnalytics', enabled: true },
            { permissionKey: 'mapListing', enabled: true },
            { permissionKey: 'featuredListing', enabled: true },
          ],
          highlights: [PlanHighlightType.MOST_POPULAR],
        },
      },
      {
        slug: CANONICAL_PLAN_SLUGS.vendorUnlimited,
        audience: PlanAudience.VENDOR,
        name: 'Unlimited',
        description: 'Unlimited offers and reels, with a live PalSafar map listing.',
        badge: 'Unlimited',
        color: '#0B1F3A',
        sortOrder: 22,
        isBestValue: true,
        prices: [{ period: 'MONTHLY', amountPaise: 199900 }],
        catalog: {
          featureKeys: [
            { key: 'business_listing', sortOrder: 1 },
            { key: 'featured_listing', sortOrder: 2 },
            { key: 'campaign_promotion', sortOrder: 3 },
            { key: 'dedicated_support', sortOrder: 4 },
            { key: 'premium_badge', sortOrder: 5 },
          ],
          limits: [
            { limitKey: 'maxOffers', limitValue: UNLIMITED, displayLabel: 'Unlimited offers' },
            { limitKey: 'maxReels', limitValue: UNLIMITED, displayLabel: 'Unlimited reels' },
          ],
          permissions: [
            { permissionKey: 'canCreateOffer', enabled: true },
            { permissionKey: 'canCreateCampaign', enabled: true },
            { permissionKey: 'canAccessPremiumAnalytics', enabled: true },
            { permissionKey: 'mapListing', enabled: true },
            { permissionKey: 'featuredListing', enabled: true },
            { permissionKey: 'canPalPointsPartner', enabled: true },
          ],
          highlights: [PlanHighlightType.BEST_VALUE],
        },
      },
      {
        slug: CANONICAL_PLAN_SLUGS.creatorPro,
        audience: PlanAudience.CREATOR,
        name: 'Creator Pro',
        description: 'Unlimited reels, campaign opportunities, and creator analytics.',
        badge: 'Pro',
        color: '#7C3AED',
        sortOrder: 30,
        isMostPopular: true,
        prices: [
          { period: 'MONTHLY', amountPaise: 14900 },
          { period: 'QUARTERLY', amountPaise: 39900 },
          { period: 'SEMIANNUAL', amountPaise: 74900 },
          { period: 'YEARLY', amountPaise: 139900 },
        ],
        catalog: {
          featureKeys: [
            { key: 'creator_profile', sortOrder: 1 },
            { key: 'unlimited_reels', sortOrder: 2 },
            { key: 'campaign_opportunities', sortOrder: 3 },
            { key: 'creator_analytics', sortOrder: 4 },
            { key: 'audience_insights', sortOrder: 5 },
            { key: 'monetization_tools', sortOrder: 6 },
            { key: 'creator_badge', sortOrder: 7 },
            { key: 'priority_creator_support', sortOrder: 8 },
            { key: 'early_access', sortOrder: 9 },
          ],
          limits: [{ limitKey: 'uploadLimit', limitValue: UNLIMITED, displayLabel: 'Unlimited uploads' }],
          permissions: [
            { permissionKey: 'canUploadReel', enabled: true },
            { permissionKey: 'canAccessCreatorAnalytics', enabled: true },
            { permissionKey: 'verifiedBadge', enabled: true },
            { permissionKey: 'priorityRanking', enabled: true },
          ],
          highlights: [PlanHighlightType.MOST_POPULAR],
        },
      },
    ];
}

export { UNLIMITED };
