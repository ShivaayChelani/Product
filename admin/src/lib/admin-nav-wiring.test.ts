import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminSrc = join(__dirname, "..");

function dashboardPagePath(href: string): string {
  const relative = href.replace(/^\/dashboard\/?/, "");
  return relative
    ? join(adminSrc, "app", "dashboard", ...relative.split("/"), "page.tsx")
    : join(adminSrc, "app", "dashboard", "page.tsx");
}

function sidebarHrefs(): string[] {
  const src = readFileSync(join(adminSrc, "components", "Sidebar.tsx"), "utf8");
  return [...src.matchAll(/href:\s*"(\/dashboard[^"]*)"/g)].map((match) => match[1]);
}

function breadcrumbKeys(): string[] {
  const src = readFileSync(join(adminSrc, "components", "layout", "Breadcrumbs.tsx"), "utf8");
  return [...src.matchAll(/^\s+"?([a-z0-9-]+)"?\s*:/gm)].map((match) => match[1]);
}

function dashboardSegments(): string[] {
  const root = join(adminSrc, "app", "dashboard");
  const segments = new Set<string>();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith("[") && entry.endsWith("]")) {
        segments.add(entry.slice(1, -1));
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        continue;
      }
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        segments.add(entry);
        walk(full);
      }
    }
  };

  walk(root);
  return [...segments];
}

describe("admin dashboard wiring", () => {
  it("every Sidebar href has a matching dashboard page", () => {
    const hrefs = sidebarHrefs();
    expect(hrefs.length).toBeGreaterThan(20);
    const missing = hrefs.filter((href) => !existsSync(dashboardPagePath(href)));
    expect(missing).toEqual([]);
  });

  it("labels Moments instead of Reels in the sidebar", () => {
    const src = readFileSync(join(adminSrc, "components", "Sidebar.tsx"), "utf8");
    expect(src).toMatch(/label:\s*"Moments"/);
    expect(src).not.toMatch(/Reels & Content/);
  });

  it("covers every static dashboard path segment in breadcrumbs", () => {
    const labels = new Set(breadcrumbKeys());
    const dynamic = new Set(["id", "slug", "table"]);
    const missing = dashboardSegments().filter((segment) => !labels.has(segment) && !dynamic.has(segment));
    expect(missing).toEqual([]);
  });
});
