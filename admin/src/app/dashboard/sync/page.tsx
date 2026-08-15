"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import {
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ScanLine,
} from "lucide-react";
import { getSyncStatus, getSyncItems } from "@/services/sync";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import StatCard from "@/components/StatCard";
import type { SyncItem, SyncStats } from "@/types";

export default function SyncPage() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [items, setItems] = useState<SyncItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, itemsData] = await Promise.all([
        getSyncStatus(),
        getSyncItems({ page, limit: 15, status: statusFilter || undefined }),
      ]);
      setStats(statsData);
      setItems(itemsData.data);
      setTotalPages(itemsData.pagination.totalPages);
      setTotalRecords(itemsData.pagination.total);
      setHasNext(itemsData.pagination.hasNext);
      setHasPrev(itemsData.pagination.hasPrev);
    } catch {
      setStats(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const columns: Column<SyncItem & Record<string, unknown>>[] = [
    { key: "action", header: "Action" },
    { key: "entityType", header: "Entity" },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
      exportValue: (item) => item.status,
    },
    {
      key: "retryCount",
      header: "Retries",
      render: (item) => (
        <span className="text-sm text-gray-500">{item.retryCount}</span>
      ),
    },
    {
      key: "error",
      header: "Error",
      render: (item) =>
        item.error ? (
          <span className="max-w-[200px] truncate text-xs text-red-500" title={item.error}>
            {item.error}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
      exportValue: (item) => item.error || "",
    },
    {
      key: "createdAt",
      header: "Queued",
      render: (item) => (
        <span className="text-sm text-gray-500">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      ),
      exportValue: (item) => new Date(item.createdAt).toISOString(),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Offline Sync"
        description="Mobile offline sync queue — pending, processing, and failed jobs from the app."
        icon={ScanLine}
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="admin-btn-secondary"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Total Jobs" value={stats?.total || 0} icon={RefreshCw} color="blue" />
        <StatCard title="Pending" value={stats?.pending || 0} icon={Clock} color="yellow" />
        <StatCard title="Processing" value={stats?.processing || 0} icon={Loader2} color="blue" />
        <StatCard title="Completed" value={stats?.completed || 0} icon={CheckCircle} color="emerald" />
        <StatCard title="Failed" value={stats?.failed || 0} icon={AlertCircle} color="red" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
        {stats && stats.pending > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-blue-600">
            <Loader2 size={14} className="animate-spin" />
            {stats.pending} jobs in queue
          </span>
        )}
      </div>

      <DataTable
        columns={columns}
        data={items as (SyncItem & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={setPage}
        emptyMessage="No sync jobs"
        exportFilename="sync-queue"
      />
    </div>
  );
}
