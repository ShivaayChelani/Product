import { PlanAudience, PlanBillingPeriod, PlanStatus } from '@prisma/client';
import { PUBLIC_LAUNCH_SLUGS } from './plan-catalog.service';

export const GRANT_DURATION_MONTHS = [1, 3, 6, 12] as const;
export type GrantDurationMonths = (typeof GRANT_DURATION_MONTHS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isGrantDurationMonths(value: number): value is GrantDurationMonths {
  return (GRANT_DURATION_MONTHS as readonly number[]).includes(value);
}

/** Maps the admin duration dropdown onto the existing billing-period enum. */
export function periodForGrantDuration(months: GrantDurationMonths): PlanBillingPeriod {
  if (months === 3) return PlanBillingPeriod.QUARTERLY;
  if (months === 6) return PlanBillingPeriod.SEMIANNUAL;
  if (months === 12) return PlanBillingPeriod.YEARLY;
  return PlanBillingPeriod.MONTHLY;
}

/** Same day counts as paid checkout (`periodDays`) so grant length matches catalog periods. */
export function grantDurationDays(months: GrantDurationMonths): number {
  if (months === 3) return 90;
  if (months === 6) return 180;
  if (months === 12) return 365;
  return 30;
}

/**
 * Never shorten an existing term: new expiry is the later of remaining time and the granted duration.
 */
export function resolveGrantPeriodEnd(
  now: Date,
  durationDays: number,
  existingEnd?: Date | null,
): Date {
  const requested = new Date(now.getTime() + durationDays * MS_PER_DAY);
  if (existingEnd && existingEnd.getTime() > requested.getTime()) return existingEnd;
  return requested;
}

export function isCanonicalVendorPlanSlug(slug: string): boolean {
  return (PUBLIC_LAUNCH_SLUGS[PlanAudience.VENDOR] as readonly string[]).includes(slug);
}

export function isGrantableVendorPlan(plan: { status: PlanStatus | string; audience: PlanAudience | string; slug: string }): boolean {
  return (
    plan.status === PlanStatus.ACTIVE &&
    plan.audience === PlanAudience.VENDOR &&
    isCanonicalVendorPlanSlug(plan.slug)
  );
}
