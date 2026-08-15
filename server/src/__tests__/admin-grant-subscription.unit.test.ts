import { describe, expect, it } from 'vitest';
import { PlanAudience, PlanBillingPeriod, PlanStatus } from '@prisma/client';
import {
  grantDurationDays,
  isCanonicalVendorPlanSlug,
  isGrantableVendorPlan,
  periodForGrantDuration,
  resolveGrantPeriodEnd,
} from '../modules/monetization/grant-subscription';
import { CANONICAL_PLAN_SLUGS } from '../modules/monetization/plan-catalog.service';

describe('admin grant subscription helpers', () => {
  it('maps duration months onto catalog billing periods and day counts', () => {
    expect(periodForGrantDuration(1)).toBe(PlanBillingPeriod.MONTHLY);
    expect(periodForGrantDuration(3)).toBe(PlanBillingPeriod.QUARTERLY);
    expect(periodForGrantDuration(6)).toBe(PlanBillingPeriod.SEMIANNUAL);
    expect(periodForGrantDuration(12)).toBe(PlanBillingPeriod.YEARLY);
    expect(grantDurationDays(1)).toBe(30);
    expect(grantDurationDays(3)).toBe(90);
    expect(grantDurationDays(6)).toBe(180);
    expect(grantDurationDays(12)).toBe(365);
  });

  it('never shortens an existing expiry', () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    const existing = new Date('2027-08-15T00:00:00.000Z');
    const shortenedAttempt = resolveGrantPeriodEnd(now, 30, existing);
    expect(shortenedAttempt.toISOString()).toBe(existing.toISOString());

    const longerGrant = resolveGrantPeriodEnd(now, 365, new Date('2026-09-01T00:00:00.000Z'));
    expect(longerGrant.getTime()).toBe(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  });

  it('resolves only canonical active vendor plans', () => {
    expect(isCanonicalVendorPlanSlug(CANONICAL_PLAN_SLUGS.vendorStarter)).toBe(true);
    expect(isCanonicalVendorPlanSlug(CANONICAL_PLAN_SLUGS.vendorGrowth)).toBe(true);
    expect(isCanonicalVendorPlanSlug(CANONICAL_PLAN_SLUGS.vendorUnlimited)).toBe(true);
    expect(isCanonicalVendorPlanSlug(CANONICAL_PLAN_SLUGS.premium)).toBe(false);
    expect(
      isGrantableVendorPlan({
        status: PlanStatus.ACTIVE,
        audience: PlanAudience.VENDOR,
        slug: CANONICAL_PLAN_SLUGS.vendorUnlimited,
      }),
    ).toBe(true);
    expect(
      isGrantableVendorPlan({
        status: PlanStatus.INACTIVE,
        audience: PlanAudience.VENDOR,
        slug: CANONICAL_PLAN_SLUGS.vendorStarter,
      }),
    ).toBe(false);
  });
});
