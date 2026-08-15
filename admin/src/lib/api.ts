/** Browser admin client talks to same-origin Next.js proxy (HttpOnly cookie auth). */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/proxy";
  }

  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim() || process.env.API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:5000/api/v1";
}

export {
  ADMIN_DASHBOARD_ROLES,
  isAdminDashboardRole,
  isAdminDashboardUser as isAdminUser,
  resolveAdminRole,
} from "@/lib/adminRoles";

export type { AdminDashboardRole } from "@/lib/adminRoles";
