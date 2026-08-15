import client from "./client";

export type HealthStatus = {
  database: "up" | "down";
  cloudinary?: "configured" | "missing";
  firebase?: "configured" | "missing";
  smtp?: "configured" | "missing";
  redis?: string;
};

export type HealthResponse = {
  success: boolean;
  data: HealthStatus;
  message: string;
  meta?: { uptime: number };
  timestamp?: string;
};

export type MetricsResponse = {
  success: boolean;
  data: { uptime: number };
};

export type EndpointProbe = {
  name: string;
  path: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
  message?: string;
};

async function probeEndpoint(name: string, path: string): Promise<EndpointProbe> {
  const start = performance.now();
  try {
    const res = await client.get(path, { timeout: 15000 });
    const latencyMs = Math.round(performance.now() - start);
    const ok = res.status >= 200 && res.status < 300;
    return {
      name,
      path,
      status: ok ? "up" : "degraded",
      latencyMs,
      message: (res.data as HealthResponse)?.message,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : "Request failed";
    return { name, path, status: "down", latencyMs, message };
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await client.get<HealthResponse>("/health");
  return res.data;
}

export async function getMetrics(): Promise<MetricsResponse> {
  // Production hides root /metrics (404). Use readiness/health meta.uptime instead.
  const health = await getHealth();
  return {
    success: true,
    data: { uptime: health.meta?.uptime ?? 0 },
  };
}

export async function runApiMonitorProbes(): Promise<{
  health: HealthResponse;
  metrics: MetricsResponse | null;
  probes: EndpointProbe[];
  averageLatencyMs: number;
}> {
  const [health, ...probes] = await Promise.all([
    getHealth(),
    probeEndpoint("Auth Me", "/auth/me"),
    probeEndpoint("Admin Places", "/admin/places?limit=1"),
    probeEndpoint("Admin Analytics", "/analytics/dashboard"),
    probeEndpoint("Canonical Status", "/admin/canonical/status"),
    probeEndpoint("Database Overview", "/admin/database/overview"),
    probeEndpoint("API Readiness", "/health"),
  ]);

  const metrics: MetricsResponse = {
    success: true,
    data: { uptime: health.meta?.uptime ?? 0 },
  };

  const averageLatencyMs =
    probes.length > 0
      ? Math.round(probes.reduce((sum, p) => sum + p.latencyMs, 0) / probes.length)
      : 0;

  return { health, metrics, probes, averageLatencyMs };
}

export async function getAuditLogStats(): Promise<{ total: number; last24h: number }> {
  try {
    const res = await client.get<{ pagination?: { total: number } }>("/audit-logs", {
      params: { limit: 1, page: 1 },
    });
    const total = res.data.pagination?.total ?? 0;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await client.get<{ pagination?: { total: number } }>("/audit-logs", {
      params: { limit: 1, page: 1, from: since },
    });
    return { total, last24h: recent.data.pagination?.total ?? 0 };
  } catch {
    return { total: 0, last24h: 0 };
  }
}
