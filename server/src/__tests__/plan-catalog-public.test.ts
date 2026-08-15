import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { plansService } from '../modules/monetization/plans.service';
import { CANONICAL_PLAN_SLUGS, LEGACY_PLAN_SLUGS } from '../modules/monetization/plan-catalog.service';

function monthlyPaise(plan: { prices?: Array<{ period: string; amountPaise: number; isActive?: boolean }> }) {
  return plan.prices?.find((p) => p.period === 'MONTHLY')?.amountPaise;
}

function limitValue(plan: { limits?: Array<{ limitKey: string; limitValue: number }> }, key: string) {
  return plan.limits?.find((l) => l.limitKey === key)?.limitValue;
}

async function catalogFingerprint() {
  const [plans, prices, limits, subscriptions, payments] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      select: { id: true, slug: true, status: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    }),
    prisma.planPrice.findMany({
      select: { id: true, planId: true, period: true, amountPaise: true, isActive: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.planLimit.findMany({
      select: { id: true, planId: true, limitKey: true, limitValue: true },
      orderBy: { id: 'asc' },
    }),
    prisma.userSubscription.count(),
    prisma.paymentTransaction.count(),
  ]);
  return { plans, prices, limits, subscriptions, payments, planCount: plans.length };
}

describe('Public launch catalog resolution (TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    await plansService.ensureDefaultPlans();
  }, 180000);

  it('does not call ensureDefaultPlans on public GET', async () => {
    const spy = vi.spyOn(plansService, 'ensureDefaultPlans');
    const res = await request(app).get('/api/v1/monetization/plans?audience=USER_PREMIUM');
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('repeated public GET does not mutate plans, prices, limits, or billing history', async () => {
    const before = await catalogFingerprint();
    await Promise.all([
      request(app).get('/api/v1/monetization/plans?audience=USER_PREMIUM'),
      request(app).get('/api/v1/monetization/plans?audience=VENDOR'),
      request(app).get('/api/v1/monetization/plans?audience=CREATOR'),
    ]);
    await request(app).get('/api/v1/monetization/plans?audience=USER_PREMIUM');
    const after = await catalogFingerprint();
    expect(after).toEqual(before);
  });

  it('does not expose leftover test-* or Silver/Gold rows on public Premium/Vendor lists', async () => {
    const [premium, vendor] = await Promise.all([
      request(app).get('/api/v1/monetization/plans?audience=USER_PREMIUM'),
      request(app).get('/api/v1/monetization/plans?audience=VENDOR'),
    ]);
    expect(premium.status).toBe(200);
    expect(vendor.status).toBe(200);

    const premiumSlugs = (premium.body.data || []).map((p: { slug: string }) => p.slug);
    const vendorSlugs = (vendor.body.data || []).map((p: { slug: string }) => p.slug);

    expect(premiumSlugs).toEqual([CANONICAL_PLAN_SLUGS.premium]);
    expect(vendorSlugs.sort()).toEqual([
      CANONICAL_PLAN_SLUGS.vendorGrowth,
      CANONICAL_PLAN_SLUGS.vendorStarter,
      CANONICAL_PLAN_SLUGS.vendorUnlimited,
    ].sort());
    expect(vendorSlugs.some((s: string) => s.startsWith('test-'))).toBe(false);
    expect(vendorSlugs).not.toContain('vendor-gold');
    expect(premiumSlugs).not.toContain('user-premium-3mo');
  });

  it('resolves launch prices and limits from Admin/DB rows, not client defaults', async () => {
    const [premiumRes, vendorRes] = await Promise.all([
      request(app).get('/api/v1/monetization/plans?audience=USER_PREMIUM'),
      request(app).get('/api/v1/monetization/plans?audience=VENDOR'),
    ]);
    const premium = (premiumRes.body.data || []).find((p: { slug: string }) => p.slug === CANONICAL_PLAN_SLUGS.premium);
    const starter = (vendorRes.body.data || []).find((p: { slug: string }) => p.slug === CANONICAL_PLAN_SLUGS.vendorStarter);
    const growth = (vendorRes.body.data || []).find((p: { slug: string }) => p.slug === CANONICAL_PLAN_SLUGS.vendorGrowth);
    const unlimited = (vendorRes.body.data || []).find((p: { slug: string }) => p.slug === CANONICAL_PLAN_SLUGS.vendorUnlimited);

    expect(monthlyPaise(premium)).toBe(5000);
    expect((premium.prices || []).every((p: { period: string }) => p.period === 'MONTHLY')).toBe(true);
    expect((premium.prices || []).some((p: { period: string }) => p.period === 'LIFETIME')).toBe(false);
    expect(monthlyPaise(starter)).toBe(9900);
    expect(limitValue(starter, 'maxOffers')).toBe(1);
    expect(limitValue(starter, 'maxReels')).toBe(2);
    expect(monthlyPaise(growth)).toBe(39900);
    expect(limitValue(growth, 'maxOffers')).toBe(5);
    expect(limitValue(growth, 'maxReels')).toBe(7);
    expect(monthlyPaise(unlimited)).toBe(199900);
    expect(limitValue(unlimited, 'maxOffers')).toBe(-1);
    expect(limitValue(unlimited, 'maxReels')).toBe(-1);

    const dbPremium = await prisma.subscriptionPlan.findUnique({
      where: { slug: CANONICAL_PLAN_SLUGS.premium },
      include: { prices: true },
    });
    expect(monthlyPaise(dbPremium!)).toBe(monthlyPaise(premium));
  });

  it('leaves legacy slugs out of the public checkout list even if they exist', async () => {
    const vendor = await request(app).get('/api/v1/monetization/plans?audience=VENDOR');
    const slugs = (vendor.body.data || []).map((p: { slug: string }) => p.slug);
    for (const legacy of LEGACY_PLAN_SLUGS) {
      expect(slugs).not.toContain(legacy);
    }
  });

  it('creator public list returns only creator-pro', async () => {
    const res = await request(app).get('/api/v1/monetization/plans?audience=CREATOR');
    expect(res.status).toBe(200);
    expect((res.body.data || []).map((p: { slug: string }) => p.slug)).toEqual([CANONICAL_PLAN_SLUGS.creatorPro]);
  });
});
