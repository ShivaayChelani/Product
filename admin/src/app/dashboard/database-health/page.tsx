"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Layers,
  MapPin,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  Wrench,
  Sparkles,
  Zap,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonCards, SkeletonTable } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useNotification } from "@/components/Notification";
import {
  ensureDatabaseExtensions,
  formatBytes,
  getDatabaseOverview,
  getDatabaseQualityReport,
  getTableStats,
  getDataIntegrityStatus,
  runDataIntegrityPhase,
  providerLabel,
  runAutoMerge,
  runDuplicateScan,
  runSettingsSeed,
  runStartupSeed,
  type DatabaseOverview,
  type DataIntegrityStatus,
  type TableStat,
} from "@/services/databaseAdmin";
import type { DatabaseQualityReport } from "@/services/canonical";
import ExplorerTab from "./ExplorerTab";

type Tab = "infrastructure" | "quality" | "tables" | "operations" | "explorer" | "realdata";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    degraded: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    down: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    missing: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    info: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? map.info}`}>
      {status}
    </span>
  );
}

function HealthCard({
  label,
  value,
  severity = "neutral",
  hint,
}: {
  label: string;
  value: number | string;
  severity?: "good" | "warn" | "bad" | "neutral";
  hint?: string;
}) {
  const colors = {
    good: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/40",
    warn: "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/40",
    bad: "border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/40",
    neutral: "admin-card",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[severity]}`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ConnectionCard({
  title,
  info,
  ping,
}: {
  title: string;
  info: DatabaseOverview["connection"]["pooled"];
  ping?: { ok: boolean; latencyMs: number; error?: string } | null;
}) {
  if (!info) {
    return (
      <div className="admin-card p-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">Not configured</p>
      </div>
    );
  }
  return (
    <div className="admin-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <StatusPill status={info.provider === "render" ? "ok" : "info"} />
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="font-medium">{providerLabel(info.provider)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Host</dt>
          <dd className="truncate font-mono text-xs">{info.host}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Database</dt>
          <dd>{info.database}</dd>
        </div>
        {info.region && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Region</dt>
            <dd>{info.region}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">SSL</dt>
          <dd>{info.sslMode}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Pooler</dt>
          <dd>{info.pooled ? "Yes (pooled)" : "Direct"}</dd>
        </div>
        {info.connectionLimit && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Conn limit</dt>
            <dd>{info.connectionLimit}</dd>
          </div>
        )}
      </dl>
      {ping && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm">
          {ping.ok ? (
            <CheckCircle2 size={16} className="text-emerald-500" />
          ) : (
            <AlertTriangle size={16} className="text-red-500" />
          )}
          <span>
            {ping.ok ? `${ping.latencyMs} ms latency` : ping.error ?? "Connection failed"}
          </span>
        </div>
      )}
    </div>
  );
}

