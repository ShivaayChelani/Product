"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertCircle, CheckCircle2, Clock, RefreshCw, Server, Zap,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonCards, SkeletonTable } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { useNotification } from "@/components/Notification";
import {
  runApiMonitorProbes,
  getAuditLogStats,
  type EndpointProbe,
  type HealthResponse,
} from "@/services/apiMonitor";

function StatusBadge({ status }: { status: "up" | "down" | "degraded" | string }) {
  const map = {
    up: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    down: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    degraded: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  };
  const cls = map[status as keyof typeof map] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {status}
    </span>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function ApiMonitorPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [probes, setProbes] = useState<EndpointProbe[]>([]);
  const [avgLatency, setAvgLatency] = useState(0);
  const [uptime, setUptime] = useState<number | null>(null);
  const [auditStats, setAuditStats] = useState({ total: 0, last24h: 0 });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [monitor, audit] = await Promise.all([
        runApiMonitorProbes(),
        getAuditLogStats(),
      ]);
      setHealth(monitor.health);
      setProbes(monitor.probes);
      setAvgLatency(monitor.averageLatencyMs);
      setUptime(monitor.health.meta?.uptime ?? monitor.metrics?.data?.uptime ?? null);
      setAuditStats(audit);
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Failed to load API monitor");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const allUp = health?.success && probes.every((p) => p.status === "up");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="API Monitor"
        description="Live health checks, endpoint latency probes, and integration status from the PalSafar backend."
        icon={Activity}
        actions={
          <button type="button" onClick={() => load(true)} disabled={refreshing} className="admin-btn-secondary">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {loading ? (
        <>
          <SkeletonCards count={4} />
          <div className="mt-6">
            <SkeletonTable rows={5} cols={4} />
          </div>
        </>
      ) : !health ? (
        <EmptyState
          icon={Server}
          title="Backend unreachable"
          description="Start the PalSafar API server and retry."
          action={
            <button type="button" onClick={() => load()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="admin-card p-5">
              <p className="text-sm text-muted-foreground">API status</p>
              <div className="mt-2 flex items-center gap-2">
                {allUp ? (
                  <CheckCircle2 className="text-emerald-500" size={22} />
                ) : (
                  <AlertCircle className="text-amber-500" size={22} />
                )}
                <span className="text-xl font-bold">{allUp ? "Healthy" : "Degraded"}</span>
              </div>
            </div>
            <div className="admin-card p-5">
              <p className="text-sm text-muted-foreground">Database</p>
              <div className="mt-2">
                <StatusBadge status={health.data.database} />
              </div>
            </div>
            <div className="admin-card p-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Zap size={14} /> Avg probe latency
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{avgLatency} ms</p>
            </div>
            <div className="admin-card p-5">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock size={14} /> Uptime
              </p>
              <p className="mt-2 text-2xl font-bold">{uptime != null ? formatUptime(uptime) : "—"}</p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {health.data.cloudinary && (
              <div className="admin-card p-4 text-sm">
                <span className="text-muted-foreground">Cloudinary</span>
                <div className="mt-1">
                  <StatusBadge status={health.data.cloudinary === "configured" ? "up" : "degraded"} />
                </div>
              </div>
            )}
            {health.data.firebase && (
              <div className="admin-card p-4 text-sm">
                <span className="text-muted-foreground">Firebase</span>
                <div className="mt-1">
                  <StatusBadge status={health.data.firebase === "configured" ? "up" : "degraded"} />
                </div>
              </div>
            )}
            {health.data.smtp && (
              <div className="admin-card p-4 text-sm">
                <span className="text-muted-foreground">SMTP</span>
                <div className="mt-1">
                  <StatusBadge status={health.data.smtp === "configured" ? "up" : "degraded"} />
                </div>
              </div>
            )}
            <div className="admin-card p-4 text-sm">
              <span className="text-muted-foreground">Audit events (24h)</span>
              <p className="mt-1 text-lg font-semibold tabular-nums">{auditStats.last24h.toLocaleString()}</p>
              <Link href="/dashboard/audit-logs" className="text-xs text-primary hover:underline">
                View audit logs ({auditStats.total.toLocaleString()} total)
              </Link>
            </div>
          </div>

          <div className="admin-card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Endpoint probes</h2>
              <p className="text-sm text-muted-foreground">{health.message}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-5 py-3 font-semibold">Endpoint</th>
                    <th className="px-5 py-3 font-semibold">Path</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {probes.map((probe) => (
                    <tr key={probe.path} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium">{probe.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{probe.path}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={probe.status} />
                      </td>
                      <td className="px-5 py-3 tabular-nums">{probe.latencyMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
