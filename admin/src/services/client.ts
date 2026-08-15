import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getApiBaseUrl } from "@/lib/api";

const client = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
  withCredentials: true,
});

client.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  // Auth token is an HttpOnly cookie attached by the browser to /api/proxy.
  // Never read JWT from localStorage.
  return config;
});

/** Structured API error carrying the backend's machine-readable code (never string-match message). */
export interface ApiErrorLike extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
  response?: {
    status?: number;
    data?: {
      message?: string;
      code?: string;
      errors?: Array<{ field?: string; message?: string }>;
    };
  };
}

export function getApiErrorCode(err: unknown): string | undefined {
  return (err as ApiErrorLike)?.code ?? (err as ApiErrorLike)?.response?.data?.code;
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  const apiErr = err as ApiErrorLike;
  return apiErr?.response?.data?.message || (err instanceof Error ? err.message : fallback);
}

let handlingUnauthorized = false;
let refreshPromise: Promise<boolean> | null = null;

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  localStorage.removeItem("user");
  // Soft clear cookie; don't block navigation if logout fails.
  void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
    window.location.href = "/login";
  });
}

async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

client.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const status = err.response?.status;
    const message =
      (err.response?.data as { message?: string } | undefined)?.message ||
      err.message ||
      "Request failed";
    const config = err.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = String(config?.url || "");
    const isAuthMe = url.includes("/auth/me");

    // Access cookie expired → rotate via refresh cookie, then retry once.
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      config &&
      !config._retry &&
      !url.includes("/auth/refresh") &&
      !url.includes("/auth/login")
    ) {
      config._retry = true;
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return client.request(config);
      }
      // Refresh failed — session is dead; force login for any authenticated API call.
      redirectToLogin();
    } else if (status === 401 && typeof window !== "undefined" && isAuthMe) {
      redirectToLogin();
    }

    const enriched = err as AxiosError & ApiErrorLike;
    enriched.message =
      status === 429
        ? message || "Too many requests. Please wait a few minutes and try again."
        : message;
    enriched.status = status;
    enriched.code = (err.response?.data as { code?: string } | undefined)?.code;
    enriched.details = (err.response?.data as { details?: Record<string, unknown> } | undefined)
      ?.details;

    return Promise.reject(enriched);
  }
);

export default client;
