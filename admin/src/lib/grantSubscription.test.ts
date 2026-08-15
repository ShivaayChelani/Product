import { describe, expect, it } from "vitest";
import { formatVendorPlanOption } from "./grantSubscription";

describe("formatVendorPlanOption", () => {
  it("uses server price and limits rather than hardcoded catalog copy", () => {
    expect(
      formatVendorPlanOption({
        id: "1",
        name: "Starter",
        slug: "vendor-starter",
        prices: [{ period: "MONTHLY", amountPaise: 9900, isActive: true }],
        limits: [
          { limitKey: "maxOffers", limitValue: 1 },
          { limitKey: "maxReels", limitValue: 2 },
        ],
      }),
    ).toBe("Starter: ₹99/mo · 1 offer · 2 reels");

    expect(
      formatVendorPlanOption({
        id: "2",
        name: "Growth",
        slug: "vendor-growth",
        prices: [{ period: "MONTHLY", amountPaise: 39900, isActive: true }],
        limits: [
          { limitKey: "maxOffers", limitValue: 5 },
          { limitKey: "maxReels", limitValue: 7 },
        ],
      }),
    ).toBe("Growth: ₹399/mo · 5 offers · 7 reels");

    expect(
      formatVendorPlanOption({
        id: "3",
        name: "Unlimited",
        slug: "vendor-unlimited",
        prices: [{ period: "MONTHLY", amountPaise: 199900, isActive: true }],
        limits: [
          { limitKey: "maxOffers", limitValue: -1 },
          { limitKey: "maxReels", limitValue: -1 },
        ],
      }),
    ).toBe("Unlimited: ₹1,999/mo · Unlimited offers · Unlimited reels");
  });
});
