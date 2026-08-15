import { NextResponse } from "next/server";
import { postBackendJson } from "@/lib/fetchBackend";

export async function POST(request: Request) {
  let body: { email?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const token = body.token?.trim();
  if (!email || !token) {
    return NextResponse.json(
      { success: false, message: "Email and verification code are required" },
      { status: 400 },
    );
  }

  const { ok, status, payload } = await postBackendJson("/auth/verify-reset-otp", { email, token });

  return NextResponse.json(
    payload?.success === false ? payload : { success: ok, ...payload },
    { status },
  );
}
