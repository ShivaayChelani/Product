"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert, RefreshCw, AlertCircle, Bell, ScrollText, Receipt, Eye,
} from "lucide-react";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { useNotification } from "@/components/Notification";
import { exportTableData } from "@/lib/exportUtils";
import { getFraudAlerts, listRedemptions, type RedemptionRow } from "@/services/redemptions";

type Tab = "alerts" | "suspicious";

interface FraudAuditLog {
  id: string;
  entityId: string;
  action: string;
  createdAt: string;
  actor?: { id: string; name: string; email: string };
  newValues?: Record<string, unknown>;
}

interface FraudNotification {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  userId?: string;
  data?: Record<string, unknown>;
}

export default function FraudDetectionPage() {
  const { notify } = useNotification();
  const [tab, setTab] = useState<Tab>("alerts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<FraudAuditLog[]>([]);
  const [notifications, setNotifications] = useState<FraudNotification[]>([]);
  const [suspicious, setSuspicious] = useState<RedemptionRow[]>([]);
  const [suspiciousLoading, setSuspiciousLoading] = useState(false);
  const [detailAlert, setDetailAlert] = useState<FraudAuditLog | FraudNotification | null>(null);
  const [detailType, setDetailType] = useState<"audit" | "notification" | "redemption">("audit");
  const [detailRedemption, setDetailRedemption] = useState<RedemptionRow | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFraudAlerts();
      setAuditLogs((data.auditLogs || []) as FraudAuditLog[]);
      setNotifications((data.notifications || []) as FraudNotification[]);
    } catch {
      setError("Failed to load fraud alerts");
      notify("error", "Failed to load fraud alerts");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadSuspicious = useCallback(async () => {
    setSuspiciousLoading(true);
    try {
      const [cancelled, pending] = await Promise.all([
        listRedemptions({ page: 1, limit: 50, status: "CANCELLED" }),
        listRedemptions({ page: 1, limit: 50, status: "PENDING" }),
      ]);
      const combined = [...cancelled.data, ...pending.data];
      const highValue = combined.filter((r) => (r.pointsSpent || 0) >= 500 || (r.discountValue || 0) >= 500);
      const unique = Array.from(new Map(highValue.map((r) => [r.id, r])).values());
      unique.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSuspicious(unique);
    } catch {
      setSuspicious([]);
    } finally {
      setSuspiciousLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
    void loadSuspicious();
  }, [loadAlerts, loadSuspicious]);

  const alertRows = useMemo(() => {
    const notifRows = notifications.map((n) => ({
      id: n.id,
      type: "notification" as const,
      title: n.title,
      detail: n.body || "",
      createdAt: n.createdAt,
      raw: n,
    }));
    const auditRows = auditLogs.map((l) => ({
      id: l.id,
      type: "audit" as const,
      title: l.action.replace(/_/g, " "),
      detail: l.actor?.email || l.entityId,
      createdAt: l.createdAt,
      raw: l,
    }));
    return [...notifRows, ...auditRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [notifications, auditLogs]);

  const alertColumns: Column<(typeof alertRows)[0] & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "type",
        header: "Source",
        render: (r) =>
          r.type === "notification" ? (
            <span className="flex items-center gap-1 text-amber-700"><Bell size={14} /> Alert</span>
          ) : (
            <span className="flex items-center gap-1 text-red-700"><ScrollText size={14} /> Audit</span>
          ),
        exportValue: (r) => r.type,
      },
      {
        key: "title",
        header: "Title / Action",
        render: (r) => (
          <button
            type="button"
            onClick={() => {
              setDetailAlert(r.raw);
              setDetailType(r.type === "notification" ? "notification" : "audit");
            }}
            className="text-left font-medium hover:text-primary hover:underline"
          >
            {r.title}
          </button>
        ),
        exportValue: (r) => r.title,
      },
      {
        key: "detail",
        header: "Details",
        render: (r) => <span className="max-w-xs truncate block text-sm text-muted-foreground">{r.detail}</span>,
        exportValue: (r) => r.detail,
      },
      {
        key: "createdAt",
        header: "Time",
        render: (r) => new Date(r.createdAt).toLocaleString(),
        exportValue: (r) => r.createdAt,
      },
      {
        key: "actions",
        header: "",
        render: (r) => (
          <button
            type="button"
            onClick={() => {
              setDetailAlert(r.raw);
              setDetailType(r.type === "notification" ? "notification" : "audit");
            }}
            className="rounded p-1.5 text-primary hover:bg-muted"
            aria-label="View alert"
          >
            <Eye size={16} />
          </button>
        ),
      },
    ],
    [],
  );

  const suspiciousColumns: Column<RedemptionRow & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "receiptNumber",
        header: "Receipt",
        render: (r) => (
          <button
            type="button"
            onClick={() => { setDetailRedemption(r as RedemptionRow); setDetailType("redemption"); }}
            className="font-mono text-xs hover:underline"
          >
            {r.receiptNumber || "—"}
          </button>
        ),
        exportValue: (r) => r.receiptNumber,
      },
      { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
      {
        key: "user",
        header: "User",
        render: (r) => r.user?.email || "—",
        exportValue: (r) => r.user?.email,
      },
      {
        key: "vendor",
        header: "Vendor",
        render: (r) => r.vendor?.businessName || "—",
        exportValue: (r) => r.vendor?.businessName,
      },
      { key: "pointsSpent", header: "Points", exportValue: (r) => r.pointsSpent },
      {
        key: "discountValue",
        header: "Value",
        render: (r) => `₹${Math.round(r.discountValue || 0)}`,
        exportValue: (r) => r.discountValue,
      },
      {
        key: "createdAt",
        header: "Date",
        render: (r) => new Date(r.createdAt).toLocaleString(),
        exportValue: (r) => r.createdAt,
      },
    ],
    [],
  );

  const tabs = [
    { key: "alerts" as Tab, label: "Fraud Alerts", icon: ShieldAlert, count: alertRows.length },
    { key: "suspicious" as Tab, label: "Suspicious Redemptions", icon: Receipt, count: suspicious.length },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Fraud Detection"
        description="Monitor fraud alerts, failed redemption attempts, and high-risk redemption patterns."
        icon={ShieldAlert}
        actions={
          <button
            type="button"
            onClick={() => { void loadAlerts(); void loadSuspicious(); }}
            className="admin-btn-secondary"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={14} />
            {t.label}
            <span className="rounded-full bg-black/10 px-1.5 text-xs">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "alerts" && (
        <>
          {error && !loading ? (
            <EmptyState
              icon={AlertCircle}
              title="Could not load fraud alerts"
              description={error}
              action={
                <button type="button" onClick={() => void loadAlerts()} className="admin-btn-primary">
                  Retry
                </button>
              }
            />
          ) : !loading && alertRows.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No fraud alerts"
              description="No recent fraud notifications or failed redemption attempts."
            />
          ) : (
            <DataTable
              columns={alertColumns}
              data={alertRows as ((typeof alertRows)[0] & Record<string, unknown>)[]}
              loading={loading}
              emptyMessage="No fraud alerts"
              exportFilename="fraud-alerts"
              toolbar={
                alertRows.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => exportTableData(alertColumns, alertRows as ((typeof alertRows)[0] & Record<string, unknown>)[], "fraud-alerts", "excel")}
                    className="admin-btn-secondary py-1.5 text-xs"
                  >
                    Export Excel
                  </button>
                ) : null
              }
            />
          )}
        </>
      )}

      {tab === "suspicious" && (
        <>
          {!suspiciousLoading && suspicious.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No suspicious redemptions"
              description="No cancelled or high-value pending redemptions detected."
            />
          ) : (
            <DataTable
              columns={suspiciousColumns}
              data={suspicious as (RedemptionRow & Record<string, unknown>)[]}
              loading={suspiciousLoading}
              emptyMessage="No suspicious redemptions"
              exportFilename="suspicious-redemptions"
              showFirstLast={false}
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Suspicious redemptions include cancelled or high-value (≥500 points/₹) pending redemptions.{" "}
            <Link href="/dashboard/redemptions" className="text-primary hover:underline">
              View all redemptions →
            </Link>
          </p>
        </>
      )}

      <Drawer
        open={!!detailAlert && detailType !== "redemption"}
        onClose={() => setDetailAlert(null)}
        title={detailType === "notification" ? "Fraud Notification" : "Failed Attempt Log"}
        width="max-w-lg"
      >
        {detailAlert && detailType === "notification" && (
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-muted-foreground">Title</dt><dd className="font-medium">{(detailAlert as FraudNotification).title}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Body</dt><dd>{(detailAlert as FraudNotification).body || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Time</dt><dd>{new Date((detailAlert as FraudNotification).createdAt).toLocaleString()}</dd></div>
          </dl>
        )}
        {detailAlert && detailType === "audit" && (
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-muted-foreground">Action</dt><dd><StatusBadge status={(detailAlert as FraudAuditLog).action} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Entity ID</dt><dd className="font-mono text-xs">{(detailAlert as FraudAuditLog).entityId}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Actor</dt><dd>{(detailAlert as FraudAuditLog).actor?.email || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Time</dt><dd>{new Date((detailAlert as FraudAuditLog).createdAt).toLocaleString()}</dd></div>
          </dl>
        )}
      </Drawer>

      <Drawer
        open={!!detailRedemption}
        onClose={() => setDetailRedemption(null)}
        title="Suspicious Redemption"
        width="max-w-lg"
      >
        {detailRedemption && (
          <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Receipt:</span> {detailRedemption.receiptNumber}</p>
            <p><span className="text-muted-foreground">Status:</span> <StatusBadge status={detailRedemption.status} /></p>
            <p><span className="text-muted-foreground">User:</span> {detailRedemption.user?.email}</p>
            <p><span className="text-muted-foreground">Points:</span> {detailRedemption.pointsSpent}</p>
            <Link href="/dashboard/redemptions" className="admin-btn-primary inline-flex mt-4">
              Open in Redemptions
            </Link>
          </div>
        )}
      </Drawer>
    </div>
  );
}
