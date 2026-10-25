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
    expect(page).toMatch(/flex h-11 w-full items-center gap-2 rounded-xl/);
    expect(page).toMatch(/<Search size=\{18\}/);
  });

  it("offers bulk delete and approve without reject", () => {
    expect(page).toMatch(/Delete selected/);
    expect(page).toMatch(/runBulkDelete/);
    expect(page).toMatch(/bulkDeletePlaces/);
    expect(page).toMatch(/Approve selected/);
    expect(page).not.toMatch(/Reject selected/);
    expect(page).not.toMatch(/handleReject/);
    expect(page).not.toMatch(/"REJECTED"/);
  });

  it("resets page when committed search changes", () => {
    expect(page).toMatch(/pageAfterSearchChange/);
  });

  it("lets the admin pick 25, 50, 75, or 100 rows per page", () => {
    expect(page).toMatch(/PAGE_SIZE_OPTIONS/);
    expect(page).toMatch(/onPageSizeChange/);
    const constants = read("app/dashboard/places/constants.ts");
    expect(constants).toMatch(/25,\s*50,\s*75,\s*100/);
  });
});

describe("admin Places delete API client", () => {
  const service = read("services/places.ts");

  it("deletes selected places in one bulk-delete request and never calls delete-all", () => {
    const fn = service.match(/export async function bulkDeletePlaces[\s\S]*?(?=\nexport async function)/)?.[0] ?? "";
    expect(fn).toContain("export async function bulkDeletePlaces");
    expect(fn).toMatch(/\/admin\/places\/bulk-delete/);
    expect(fn).not.toMatch(/await deletePlace\(id\)/);
    expect(fn).not.toMatch(/deleteAllPlaces/);
    expect(fn).not.toMatch(/client\.delete\("\/admin\/places"\)/);
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
