/**
 * Production launch catalog migration.
 * Connects ONLY to the known Singapore production host.
 * Never uses TEST_DATABASE_URL.
 * Destructive plan deletion is disabled unless a backup is confirmed.
 */
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, PlanAudience, PlanBillingPeriod, PlanStatus, PlanHighlightType } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const KNOWN_PROD = 'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com';
const KNOWN_TEST = 'dpg-d9usgk37uimc73al1gv0-a.ohio-postgres.render.com';
const APPLY = process.argv.includes('--apply');
const UNLIMITED = -1;

const LAUNCH = {
  premium: {
    slug: 'user-premium',
    audience: PlanAudience.USER_PREMIUM,
    name: 'Premium',
    description: 'Ad-free PalSafar while your Premium subscription is active.',
    badge: 'Premium',
    color: '#0369A1',
    sortOrder: 0,
    amountPaise: 5000,
    limits: [] as Array<{ limitKey: string; limitValue: number; displayLabel: string }>,
    permissions: [
      { permissionKey: 'premiumTheme', enabled: true },
      { permissionKey: 'premiumBadge', enabled: true },
      { permissionKey: 'adFree', enabled: true },
    ],
  },
  starter: {
    slug: 'vendor-starter',
    audience: PlanAudience.VENDOR,
    name: 'Starter',
    description: 'Get discovered on the PalSafar map with a business listing, 1 offer, and 2 reels per month.',
    badge: 'Starter',
    color: '#0E7490',
    sortOrder: 20,
    amountPaise: 9900,
    isMostPopular: false,
    isBestValue: false,
    limits: [
      { limitKey: 'maxOffers', limitValue: 1, displayLabel: '1 active offer' },
      { limitKey: 'maxReels', limitValue: 2, displayLabel: '2 reels / month' },
    ],
    permissions: [
      { permissionKey: 'canCreateOffer', enabled: true },
      { permissionKey: 'canAccessAnalytics', enabled: true },
      { permissionKey: 'mapListing', enabled: true },
      { permissionKey: 'featuredListing', enabled: false },
    ],
  },
  growth: {
    slug: 'vendor-growth',
    audience: PlanAudience.VENDOR,
    name: 'Growth',
    description: 'Grow with 5 active offers and 7 reels per month, plus a live map listing.',
    badge: 'Growth',
    color: '#0284C7',
    sortOrder: 21,
    amountPaise: 39900,
    isMostPopular: true,
    isBestValue: false,
    limits: [
      { limitKey: 'maxOffers', limitValue: 5, displayLabel: '5 active offers' },
      { limitKey: 'maxReels', limitValue: 7, displayLabel: '7 reels / month' },
    ],
    permissions: [
      { permissionKey: 'canCreateOffer', enabled: true },
      { permissionKey: 'canAccessAnalytics', enabled: true },
      { permissionKey: 'canAccessAdvancedAnalytics', enabled: true },
      { permissionKey: 'mapListing', enabled: true },
      { permissionKey: 'featuredListing', enabled: true },
    ],
  },
  unlimited: {
    slug: 'vendor-unlimited',
    audience: PlanAudience.VENDOR,
    name: 'Unlimited',
    description: 'Unlimited offers and reels, with a live PalSafar map listing.',
    badge: 'Unlimited',
    color: '#0B1F3A',
    sortOrder: 22,
    amountPaise: 199900,
    isMostPopular: false,
    isBestValue: true,
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
  },
} as const;

