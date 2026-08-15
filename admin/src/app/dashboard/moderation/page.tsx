"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, ExternalLink, Check, X as XIcon, AlertTriangle, Shield } from "lucide-react";
import { getIncidents, updateIncidentStatus, type UnifiedIncident } from "@/services/moderation";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";

const ROUTE_MAP: Record<string, string> = {
  PLACE: "/dashboard/places",
  HIDDEN_GEM: "/dashboard/hidden-gems",
  VENDOR_APP: "/dashboard/vendors",
  CREATOR_APP: "/dashboard/creators",
  REEL: "/dashboard/reels",
};

export default function UnifiedModerationPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState<UnifiedIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getIncidents({ page, limit: 15, search: search || undefined, contentType: typeFilter || undefined, status: "PENDING" });
      setItems(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      notify("error", "Failed to load moderation queue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatus = async (id: string, status: string) => {
    const label = status.toLowerCase().replace(/_/g, " ");
    const ok = window.confirm(
      status === "REJECTED"
        ? `Reject this item? This will persist to the database and remove it from the pending queue.`
        : status === "RESOLVED" || status === "APPROVED"
          ? `Approve/resolve this item? This will persist to the database.`
          : `Mark as ${label}?`,
    );
    if (!ok) return;
    try {
      await updateIncidentStatus(id, status);
      notify("success", `Marked as ${label}`);
      fetchData();
    } catch {
      notify("error", "Failed to update incident");
    }
  };

  const columns: Column<UnifiedIncident & Record<string, unknown>>[] = [
    { key: "contentType", header: "Type" },
    { key: "entityName", header: "Entity" },
    {
      key: "reason",
      header: "Reason",
      render: (item) => <span className="max-w-xs truncate block text-sm">{item.reason}</span>,
      exportValue: (item) => item.reason,
    },
    {
      key: "severity",
      header: "Severity",
      render: (item) => <StatusBadge status={item.severity} />,
      exportValue: (item) => item.severity,
    },
    {
      key: "priority",
      header: "Priority",
      render: (item) => <span className="text-sm font-medium">{item.priority}</span>,
    },
    {
      key: "createdAt",
      header: "Queued",
      render: (item) => new Date(item.createdAt).toLocaleString(),
      exportValue: (item) => item.createdAt,
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => {
        const route = ROUTE_MAP[item.contentType] || "/dashboard/moderation";
        return (
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => handleStatus(item.id, "RESOLVED")} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="Resolve"><Check size={16} /></button>
            <button type="button" onClick={() => handleStatus(item.id, "REJECTED")} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Reject"><XIcon size={16} /></button>
            <button type="button" onClick={() => handleStatus(item.id, "ESCALATED")} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50" title="Escalate"><AlertTriangle size={16} /></button>
            <Link href={route} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
              Open <ExternalLink size={12} />
            </Link>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Unified Moderation"
        description={`${totalRecords} pending items across all queues`}
        icon={Shield}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search queue..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500" />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm">
          <option value="">All Types</option>
          <option value="PLACE">Places</option>
          <option value="HIDDEN_GEM">Hidden Gems</option>
          <option value="VENDOR_APP">Vendors</option>
          <option value="CREATOR_APP">Creators</option>
          <option value="REEL">Reel Reports</option>
        </select>
      </div>
      <DataTable columns={columns} data={items as (UnifiedIncident & Record<string, unknown>)[]} loading={loading} page={page} totalPages={totalPages} totalRecords={totalRecords} hasNext={hasNext} hasPrev={hasPrev} onPageChange={setPage} emptyMessage="No pending moderation items" exportFilename="moderation-queue" />
    </div>
  );
}
