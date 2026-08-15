import client from "./client";
import type { User, SingleResponse } from "@/types";
import { type ApiErrorLike } from "./client";

function throwAuthError(payload: unknown, fallback: string, status: number): never {
  const message =
    payload && typeof payload === "object" && "message" in payload && typeof (payload as { message: unknown }).message === "string"
      ? (payload as { message: string }).message
      : fallback;
  const err = new Error(message) as ApiErrorLike;
  err.status = status;
  err.response = {
    status,
    data: (payload && typeof payload === "object" ? payload : { message: fallback }) as NonNullable<ApiErrorLike["response"]>["data"],
  };
  throw err;
}

export async function login(
  email: string,
  password: string
): Promise<{ user: User }> {
  // Same-origin route sets HttpOnly session cookie — JWT never enters JS.
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throwAuthError(payload, "Login failed", res.status);
  }
  return payload.data as { user: User };
}

export async function requestLoginOtp(email: string): Promise<void> {
  const res = await fetch("/api/auth/login-otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throwAuthError(payload, "Could not send sign-in code", res.status);
  }
}

export async function loginWithOtp(
  email: string,
  token: string
): Promise<{ user: User }> {
  const res = await fetch("/api/auth/login-otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      token: token.trim().toUpperCase(),
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throwAuthError(payload, "Login failed", res.status);
  }
  return payload.data as { user: User };
}

export async function getMe(): Promise<User> {
  const res = await client.get<SingleResponse<User>>("/auth/me");
  return res.data.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await client.patch("/auth/password", { currentPassword, newPassword });
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  if (typeof window !== "undefined") {
    localStorage.removeItem("user");
  }
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throwAuthError(payload, "Could not send verification code", res.status);
  }
}

export async function verifyResetOtp(email: string, token: string): Promise<string> {
  const res = await fetch("/api/auth/verify-reset-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      token: token.trim().toUpperCase(),
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throwAuthError(payload, "Invalid or expired verification code", res.status);
  }
  const resetSessionToken = payload?.data?.resetSessionToken;
  if (!resetSessionToken || typeof resetSessionToken !== "string") {
    throw new Error("Invalid or expired verification code");
  }
  return resetSessionToken;
}

export async function resetPassword(email: string, token: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      password,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throwAuthError(payload, "Could not reset password", res.status);
  }
}

export async function refreshSession(): Promise<boolean> {
  const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  return res.ok;
}
