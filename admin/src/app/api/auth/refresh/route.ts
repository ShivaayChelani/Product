import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_TOKEN_COOKIE, ADMIN_REFRESH_COOKIE } from "@/lib/backendUrl";
import { postBackendJson } from "@/lib/fetchBackend";

function cookieSecureFlag(request: Request): boolean {
  const xfProto = request.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export const runtime = "nodejs";


export async function POST(request: Request) {
  const jar = await cookies();
  const refreshToken = jar.get(ADMIN_REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ success: false, message: "No refresh session" }, { status: 401 });
  }

  const { ok, status, payload } = await postBackendJson("/auth/refresh", { refreshToken });
  if (!ok) {
    return NextResponse.json(
      { success: false, message: (payload.message as string) || "Session expired" },
      { status },
    );
  }

  const accessToken = (payload as { data?: { accessToken?: string; refreshToken?: string } }).data?.accessToken;
  const newRefresh = (payload as { data?: { accessToken?: string; refreshToken?: string } }).data?.refreshToken;
  if (!accessToken || !newRefresh) {
    return NextResponse.json({ success: false, message: "Invalid refresh response" }, { status: 502 });
  }

  const response = NextResponse.json({ success: true, message: "Session refreshed" });
  const secure = cookieSecureFlag(request);

  response.cookies.set(ADMIN_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  response.cookies.set(ADMIN_REFRESH_COOKIE, newRefresh, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}