const LEGACY_SLUGS = [
  'user-premium-3mo',
  'vendor-silver',
  'vendor-gold',
  'vendor-platinum',
  'vendor-diamond',
] as const;

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function assertProductionUrl(url: string) {
  const host = hostOf(url);
  if (host === KNOWN_TEST) {
    throw new Error('Refusing: DATABASE_URL points at the TEST host');
  }
  if (host !== KNOWN_PROD) {
    throw new Error(`Refusing: DATABASE_URL host is not the known production host (${host})`);
  }
  const db = new URL(url).pathname.replace(/^\//, '').split('?')[0];
  if (db !== 'palsafar') {
    throw new Error(`Refusing: unexpected production database name ${db}`);
  }
}

async function integrity(prisma: PrismaClient) {
  const [users, vendors, subscriptions, payments, invoices, plans] = await Promise.all([
    prisma.user.count(),
    prisma.vendor.count(),
    prisma.userSubscription.count(),
    prisma.paymentTransaction.count(),
    prisma.invoice.count(),
    prisma.subscriptionPlan.count(),
  ]);
  return { users, vendors, subscriptions, payments, invoices, plans };
}

async function auditPlan(prisma: PrismaClient, slug: string) {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { slug },
    include: { prices: true, limits: true },
  });
  if (!plan) {
    return { slug, exists: false };
  }
  const [subsByStatus, creatorRefs, paymentsViaSub] = await Promise.all([
    prisma.userSubscription.groupBy({
      by: ['status'],
      where: { planId: plan.id },
      _count: { id: true },
    }),
    prisma.creatorProfile.count({ where: { membershipPlanId: plan.id } }),
    prisma.paymentTransaction.count({
      where: { subscription: { planId: plan.id } },
    }),
  ]);
  return {
    slug,
    exists: true,
    id: plan.id,
    name: plan.name,
    status: plan.status,
    audience: plan.audience,
    prices: plan.prices.map((p) => ({
      period: p.period,
      rupees: p.amountPaise / 100,
      isActive: p.isActive,
    })),
    limits: plan.limits.map((l) => ({ key: l.limitKey, value: l.limitValue })),
    subscriptions: Object.fromEntries(subsByStatus.map((s) => [s.status, s._count.id])),
    creatorProfiles: creatorRefs,
    paymentsViaSubscription: paymentsViaSub,
  };
}

