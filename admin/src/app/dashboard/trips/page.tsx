"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, Trash2, Eye, Globe } from "lucide-react";
import { getAdminTrips, getTripsStats, deleteTrip } from "@/services/trips";
import type { Trip, TripsStats } from "@/services/trips";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function TripsPage() {
  const { notify } = useNotification();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<TripsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminTrips({
        page,
        limit: 15,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setTrips(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    getTripsStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Trip",
      message: "Are you sure you want to delete this trip? This action cannot be undone.",
      action: async () => {
        setActionLoading(id);
        try {
          await deleteTrip(id);
          notify("success", "Trip deleted successfully");
          fetchTrips();
          getTripsStats().then(setStats).catch(() => {});
        } catch {
          notify("error", "Failed to delete trip");
        }
        setConfirmDialog((p) => ({ ...p, open: false }));
        setActionLoading(null);
      },
    });
  };

  const columns: Column<Trip & Record<string, unknown>>[] = [
    {
      key: "title",
      header: "Title",
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.coverImage ? (
            <img
              src={item.coverImage}
              alt=""
              className="h-9 w-9 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
              <Globe size={16} className="text-gray-400" />
            </div>
          )}
          <div>
            <p className="max-w-[220px] truncate font-medium text-gray-900">
              {item.title}
            </p>
            {item.destination && (
              <p className="text-xs text-gray-500">{item.destination}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "user",
      header: "User",
      render: (item) => (
        <div className="text-sm">
          <p className="font-medium text-gray-700">{item.user?.name || "—"}</p>
          <p className="text-xs text-gray-400">{item.user?.email || ""}</p>
        </div>
      ),
    },
    {
      key: "destination",
      header: "Destination",
      render: (item) => (
        <span className="text-sm text-gray-600">
          {item.destination || "—"}
        </span>
      ),
    },
    {
      key: "days",
      header: "Days",
      render: (item) => (
        <span className="text-sm font-medium text-gray-700">
          {item.days || item._count?.tripDays || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: "stops",
      header: "Stops",
      render: (item) => (
        <span className="text-sm text-gray-600">{item.stopsCount ?? "—"}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Created At",
      render: (item) => (
        <span className="text-sm text-gray-500">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/trips/${item.id}`}
            className="rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50"
            title="View Trip"
          >
            <Eye size={16} />
          </Link>
          <button
            onClick={() => handleDelete(item.id)}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            title="Delete Trip"
          >
            {actionLoading === item.id ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            ) : (
              <Trash2 size={16} />
            )}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalRecords > 0
              ? `Manage all user trip plans — ${totalRecords.toLocaleString()} total`
              : "Manage all user trip plans"}
          </p>
        </div>
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Trips</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {stats.totalTrips.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Active Trips</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {stats.activeTrips.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Completed Today</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {stats.completedToday.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Stops</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">
              {stats.totalStops.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search trips by title or destination..."
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={trips as (Trip & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={setPage}
        emptyMessage="No trips found"
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
