export const GRANT_DURATION_OPTIONS = [
  { months: 1 as const, label: "1 Month" },
  { months: 3 as const, label: "3 Months" },
  { months: 6 as const, label: "6 Months" },
  { months: 12 as const, label: "12 Months" },
];

export type GrantablePlan = {
  id: string;
  name: string;
  slug: string;
  prices?: Array<{ period: string; amountPaise: number; isActive?: boolean }>;
  limits?: Array<{ limitKey: string; limitValue: number; displayLabel?: string | null }>;
  limitSummary?: Array<{ key: string; value: number; label: string; unlimited: boolean }>;
};

function monthlyPaise(plan: GrantablePlan): number | null {
  const monthly = plan.prices?.find((p) => p.period === "MONTHLY" && p.isActive !== false);
  const any = plan.prices?.find((p) => p.isActive !== false);
  const row = monthly || any;
  return row ? row.amountPaise : null;
}

function limitFor(plan: GrantablePlan, key: string): { value: number; unlimited: boolean } | null {
  const fromSummary = plan.limitSummary?.find((l) => l.key === key);
  if (fromSummary) return { value: fromSummary.value, unlimited: fromSummary.unlimited };
  const fromLimits = plan.limits?.find((l) => l.limitKey === key);
  if (fromLimits) return { value: fromLimits.limitValue, unlimited: fromLimits.limitValue === -1 };
  return null;
}

function formatLimit(plan: GrantablePlan, key: string, singular: string, plural: string): string {
  const limit = limitFor(plan, key);
  if (!limit) return `— ${plural}`;
  if (limit.unlimited || limit.value === -1 || limit.value >= 999999) {
    return `Unlimited ${plural}`;
  }
  const unit = limit.value === 1 ? singular : plural;
  return `${limit.value} ${unit}`;
}

export function formatInrFromPaise(amountPaise: number): string {
  return `₹${Math.round(amountPaise / 100).toLocaleString("en-IN")}`;
}

/** Server-driven label, e.g. "Starter: ₹99/mo · 1 offer · 2 reels" */
export function formatVendorPlanOption(plan: GrantablePlan): string {
  const paise = monthlyPaise(plan);
  const price = paise == null ? "Price on request" : `${formatInrFromPaise(paise)}/mo`;
  const offers = formatLimit(plan, "maxOffers", "offer", "offers");
  const reels = formatLimit(plan, "maxReels", "reel", "reels");
  return `${plan.name}: ${price} · ${offers} · ${reels}`;
}