async function upsertLaunchPlan(
  prisma: PrismaClient,
  spec: (typeof LAUNCH)[keyof typeof LAUNCH],
) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { slug: spec.slug } });
  const plan = existing
    ? await prisma.subscriptionPlan.update({
        where: { id: existing.id },
        data: {
          audience: spec.audience,
          name: spec.name,
          description: spec.description,
          badge: spec.badge,
          color: spec.color,
          status: PlanStatus.ACTIVE,
          sortOrder: spec.sortOrder,
          isMostPopular: 'isMostPopular' in spec ? !!spec.isMostPopular : false,
          isBestValue: 'isBestValue' in spec ? !!spec.isBestValue : false,
        },
      })
    : await prisma.subscriptionPlan.create({
        data: {
          audience: spec.audience,
          name: spec.name,
          slug: spec.slug,
          description: spec.description,
          badge: spec.badge,
          color: spec.color,
          status: PlanStatus.ACTIVE,
          sortOrder: spec.sortOrder,
          isMostPopular: 'isMostPopular' in spec ? !!spec.isMostPopular : false,
          isBestValue: 'isBestValue' in spec ? !!spec.isBestValue : false,
          trialDays: 0,
          gracePeriodDays: 3,
        },
      });

  const monthly = await prisma.planPrice.findUnique({
    where: { planId_period: { planId: plan.id, period: PlanBillingPeriod.MONTHLY } },
  });
  if (monthly) {
    await prisma.planPrice.update({
      where: { id: monthly.id },
      data: { amountPaise: spec.amountPaise, currency: 'INR', isActive: true },
    });
  } else {
    await prisma.planPrice.create({
      data: {
        planId: plan.id,
        period: PlanBillingPeriod.MONTHLY,
        amountPaise: spec.amountPaise,
        currency: 'INR',
        isActive: true,
      },
    });
  }

  await prisma.planPrice.updateMany({
    where: { planId: plan.id, period: { not: PlanBillingPeriod.MONTHLY } },
    data: { isActive: false },
  });

  await prisma.planLimit.deleteMany({ where: { planId: plan.id } });
  if (spec.limits.length) {
    await prisma.planLimit.createMany({
      data: spec.limits.map((l, i) => ({
        planId: plan.id,
        limitKey: l.limitKey,
        limitValue: l.limitValue,
        displayLabel: l.displayLabel,
        sortOrder: i,
      })),
    });
  }

  await prisma.planPermission.deleteMany({ where: { planId: plan.id } });
  await prisma.planPermission.createMany({
    data: spec.permissions.map((p) => ({
      planId: plan.id,
      permissionKey: p.permissionKey,
      enabled: p.enabled,
    })),
  });

  const limits = await prisma.planLimit.findMany({ where: { planId: plan.id } });
  const permissions = await prisma.planPermission.findMany({ where: { planId: plan.id } });
  const features: Record<string, unknown> = {};
  for (const l of limits) {
    features[l.limitKey] = l.limitValue === UNLIMITED ? 999999 : l.limitValue;
  }
  for (const p of permissions) {
    features[p.permissionKey] = p.enabled;
  }
  await prisma.subscriptionPlan.update({
    where: { id: plan.id },
    data: { features: features as any },
  });

  if ('isMostPopular' in spec && spec.isMostPopular) {
    await prisma.planHighlight.upsert({
      where: { planId_type: { planId: plan.id, type: PlanHighlightType.MOST_POPULAR } },
      create: { planId: plan.id, type: PlanHighlightType.MOST_POPULAR },
      update: {},
    });
  }
  if ('isBestValue' in spec && spec.isBestValue) {
    await prisma.planHighlight.upsert({
      where: { planId_type: { planId: plan.id, type: PlanHighlightType.BEST_VALUE } },
      create: { planId: plan.id, type: PlanHighlightType.BEST_VALUE },
      update: {},
    });
  }

  return { slug: spec.slug, action: existing ? 'updated' : 'created', id: plan.id };
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required');
  assertProductionUrl(url);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    const before = await integrity(prisma);
    const launchAudit = await Promise.all(Object.values(LAUNCH).map((p) => auditPlan(prisma, p.slug)));
    const legacyAudit = await Promise.all(LEGACY_SLUGS.map((slug) => auditPlan(prisma, slug)));
    const creator = await auditPlan(prisma, 'creator-pro');

    console.log(JSON.stringify({
      mode: APPLY ? 'APPLY' : 'AUDIT',
      host: KNOWN_PROD,
      database: 'palsafar',
      backupConfirmed: false,
      destructiveDeletionAllowed: false,
      deployedPublicGetMutatesCatalog: true,
      before,
      launchAudit,
      legacyAudit,
      creatorPro: creator,
    }, null, 2));

    if (!APPLY) {
      console.log('AUDIT_ONLY: re-run with --apply to create/update launch plans and INACTIVE old plans. No deletes.');
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const upserts = [];
      for (const spec of Object.values(LAUNCH)) {
        upserts.push(await upsertLaunchPlan(tx as unknown as PrismaClient, spec));
      }

      const deactivated = await tx.subscriptionPlan.updateMany({
        where: { slug: { in: [...LEGACY_SLUGS] } },
        data: { status: PlanStatus.INACTIVE },
      });

      const duplicates = await tx.subscriptionPlan.groupBy({
        by: ['slug'],
        _count: { slug: true },
        having: { slug: { _count: { gt: 1 } } },
      });
      if (duplicates.length) {
        throw new Error(`Duplicate slugs: ${duplicates.map((d) => d.slug).join(', ')}`);
      }

      return { upserts, deactivated: deactivated.count };
    }, { timeout: 60000 });

    const after = await integrity(prisma);
    const launchAfter = await Promise.all(Object.values(LAUNCH).map((p) => auditPlan(prisma, p.slug)));
    const legacyAfter = await Promise.all(LEGACY_SLUGS.map((slug) => auditPlan(prisma, slug)));
    const creatorAfter = await auditPlan(prisma, 'creator-pro');

    const publicPremium = (await prisma.subscriptionPlan.findMany({
      where: { audience: PlanAudience.USER_PREMIUM, status: PlanStatus.ACTIVE },
      include: { prices: { where: { isActive: true } }, limits: true },
      orderBy: { sortOrder: 'asc' },
    })).map((p) => ({ slug: p.slug, prices: p.prices, limits: p.limits }));
    const publicVendor = (await prisma.subscriptionPlan.findMany({
      where: { audience: PlanAudience.VENDOR, status: PlanStatus.ACTIVE },
      include: { prices: { where: { isActive: true } }, limits: true },
      orderBy: { sortOrder: 'asc' },
    })).map((p) => ({ slug: p.slug, prices: p.prices, limits: p.limits }));

    console.log(JSON.stringify({
      applied: true,
      deleted: [],
      retainedInactive: LEGACY_SLUGS,
      result,
      after,
      unchangedCounts: {
        users: before.users === after.users,
        vendors: before.vendors === after.vendors,
        subscriptions: before.subscriptions === after.subscriptions,
        payments: before.payments === after.payments,
        invoices: before.invoices === after.invoices,
      },
      launchAfter,
      legacyAfter,
      creatorPro: creatorAfter,
      dbEquivalentPublicPremium: publicPremium,
      dbEquivalentPublicVendor: publicVendor,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
