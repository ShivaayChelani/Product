import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "../../..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("admin Places table columns", () => {
  const page = read("app/dashboard/places/page.tsx");

  it("does not define Rating or Reviews columns", () => {
    expect(page).not.toMatch(/header:\s*"Rating"/);
    expect(page).not.toMatch(/header:\s*"Reviews"/);
    expect(page).not.toMatch(/key:\s*"rating"/);
    expect(page).not.toMatch(/key:\s*"reviewCount"/);
  });

  it("shows Priority Order from editorialPriority", () => {
    expect(page).toMatch(/header:\s*"Priority Order"/);
    expect(page).toMatch(/key:\s*"editorialPriority"/);
    expect(page).toMatch(/i\.editorialPriority/);
    expect(page).not.toMatch(/Math\.random/);
  });

  it("sends server sort field and direction instead of sorting the current page", () => {
    expect(page).toMatch(/sortDir/);
    expect(page).toMatch(/sort:\s*sortParam/);
    expect(page).not.toMatch(/sortPlaces\(rows,\s*sortKey/);
  });

  it("uses Places search UX: name/city/state placeholder, icon, and clear button", () => {
    expect(page).toMatch(/Search by name, city or state/);
    expect(page).toMatch(/aria-label="Clear search"/);
    expect(page).toMatch(/clearSearch/);
    expect(page).toMatch(/No places match your search/);
  });

  it("resets page when committed search changes", () => {
    expect(page).toMatch(/pageAfterSearchChange/);
  });
});

describe("vendor review functionality remains untouched", () => {
  it("vendor profile still renders vendor reviews", () => {
    const src = read("app/dashboard/vendors/[id]/page.tsx");
    expect(src).toMatch(/vendorReviews/);
    expect(src).toMatch(/Reviews/);
  });

  it("reviews moderation table still has a Rating column", () => {
    const src = read("app/dashboard/reviews/page.tsx");
    expect(src).toMatch(/header:\s*"Rating"/);
    expect(src).toMatch(/getReviews/);
  });
});
