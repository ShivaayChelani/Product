import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_TOKEN_COOKIE = "ps_admin_token";
const ADMIN_REFRESH_COOKIE = "ps_admin_refresh";

/** Edge-safe expiry check (signature verified later by /auth/me). */
function isUnexpiredJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return false;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  // Allow dashboard entry when access JWT is expired but refresh session still exists;
  // client refresh / getMe will rotate or force re-login.
  const hasSession =
    Boolean(accessToken && isUnexpiredJwt(accessToken)) || Boolean(refreshToken);

  if (pathname.startsWith("/dashboard")) {
    if (!hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "session");
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/login") {
    if (hasSession) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