export default function DatabaseHealthPage() {
  const { notify } = useNotification();
  const [tab, setTab] = useState<Tab>("infrastructure");
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [quality, setQuality] = useState<DatabaseQualityReport | null>(null);
  const [tables, setTables] = useState<TableStat[]>([]);
  const [integrity, setIntegrity] = useState<DataIntegrityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opsBusy, setOpsBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [ov, qr, ts, di] = await Promise.all([
        getDatabaseOverview(),
        getDatabaseQualityReport(),
        getTableStats(),
        getDataIntegrityStatus(),
      ]);
      setOverview(ov);
      setQuality(qr);
      setTables(ts.tables);
      setIntegrity(di);
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Failed to load database management data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const runOp = async (key: string, fn: () => Promise<unknown>, successMsg: string) => {
    setOpsBusy(key);
    try {
      await fn();
      notify("success", successMsg);
      await load(true);
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Operation failed");
    } finally {
      setOpsBusy(null);
      setConfirm(null);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Database }[] = [
    { id: "infrastructure", label: "Infrastructure", icon: Cloud },
    { id: "quality", label: "Data Quality", icon: ShieldAlert },
    { id: "tables", label: "Tables", icon: Layers },
    { id: "explorer", label: "Explorer", icon: HardDrive },
    { id: "operations", label: "Operations", icon: Wrench },
    { id: "realdata", label: "Real Data Fill", icon: Sparkles },
  ];

  const s = quality?.summary;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Database Management"
        description="Render PostgreSQL infrastructure, data quality, table stats, and admin operations for the PalSafar production database."
        icon={Database}
        actions={
          <button type="button" onClick={() => load(true)} disabled={refreshing} className="admin-btn-secondary">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <>
          <SkeletonCards count={4} />
          <div className="mt-6">
            <SkeletonTable rows={6} cols={4} />
          </div>
        </>
      ) : !overview ? (
        <EmptyState
          icon={Database}
          title="Could not load database overview"
          description="Ensure the backend is running and you have admin access."
          action={
            <button type="button" onClick={() => load()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      ) : (
        <>
          {tab === "infrastructure" && (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <StatusPill status={overview.status} />
                <span className="text-sm text-muted-foreground">
                  {overview.nodeEnv} · Updated {new Date(overview.generatedAt).toLocaleString()}
                </span>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HealthCard
                  label="Database size"
                  value={formatBytes(overview.postgres.sizeBytes)}
                  severity="neutral"
                />
                <HealthCard
                  label="Pooled latency"
                  value={`${overview.connection.ping.latencyMs} ms`}
                  severity={overview.connection.ping.ok ? "good" : "bad"}
                />
                <HealthCard
                  label="Active connections"
                  value={overview.postgres.connections.active}
                  severity={overview.postgres.connections.active > 20 ? "warn" : "good"}
                  hint={`${overview.postgres.connections.total} total`}
                />
                <HealthCard
                  label="Migrations applied"
                  value={overview.migrations.totalApplied}
                  severity={overview.migrations.pending > 0 ? "warn" : "good"}
                  hint={overview.migrations.pending > 0 ? `${overview.migrations.pending} pending` : "Up to date"}
                />
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-2">
                <ConnectionCard
                  title="Runtime connection (DATABASE_URL)"
                  info={overview.connection.pooled}
                  ping={overview.connection.ping}
                />
                <ConnectionCard
                  title="Direct connection (DIRECT_URL)"
                  info={overview.connection.direct}
                  ping={overview.connection.directPing}
                />
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-2">
                <div className="admin-card p-5">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold">
                    <Server size={18} className="text-primary" />
                    PostgreSQL
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="text-right font-mono text-xs">{overview.postgres.version}</dd>
                    </div>
                  </dl>
                </div>

                <div className="admin-card p-5">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold">
                    <Zap size={18} className="text-primary" />
                    Extensions
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">PostGIS</dt>
                      <dd>{overview.extensions.postgis ?? "Missing"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">pg_trgm</dt>
                      <dd>{overview.extensions.pgTrgm ?? "Missing"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Search GIN index</dt>
                      <dd>{overview.extensions.searchIndex ? "Present" : "Missing"}</dd>
                    </div>
                  </dl>
                  {!overview.extensions.allRequired && (
                    <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                      Required extensions missing — places search and geo queries will fail. Use Operations tab to apply.
                    </p>
                  )}
                </div>
              </div>

              <div className="admin-card overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-semibold">Environment checks</h2>
                  <p className="text-sm text-muted-foreground">PostgreSQL connection configuration validation (no secrets shown)</p>
                </div>
                <div className="divide-y divide-border">
                  {overview.envChecks.map((check) => (
                    <div key={check.key} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-sm">{check.key}</p>
                        <p className="text-sm text-muted-foreground">{check.message}</p>
                      </div>
                      <StatusPill status={check.status} />
                    </div>
                  ))}
                </div>
              </div>

              {overview.migrations.recent.length > 0 && (
                <div className="admin-card mt-6 overflow-hidden">
                  <div className="border-b border-border px-5 py-4">
                    <h2 className="font-semibold">Recent migrations</h2>
                  </div>
                  <div className="divide-y divide-border">
                    {overview.migrations.recent.map((m) => (
                      <div key={m.name} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="font-mono text-xs">{m.name}</span>
                        <span className="text-muted-foreground">
                          {m.finishedAt ? new Date(m.finishedAt).toLocaleDateString() : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "quality" && quality && s && (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                Quality report generated {new Date(quality.generatedAt).toLocaleString()}
              </p>

              <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HealthCard label="Active places" value={s.canonicalActive} severity="good" />
                <HealthCard label="Verified" value={s.verified} severity="good" />
                <HealthCard label="Pending review" value={s.pendingReview} severity={s.pendingReview > 0 ? "warn" : "good"} />
                <HealthCard label="Draft" value={s.draft} severity="neutral" />
                <HealthCard
                  label="Missing coordinates"
                  value={s.missingCoordinates}
                  severity={s.missingCoordinates > 0 ? "bad" : "good"}
                  hint="Places without lat/lng"
                />
                <HealthCard
                  label="Missing geohash"
                  value={s.missingGeohash}
                  severity={s.missingGeohash > 100 ? "warn" : "good"}
                />
                <HealthCard label="Aliases" value={s.aliasCount} severity="neutral" />
                <HealthCard
                  label="Open duplicate candidates"
                  value={s.duplicateCandidatesOpen}
                  severity={s.duplicateCandidatesOpen > 0 ? "warn" : "good"}
                />
              </div>

              <div className="mb-8 grid gap-6 lg:grid-cols-2">
                <div className="admin-card p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                    <MapPin size={18} className="text-primary" />
                    Top states by coverage
                  </h2>
                  <div className="max-h-80 space-y-2 overflow-y-auto custom-scrollbar">
                    {quality.coverageByState.slice(0, 15).map((row) => (
                      <div key={row.state} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{row.state}</span>
                        <span className="shrink-0 font-medium tabular-nums">{row.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-card p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                    <ShieldAlert size={18} className="text-primary" />
                    Top categories
                  </h2>
                  <div className="max-h-80 space-y-2 overflow-y-auto custom-scrollbar">
                    {quality.coverageByCategory.slice(0, 15).map((row) => (
                      <div key={row.category} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate capitalize">{row.category.replace(/_/g, " ")}</span>
                        <span className="shrink-0 font-medium tabular-nums">{row.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {quality.manualReviewSamples.length > 0 && (
                <div className="admin-card overflow-hidden">
                  <div className="border-b border-border px-5 py-4">
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <AlertTriangle size={18} className="text-amber-500" />
                      Duplicate review queue (sample)
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <Link href="/dashboard/canonical" className="font-medium text-primary hover:underline">
                        Open Canonical Places
                      </Link>
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {quality.manualReviewSamples.slice(0, 10).map((sample, i) => (
                      <div key={i} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{sample.placeA?.name ?? "—"}</p>
                          <p className="truncate text-muted-foreground">vs {sample.placeB?.name ?? "—"}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                          {(sample.confidenceScore * 100).toFixed(0)}% match
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {s.missingCoordinates === 0 && s.duplicateCandidatesOpen === 0 && (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <CheckCircle2 size={18} />
                  Data quality looks good — no critical coordinate gaps or open duplicate backlog.
                </div>
              )}
            </>
          )}

          {tab === "tables" && (
            <div className="admin-card overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h2 className="flex items-center gap-2 font-semibold">
                  <HardDrive size={18} className="text-primary" />
                  Table statistics
                </h2>
                <p className="text-sm text-muted-foreground">Top tables by disk size (from pg_stat_user_tables)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-5 py-3 font-semibold">Table</th>
                      <th className="px-5 py-3 font-semibold">Row estimate</th>
                      <th className="px-5 py-3 font-semibold">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tables.map((row) => (
                      <tr key={row.table} className="hover:bg-muted/30">
                        <td className="px-5 py-3 font-mono text-xs">{row.table}</td>
                        <td className="px-5 py-3 tabular-nums">{row.rowEstimate.toLocaleString()}</td>
                        <td className="px-5 py-3 tabular-nums">{formatBytes(row.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "operations" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle size={16} className="mr-2 inline" />
                Operations run directly against the live Render PostgreSQL database. Super Admin, Admin, System Admin, or Ops Admin role required.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="admin-card p-5">
                  <h3 className="font-semibold">Ensure extensions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Apply PostGIS, pg_trgm, search triggers, and location sync triggers. Safe to re-run.
                  </p>
                  <button
                    type="button"
                    disabled={opsBusy !== null}
                    onClick={() =>
                      runOp("extensions", ensureDatabaseExtensions, "Database extensions applied")
                    }
                    className="admin-btn-primary mt-4"
                  >
                    <Play size={16} />
                    {opsBusy === "extensions" ? "Running…" : "Apply extensions"}
                  </button>
                </div>

                <div className="admin-card p-5">
                  <h3 className="font-semibold">Seed default settings</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upsert default app settings (feature flags, gamification, map config). Does not touch places or users.
                  </p>
                  <button
                    type="button"
                    disabled={opsBusy !== null}
                    onClick={() =>
                      runOp("settings-seed", runSettingsSeed, "Default settings seeded")
                    }
                    className="admin-btn-secondary mt-4"
                  >
                    <Play size={16} />
                    {opsBusy === "settings-seed" ? "Running…" : "Seed settings"}
                  </button>
                </div>

                <div className="admin-card p-5">
                  <h3 className="font-semibold">Duplicate scan (batch)</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Run one geohash-blocked duplicate scan page. Repeat from Operations or use nightly job for full corpus.
                  </p>
                  <button
                    type="button"
                    disabled={opsBusy !== null}
                    onClick={() =>
                      runOp("dup-scan", () => runDuplicateScan({ prefixBatch: 100 }), "Duplicate scan batch completed")
                    }
                    className="admin-btn-secondary mt-4"
                  >
                    <Play size={16} />
                    {opsBusy === "dup-scan" ? "Scanning…" : "Run scan batch"}
                  </button>
                </div>

                <div className="admin-card p-5">
                  <h3 className="font-semibold">Auto-merge high confidence</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Merge duplicate candidates with ≥86% confidence (max 50 per run).
                  </p>
                  <button
                    type="button"
                    disabled={opsBusy !== null}
                    onClick={() =>
                      setConfirm({
                        title: "Auto-merge duplicates?",
                        message: "This will merge up to 50 high-confidence duplicate pairs. Records are preserved but merged into canonical places.",
                        action: () =>
                          runOp("auto-merge", () => runAutoMerge({ limit: 50 }), "Auto-merge completed"),
                      })
                    }
                    className="admin-btn-secondary mt-4"
                  >
                    <Play size={16} />
                    {opsBusy === "auto-merge" ? "Merging…" : "Auto-merge batch"}
                  </button>
                </div>

                <div className="admin-card border-red-200 p-5 dark:border-red-900 md:col-span-2">
                  <h3 className="font-semibold text-red-700 dark:text-red-400">Startup seed (full)</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Re-run full startup seed: canonical admin users, point rules, settings, curated places. Use only after deploy issues or missing seed data.
                  </p>
                  <button
                    type="button"
                    disabled={opsBusy !== null}
                    onClick={() =>
                      setConfirm({
                        title: "Run full startup seed?",
                        message: "This upserts canonical admin accounts, settings, point rules, and curated seed data against the live database.",
                        action: () =>
                          runOp("startup-seed", runStartupSeed, "Startup seed completed"),
                      })
                    }
                    className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <Play size={16} className="mr-2 inline" />
                    {opsBusy === "startup-seed" ? "Seeding…" : "Run startup seed"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/canonical" className="admin-btn-secondary">
                  Canonical & merges
                </Link>
                <Link href="/dashboard/places" className="admin-btn-secondary">
                  Manage places
                </Link>
                <Link href="/dashboard/api-monitor" className="admin-btn-secondary">
                  API monitor
                </Link>
              </div>
            </div>
          )}

          {tab === "explorer" && (
            <ExplorerTab />
          )}

          {tab === "explorer" && <ExplorerTab />}

          {tab === "realdata" && integrity && (
            <div className="space-y-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                <Sparkles size={16} className="mr-2 inline" />
                Fills real data from <strong>Wikidata + OpenStreetMap + Nominatim</strong> — completely free, no Google API key needed.
                Descriptions come from Wikipedia/Wikidata only; empty fields stay empty until sourced.
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <HealthCard label="Total places" value={integrity.places.total} severity="neutral" />
                <HealthCard label="Verified" value={integrity.places.verified} severity="good" />
                <HealthCard label="Draft (needs enrichment)" value={integrity.places.draft} severity="warn" />
                <HealthCard
                  label="Missing description"
                  value={integrity.gaps.missingDescription}
                  severity={integrity.gaps.missingDescription > 0 ? "warn" : "good"}
                  hint="Run Wikidata enrichment to fill from Wikipedia"
                />
                <HealthCard
                  label="Open duplicates"
                  value={integrity.gaps.duplicateCandidatesOpen}
                  severity={integrity.gaps.duplicateCandidatesOpen > 0 ? "bad" : "good"}
                />
                <HealthCard
                  label="Fake ratings"
                  value={integrity.gaps.syntheticRatings}
                  severity={integrity.gaps.syntheticRatings > 0 ? "bad" : "good"}
                  hint="Ratings without real reviews"
                />
              </div>

              <div className="admin-card p-5">
                <h3 className="mb-4 font-semibold">Data integrity pipeline</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Run these in order. Quick steps run from dashboard; enrichment steps run on server CLI (long-running).
                </p>
                <div className="space-y-3">
                  {integrity.recommendedPhases.map((step) => (
                    <div
                      key={step.phase}
                      className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{step.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">{step.phase}</p>
                      </div>
                      <button
                        type="button"
                        disabled={opsBusy !== null}
                        onClick={() =>
                          runOp(
                            step.phase,
                            () => runDataIntegrityPhase(step.phase, 500),
                            `${step.label} — check result message`,
                          )
                        }
                        className="admin-btn-secondary shrink-0"
                      >
                        <Play size={14} />
                        {opsBusy === step.phase ? "Running…" : "Run"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card p-5">
                <h3 className="mb-2 font-semibold">Full pipeline (server CLI)</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  For complete database fill on Render production, SSH into Render shell or run locally against production DATABASE_URL:
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
{`cd server
npm run job:data-integrity -- --phase=all
# Or step by step:
npm run job:data-integrity -- --phase=enrich-wikidata --limit=5000
npm run job:data-integrity -- --phase=enrich-osm --limit=10000
npm run job:data-integrity -- --phase=geocode --limit=5000
npm run job:india-corpus-dedupe -- --rounds=50 --auto-merge=0`}
                </pre>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/canonical" className="admin-btn-secondary">
                  Review duplicate merges
                </Link>
                <Link href="/dashboard/places" className="admin-btn-secondary">
                  Verify enriched places
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          open={true}
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Continue"
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
