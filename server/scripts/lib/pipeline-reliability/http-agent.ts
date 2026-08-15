import http from 'http';
import https from 'https';

const MAX_SOCKETS = 16;

export const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: MAX_SOCKETS,
  maxFreeSockets: 8,
  timeout: 60_000,
});

export const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: MAX_SOCKETS,
  maxFreeSockets: 8,
  timeout: 60_000,
});

export function destroyHttpAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

/** Fetch with keep-alive agents; always release response body. */
export async function pipelineFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const isHttps = url.startsWith('https:');
  const agent = isHttps ? httpsAgent : httpAgent;
  const timeoutMs = init?.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // @ts-expect-error Node fetch agent support
      agent,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function pipelineFetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await pipelineFetch(url, init);
  try {
    if (!res.ok) return null;
    return (await res.json()) as T;
  } finally {
    await res.body?.cancel?.().catch(() => undefined);
  }
}
