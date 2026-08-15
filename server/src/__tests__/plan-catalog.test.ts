import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PlanAudience } from '@prisma/client';
import { inferCatalogFromLegacyFeatures, buildFeaturesJsonFromCatalog } from '../modules/monetization/plan-catalog.service';

describe('plan catalog', () => {
  it('infers vendor limits and permissions from legacy features JSON', () => {
    const catalog = inferCatalogFromLegacyFeatures(PlanAudience.VENDOR, {
      maxOffers: 5,
      maxReels: 10,
      analyticsLevel: 'advanced',
      featuredListing: true,
    });

    expect(catalog.limits?.find((l) => l.limitKey === 'maxOffers')?.limitValue).toBe(5);
    expect(catalog.permissions?.find((p) => p.permissionKey === 'featuredListing')?.enabled).toBe(true);
    expect(catalog.permissions?.find((p) => p.permissionKey === 'canAccessAdvancedAnalytics')?.enabled).toBe(true);
  });

  it('round-trips limits into features JSON', () => {
    const json = buildFeaturesJsonFromCatalog(
      [
        { limitKey: 'maxOffers', limitValue: 2 },
        { limitKey: 'uploadLimit', limitValue: -1 },
      ],
      [
        { permissionKey: 'canCreateOffer', enabled: true },
        { permissionKey: 'verifiedBadge', enabled: true },
      ],
    );

    expect(json.maxOffers).toBe(2);
    expect(json.uploadLimit).toBe(999999);
    expect(json.verifiedBadge).toBe(true);
  });

  it('seeds Premium ₹50/month and vendor Starter/Growth/Unlimited defaults', async () => {
    const { defaultPlansSpec, CANONICAL_PLAN_SLUGS, UNLIMITED } = await import('../modules/monetization/plan-catalog.service');
    const specs = defaultPlansSpec();
    const premium = specs.find((p) => p.slug === CANONICAL_PLAN_SLUGS.premium);
    const starter = specs.find((p) => p.slug === CANONICAL_PLAN_SLUGS.vendorStarter);
    const growth = specs.find((p) => p.slug === CANONICAL_PLAN_SLUGS.vendorGrowth);
    const unlimited = specs.find((p) => p.slug === CANONICAL_PLAN_SLUGS.vendorUnlimited);

    expect(premium?.prices[0]).toMatchObject({ period: 'MONTHLY', amountPaise: 5000 });
    expect(starter?.prices[0]).toMatchObject({ period: 'MONTHLY', amountPaise: 9900 });
    expect(starter?.catalog.limits?.find((l) => l.limitKey === 'maxOffers')?.limitValue).toBe(1);
    expect(starter?.catalog.limits?.find((l) => l.limitKey === 'maxReels')?.limitValue).toBe(2);
    expect(growth?.prices[0]).toMatchObject({ period: 'MONTHLY', amountPaise: 39900 });
    expect(growth?.catalog.limits?.find((l) => l.limitKey === 'maxOffers')?.limitValue).toBe(5);
    expect(growth?.catalog.limits?.find((l) => l.limitKey === 'maxReels')?.limitValue).toBe(7);
    expect(unlimited?.prices[0]).toMatchObject({ period: 'MONTHLY', amountPaise: 199900 });
    expect(unlimited?.catalog.limits?.find((l) => l.limitKey === 'maxOffers')?.limitValue).toBe(UNLIMITED);
    expect(unlimited?.catalog.limits?.find((l) => l.limitKey === 'maxReels')?.limitValue).toBe(UNLIMITED);
    expect(specs.some((p) => p.slug === 'vendor-gold')).toBe(false);
  });

  it('public launch slugs are canonical Premium + Starter/Growth/Unlimited', async () => {
    const { PUBLIC_LAUNCH_SLUGS, CANONICAL_PLAN_SLUGS } = await import('../modules/monetization/plan-catalog.service');
    expect(PUBLIC_LAUNCH_SLUGS.USER_PREMIUM).toEqual([CANONICAL_PLAN_SLUGS.premium]);
    expect(PUBLIC_LAUNCH_SLUGS.VENDOR).toEqual([
      CANONICAL_PLAN_SLUGS.vendorStarter,
      CANONICAL_PLAN_SLUGS.vendorGrowth,
      CANONICAL_PLAN_SLUGS.vendorUnlimited,
    ]);
    expect(PUBLIC_LAUNCH_SLUGS.VENDOR).not.toContain('vendor-gold');
    expect(PUBLIC_LAUNCH_SLUGS.USER_PREMIUM).not.toContain('user-premium-3mo');
  });

  it('listPublic is a read-only SELECT and never calls ensureDefaultPlans', () => {
    const src = fs.readFileSync(path.join(__dirname, '../modules/monetization/plans.service.ts'), 'utf8');
    const start = src.indexOf('async listPublic(');
    const end = src.indexOf('async getById(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const listPublic = src.slice(start, end);
    expect(listPublic).not.toMatch(/ensureDefaultPlans/);
    expect(listPublic).toMatch(/PUBLIC_LAUNCH_SLUGS/);
    expect(listPublic).toMatch(/findMany/);
    expect(listPublic).not.toMatch(/\.create\(/);
    expect(listPublic).not.toMatch(/\.update/);
    expect(listPublic).not.toMatch(/\.delete/);
    expect(listPublic).not.toMatch(/updateMany/);
  });
});
