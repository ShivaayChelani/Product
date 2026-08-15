import { NextResponse } from "next/server";
import { postBackendJson } from "@/lib/fetchBackend";

export const runtime = "nodejs";


export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 });
  }

  try {
    const { ok, status, payload } = await postBackendJson("/auth/forgot-password", { email }, {
      timeoutMs: 50_000,
      unreachableMessage:
        "Cannot reach the PalSafar API. The server may still be waking up — wait 30 seconds and try again.",
    });
    if (!ok) {
      const backendMessage = typeof payload.message === "string" ? payload.message : "";
      return NextResponse.json(
        {
          success: false,
          message:
            backendMessage ||
            (status === 503
              ? "Password reset email could not be sent. Verify SMTP_FROM_EMAIL is a verified Brevo sender on Render."
              : status === 502
                ? "PalSafar API gateway error. The server may still be starting — retry in 30 seconds."
                : status === 500
                  ? "PalSafar API error while requesting a reset code. Retry in 1–2 minutes."
                  : status === 504
                    ? "Request timed out. If SMTP is slow, retry once — or use admin credential sync on Render."
                    : "Request failed"),
          code: payload.code,
        },
        { status: status >= 400 && status < 600 ? status : 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        (typeof payload.message === "string" && payload.message) ||
        "If an account with that email exists, a verification code has been sent.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Unexpected error while requesting a reset code.",
      },
      { status: 502 },
    );
  }
}
