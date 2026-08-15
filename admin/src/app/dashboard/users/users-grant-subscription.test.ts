import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "../../..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Admin Users Grant Subscription wiring", () => {
  it("shows Grant Subscription only for vendor accounts and opens the grant modal", () => {
    const page = read("app/dashboard/users/page.tsx");
    expect(page).toMatch(/isVendorAccount/);
    expect(page).toMatch(/Grant Subscription/);
    expect(page).toMatch(/GrantSubscriptionModal/);
    expect(page).not.toMatch(/title="Grant free subscription"/);
  });

  it("grant modal loads server catalog and duration months instead of hardcoded prices", () => {
    const modal = read("components/GrantSubscriptionModal.tsx");
    expect(modal).toMatch(/Grant Vendor Subscription/);
    expect(modal).toMatch(/getGrantContext/);
    expect(modal).toMatch(/durationMonths/);
    expect(modal).toMatch(/formatVendorPlanOption/);
    expect(modal).not.toMatch(/9900/);
    expect(modal).not.toMatch(/period:\s*"MONTHLY"/);
  });
});
