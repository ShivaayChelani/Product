import { describe, expect, it } from "vitest";
import { canAccessRoute, isAdminNavigationItemActive } from "./permissions";

describe("event moderation route permissions", () => {
  it("allows content moderators and operations admins to reach event moderation", () => {
    expect(canAccessRoute("CONTENT_MODERATOR", "/dashboard/events")).toBe(true);
    expect(canAccessRoute("OPS_ADMIN", "/dashboard/events")).toBe(true);
  });

  it("does not grant event moderation to analytics-only roles", () => {
    expect(canAccessRoute("ANALYTICS_VIEWER", "/dashboard/events")).toBe(false);
    expect(canAccessRoute("FINANCE_MANAGER", "/dashboard/events")).toBe(false);
  });

  it("keeps the dashboard active only on its exact route", () => {
    expect(isAdminNavigationItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isAdminNavigationItemActive("/dashboard/events", "/dashboard")).toBe(false);
    expect(isAdminNavigationItemActive("/dashboard/events/123", "/dashboard/events")).toBe(true);
    expect(isAdminNavigationItemActive("/dashboard/events", "/dashboard/places")).toBe(false);
  });
});
