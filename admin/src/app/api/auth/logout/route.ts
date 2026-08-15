import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_TOKEN_COOKIE, ADMIN_REFRESH_COOKIE } from "@/lib/backendUrl";
import { postBackendJson } from "@/lib/fetchBackend";

export async function POST(request: Request) {
  const jar = await cookies();
  const refreshToken = jar.get(ADMIN_REFRESH_COOKIE)?.value;

  // Best-effort server revoke so the refresh token cannot be reused after logout.
  if (refreshToken) {
    await postBackendJson("/auth/logout", { refreshToken }).catch(() => {});
  }

  const response = NextResponse.json({ success: true, message: "Logged out" });

  const xfProto = request.headers.get("x-forwarded-proto");
  const secure = xfProto
    ? xfProto.split(",")[0].trim() === "https"
    : (() => {
        try {
          return new URL(request.url).protocol === "https:";
        } catch {
          return false;
        }
      })();

  response.cookies.set(ADMIN_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(ADMIN_REFRESH_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
