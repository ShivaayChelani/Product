/**
 * Absolute backend API base URL for server-side route handlers only.
 * Paths like `/auth/login` are appended by callers — base MUST include `/api/v1`.
 */

/** Normalize origin-only misconfigs (e.g. `https://api.host.com`) to `/api/v1`. */
export function normalizeBackendApiBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (!/\/api\/v\d+$/i.test(base)) {
    base = `${base}/api/v1`;
  }
  return base;
}

export function getBackendApiBaseUrl(): string {
  const fromEnv =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) return normalizeBackendApiBaseUrl(fromEnv);

  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (isProd) {
    throw new Error(
      "API_URL (or NEXT_PUBLIC_API_URL) must be set in production. " +
        "Example: https://your-api.example.com/api/v1",
    );
  }
  return "http://localhost:5000/api/v1";
}

export const ADMIN_TOKEN_COOKIE = "ps_admin_token";
export const ADMIN_REFRESH_COOKIE = "ps_admin_refresh";
