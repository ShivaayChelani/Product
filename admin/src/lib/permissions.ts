import type { AdminRole } from "@/components/PermissionWrapper";
import { resolveAdminRole } from "@/lib/adminRoles";

/** Routes every signed-in admin role may open (no platform-secrets surfaces). */
const UNIVERSAL_ROUTES = new Set(["/dashboard"]);

const ROLE_ROUTE_PREFIXES: Record<AdminRole, string[]> = {
  SUPER_ADMIN: ["*"],
  ADMIN: ["*"],
  OPS_ADMIN: [
    "/dashboard", "/dashboard/users", "/dashboard/vendors", "/dashboard/creators", "/dashboard/collaborations",
    "/dashboard/places", "/dashboard/canonical", "/dashboard/hidden-gems",
    "/dashboard/categories", "/dashboard/tags", "/dashboard/media", "/dashboard/reels",
    "/dashboard/moderation", "/dashboard/reviews", "/dashboard/offers", "/dashboard/redemptions", "/dashboard/campaigns",
    "/dashboard/riddle-hunt", "/dashboard/trips", "/dashboard/wallets", "/dashboard/palpoints", "/dashboard/rewards",
    "/dashboard/monetization", "/dashboard/analytics", "/dashboard/notifications", "/dashboard/fraud-detection",
    "/dashboard/announcements", "/dashboard/legal", "/dashboard/reports",
    "/dashboard/audit-logs", "/dashboard/point-rules", "/dashboard/sync", "/dashboard/search", "/dashboard/roles",
    "/dashboard/database-health", "/dashboard/api-monitor", "/dashboard/security", "/dashboard/settings",
  ],
  VENDOR_MANAGER: [
    "/dashboard", "/dashboard/vendors", "/dashboard/creators", "/dashboard/offers", "/dashboard/redemptions",
    "/dashboard/palpoints", "/dashboard/wallets", "/dashboard/monetization",
  ],
  CONTENT_MODERATOR: [
    "/dashboard", "/dashboard/places", "/dashboard/canonical", "/dashboard/reels",
    "/dashboard/hidden-gems", "/dashboard/categories", "/dashboard/tags", "/dashboard/media",
    "/dashboard/moderation", "/dashboard/reviews", "/dashboard/riddle-hunt",
    "/dashboard/legal", "/dashboard/announcements",
  ],
  FINANCE_MANAGER: [
    "/dashboard", "/dashboard/wallets", "/dashboard/palpoints", "/dashboard/rewards",
    "/dashboard/monetization", "/dashboard/reports", "/dashboard/analytics", "/dashboard/redemptions", "/dashboard/fraud-detection",
  ],
  SUPPORT_AGENT: [
    "/dashboard", "/dashboard/users", "/dashboard/vendors", "/dashboard/creators",
    "/dashboard/notifications", "/dashboard/audit-logs", "/dashboard/trips", "/dashboard/moderation",
  ],
  MARKETING_ADMIN: [
    "/dashboard", "/dashboard/campaigns", "/dashboard/announcements",
    "/dashboard/notifications", "/dashboard/monetization/coupons",
  ],
  ANALYTICS_VIEWER: [
    "/dashboard", "/dashboard/analytics", "/dashboard/reports", "/dashboard/search",
    "/dashboard/monetization/revenue",
  ],
};

function isFullAdmin(role: AdminRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function canAccessRoute(role: AdminRole | string | undefined, href: string): boolean {
  if (!role) return false;
  const r = role as AdminRole;
  if (UNIVERSAL_ROUTES.has(href)) return true;
  if (isFullAdmin(r)) return true;
  const prefixes = ROLE_ROUTE_PREFIXES[r];
  if (!prefixes) return false;
  if (prefixes.includes("*")) return true;
  return prefixes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
}

export function getAdminRoleFromStorage(): AdminRole | null {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return (resolveAdminRole(user) as AdminRole | null) ?? null;
  } catch {
    return null;
  }
}

export function getRoleLabel(role: AdminRole | string): string {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin", ADMIN: "Admin",
    OPS_ADMIN: "Operations", VENDOR_MANAGER: "Vendor Manager",
    CONTENT_MODERATOR: "Content Moderator", FINANCE_MANAGER: "Finance",
    SUPPORT_AGENT: "Support", MARKETING_ADMIN: "Marketing", ANALYTICS_VIEWER: "Analytics",
  };
  return labels[role] || role;
}
