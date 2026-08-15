import { NextResponse } from "next/server";
import { ADMIN_TOKEN_COOKIE, ADMIN_REFRESH_COOKIE } from "@/lib/backendUrl";
import { postBackendJson } from "@/lib/fetchBackend";
import { isAdminDashboardUser } from "@/lib/adminRoles";

export const runtime = "nodejs";


function cookieSecureFlag(request: Request): boolean {
  const xfProto = request.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { email?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const token = body.token?.trim().toUpperCase();
  if (!email || !token) {
    return NextResponse.json({ success: false, message: "Email and verification code are required" }, { status: 400 });
  }

  const { ok, status, payload } = await postBackendJson("/auth/login-otp/verify", { email, token }, {
    timeoutMs: 50_000,
    unreachableMessage:
      "Cannot reach the PalSafar API. The server may still be waking up — wait 30 seconds and try again.",
  });
  if (!ok) {
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (status === 429
        ? "Too many login attempts. Wait a few minutes and try again."
        : status === 504
          ? "PalSafar API timed out while signing in. Try again — Render may still be waking up."
          : status === 500
            ? "PalSafar API error during sign-in. If a deploy just finished, retry in 1–2 minutes."
            : "Login failed");
    return NextResponse.json(
      { success: false, message, code: payload.code },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }

  const data = payload.data as { user?: unknown; accessToken?: string; refreshToken?: string } | undefined;
  const user = data?.user;
  const accessToken = data?.accessToken;
  const refreshToken = data?.refreshToken;

  if (!accessToken || !user || !isAdminDashboardUser(user as Parameters<typeof isAdminDashboardUser>[0])) {
    return NextResponse.json(
      { success: false, message: "This account is not an admin." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    success: true,
    data: { user },
    message: "Login successful",
  });

  response.cookies.set(ADMIN_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: cookieSecureFlag(request),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  if (refreshToken) {
    response.cookies.set(ADMIN_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: cookieSecureFlag(request),
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  return response;
}
