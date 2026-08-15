import { NextResponse } from "next/server";
import { postBackendJson } from "@/lib/fetchBackend";

export async function POST(request: Request) {
  let body: { email?: string; token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const token = body.token?.trim();
  const password = body.password;
  if (!email || !token || !password) {
    return NextResponse.json(
      { success: false, message: "Email, code, and new password are required" },
      { status: 400 },
    );
  }

  const { ok, status, payload } = await postBackendJson("/auth/reset-password", {
    email,
    token,
    password,
  });

  return NextResponse.json(
    payload?.success === false ? payload : { success: ok, ...payload },
    { status },
  );
}
