/** Admin dashboard roles — keep in sync with server ADMIN_ROLES + admin isAdminUser. */
export const ADMIN_DASHBOARD_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "OPS_ADMIN",
  "VENDOR_MANAGER",
  "CONTENT_MODERATOR",
  "FINANCE_MANAGER",
  "SUPPORT_AGENT",
  "MARKETING_ADMIN",
  "ANALYTICS_VIEWER",
] as const;

export type AdminDashboardRole = (typeof ADMIN_DASHBOARD_ROLES)[number];

export function isAdminDashboardRole(value: string | undefined | null): value is AdminDashboardRole {
  return Boolean(value && ADMIN_DASHBOARD_ROLES.includes(value as AdminDashboardRole));
}

export function resolveAdminRole(user: {
  permission?: string;
  role?: string;
  roles?: string[];
  activeMode?: string;
} | null | undefined): AdminDashboardRole | null {
  if (!user) return null;
  if (isAdminDashboardRole(user.permission)) return user.permission;
  if (isAdminDashboardRole(user.role)) return user.role;
  if (isAdminDashboardRole(user.activeMode)) return user.activeMode;
  if (Array.isArray(user.roles)) {
    const match = user.roles.find((r) => isAdminDashboardRole(r));
    if (match) return match;
  }
  return null;
}

export function isAdminDashboardUser(user: {
  permission?: string;
  role?: string;
  roles?: string[];
  activeMode?: string;
} | null | undefined): boolean {
  return resolveAdminRole(user) !== null;
}
