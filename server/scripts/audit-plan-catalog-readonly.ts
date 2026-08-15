/**
 * Read-only monetization catalog dump.
 * Never INSERT/UPDATE/DELETE. Never calls ensureDefaultPlans().
 */
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const KNOWN_TEST = 'dpg-d9usgk37uimc73al1gv0-a.ohio-postgres.render.com';
const KNOWN_PROD = 'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com';

function hostOf(url?: string): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function dbName(url?: string): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).pathname.replace(/^\//, '').split('?')[0] || null;
  } catch {
    return null;
  }
}

async function dump(label: string, url: string) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      include: {
        prices: { orderBy: { period: 'asc' } },
        limits: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ audience: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    const activeSubs = await prisma.userSubscription.groupBy({
      by: ['planId', 'status'],
      _count: { id: true },
    });
    const subByPlan: Record<string, Record<string, number>> = {};
    for (const row of activeSubs) {
      subByPlan[row.planId] ??= {};
      subByPlan[row.planId][row.status] = row._count.id;
    }

    const [integrity, creatorRefs, paymentsViaSub, invoicesViaSub] = await Promise.all([
      Promise.all([
        prisma.user.count(),
        prisma.vendor.count(),
        prisma.userSubscription.count(),
        prisma.paymentTransaction.count(),
        prisma.invoice.count(),
        prisma.subscriptionPlan.count(),
        prisma.planPrice.count(),
        prisma.planLimit.count(),
      ]).then(([users, vendors, subscriptions, payments, invoices, planCount, prices, limits]) => ({
        users, vendors, subscriptions, payments, invoices, plans: planCount, prices, limits,
      })),
      prisma.creatorProfile.groupBy({
        by: ['membershipPlanId'],
        _count: { id: true },
        where: { membershipPlanId: { not: null } },
      }),
      prisma.paymentTransaction.groupBy({
        by: ['subscriptionId'],
        _count: { id: true },
        where: { subscriptionId: { not: null } },
      }),
      prisma.invoice.count(),
    ]);

    const creatorByPlan: Record<string, number> = {};
    for (const row of creatorRefs) {
      if (row.membershipPlanId) creatorByPlan[row.membershipPlanId] = row._count.id;
    }

    const paymentCountByPlanId: Record<string, number> = {};
    const subs = await prisma.userSubscription.findMany({
      select: { id: true, planId: true },
    });
    const subIdToPlan = Object.fromEntries(subs.map((s) => [s.id, s.planId]));
    for (const row of paymentsViaSub) {
      if (!row.subscriptionId) continue;
      const planId = subIdToPlan[row.subscriptionId];
      if (!planId) continue;
      paymentCountByPlanId[planId] = (paymentCountByPlanId[planId] || 0) + row._count.id;
    }

    const rows = plans.map((p) => ({
      slug: p.slug,
      name: p.name,
      audience: p.audience,
      status: p.status,
      sortOrder: p.sortOrder,
      prices: p.prices.map((pr) => ({
        period: pr.period,
        rupees: pr.amountPaise / 100,
        amountPaise: pr.amountPaise,
        currency: pr.currency,
        isActive: pr.isActive,
      })),
      limits: p.limits.map((l) => ({ key: l.limitKey, value: l.limitValue })),
      featuresMaxOffers: (p.features as Record<string, unknown>)?.maxOffers ?? null,
      featuresMaxReels: (p.features as Record<string, unknown>)?.maxReels ?? null,
      subscriptions: subByPlan[p.id] || {},
      creatorProfiles: creatorByPlan[p.id] || 0,
      paymentsViaSubscription: paymentCountByPlanId[p.id] || 0,
    }));

    console.log(JSON.stringify({
      label,
      host: hostOf(url),
      database: dbName(url),
      integrity,
      invoiceCount: invoicesViaSub,
      planCount: rows.length,
      plans: rows,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const prodUrl = process.env.DATABASE_URL?.trim();
  const testHost = hostOf(testUrl || '');
  const prodHost = hostOf(prodUrl || '');

  if (!testUrl || testHost !== KNOWN_TEST) {
    throw new Error(`Refusing dump: TEST_DATABASE_URL host is ${testHost}, expected known TEST host`);
  }
  await dump('TEST_DATABASE_URL', testUrl);

  if (process.env.AUDIT_PRODUCTION_CATALOG_READONLY === '1' && prodUrl && prodHost === KNOWN_PROD && prodHost !== testHost) {
    await dump('PRODUCTION_DATABASE_URL_READONLY', prodUrl);
  } else {
    console.log(JSON.stringify({
      label: 'PRODUCTION_SKIPPED',
      reason: process.env.AUDIT_PRODUCTION_CATALOG_READONLY === '1'
        ? `DATABASE_URL host ${prodHost} is not the known production host`
        : 'Set AUDIT_PRODUCTION_CATALOG_READONLY=1 for a SELECT-only production dump',
    }, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
