"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Handshake, Search, PauseCircle, BarChart3 } from "lucide-react";
import {
  getAnalyticsSummary,
  listCollaborations,
  suspendCollaboration,
  type AdminCollaboration,
  type AdminCollaborationAnalytics,
} from "@/services/collaborations";

export default function CollaborationsAdminPage() {
  const [items, setItems] = useState<AdminCollaboration[]>([]);
  const [summary, setSummary] = useState<AdminCollaborationAnalytics | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, analytics] = await Promise.all([
        listCollaborations({ search: search || undefined, status: status || undefined }),
        getAnalyticsSummary(),
      ]);
      setItems(listRes.data || []);
      setSummary(analytics);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load collaborations");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSuspend = async (id: string) => {
    const reason = window.prompt("Suspension reason");
    if (!reason) return;
    await suspendCollaboration(id, reason);
    await load();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Handshake className="h-7 w-7 text-emerald-600" />
            Creator Collaborations
          </h1>
          <p className="text-sm text-gray-500 mt-1">Vendor ↔ Creator campaigns, moderation & revenue</p>
        </div>
        <Link href="/dashboard" className="text-sm text-emerald-700 hover:underline">← Dashboard</Link>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total" value={summary.total} icon={<BarChart3 className="h-4 w-4" />} />
          <StatCard label="Active" value={summary.active} />
          <StatCard label="Completed" value={summary.completed} />
          <StatCard label="Budget (₹)" value={Math.round(summary.totalBudgetPaise / 100).toLocaleString("en-IN")} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {["PENDING", "ACCEPTED", "IN_PROGRESS", "REEL_UPLOADED", "COMPLETED", "REJECTED", "SUSPENDED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => void load()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
          Refresh
        </button>
        <button
          type="button"
          disabled={!items.length}
          onClick={() => {
            const header = ["Campaign", "Vendor", "Creator", "BudgetINR", "Status", "Id"];
            const rows = items.map((row) => [
              row.campaignTitle,
              row.vendor?.businessName || row.businessName || "",
              row.creator?.fullName || row.creator?.username || "",
              String(Math.round(row.budgetPaise / 100)),
              row.status,
              row.id,
            ]);
            const csv = [header, ...rows]
              .map((cols) =>
                cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
              )
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "collaborations-export.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error ? <p className="text-red-600 text-sm">{error}</p> : null}
      {loading ? <p className="text-gray-500">Loading...</p> : null}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">{row.campaignTitle}</td>
                <td className="px-4 py-3">{row.vendor?.businessName || row.businessName}</td>
                <td className="px-4 py-3">{row.creator?.fullName || row.creator?.username || "—"}</td>
                <td className="px-4 py-3">₹{Math.round(row.budgetPaise / 100).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold">{row.status}</span></td>
                <td className="px-4 py-3">
                  {row.status !== "SUSPENDED" && row.status !== "COMPLETED" ? (
                    <button
                      type="button"
                      onClick={() => void handleSuspend(row.id)}
                      className="inline-flex items-center gap-1 text-amber-700 hover:underline"
                    >
                      <PauseCircle className="h-4 w-4" /> Suspend
                    </button>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No collaborations found</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-gray-500 uppercase font-semibold">
        {label}
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
