import { getBackendApiBaseUrl } from "@/lib/backendUrl";

const DEFAULT_UNREACHABLE_MESSAGE =
  "Cannot reach the PalSafar API. Check that the server is running and API_URL is configured.";

const BACKEND_TIMEOUT_MS = 55_000;

export type BackendJsonResult = {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
};

function backendUrl(path: string): string {
  const base = getBackendApiBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchBackend(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? BACKEND_TIMEOUT_MS;
  const { timeoutMs: _drop, ...rest } = init ?? {};
  return fetch(backendUrl(path), {
    ...rest,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function postBackendJson(
  path: string,
  body: unknown,
  options?: { unreachableMessage?: string; timeoutMs?: number },
): Promise<BackendJsonResult> {
  let backendRes: Response;
  try {
    backendRes = await fetchBackend(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: options?.timeoutMs,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      status: timedOut ? 504 : 503,
      payload: {
        success: false,
        message: timedOut
          ? "PalSafar API timed out. The server may still be waking up — try again in a moment."
          : options?.unreachableMessage ?? DEFAULT_UNREACHABLE_MESSAGE,
      },
    };
  }

  const payload = (await backendRes.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: backendRes.ok, status: backendRes.status, payload };
}
