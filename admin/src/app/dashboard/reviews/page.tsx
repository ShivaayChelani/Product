"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Trash2, Check, Eye, ShieldAlert, XCircle, User, MapPin, Store, Flag,
} from "lucide-react";
import { getReviews, updateReviewStatus, type AdminReview, type ReviewModerationStatus } from "@/services/reviews";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";

const STATUS_TABS = [
  { label: "All Reviews", value: "", icon: Eye },
  { label: "Pending", value: "PENDING", icon: ShieldAlert },
  { label: "Approved", value: "APPROVED", icon: Check },
  { label: "Rejected", value: "REJECTED", icon: XCircle },
] as const;

export default function ReviewsModerationPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [statusTab, setStatusTab] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailReview, setDetailReview] = useState<AdminReview | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({ open: false, title: "", message: "", action: async () => {} });

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReviews({
        page,
        limit: 15,
        search: search || undefined,
        entityType: entityFilter || undefined,
        status: statusTab || undefined,
      });
      const data = res.data;
      setItems(data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      notify("error", "Failed to load reviews");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, entityFilter, statusTab, notify]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const runBulkStatus = (status: ReviewModerationStatus, label: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setConfirm({
      open: true,
      title: `Bulk ${label}`,
      message: `${label} ${ids.length} selected review(s)? Status will be persisted; reviews are not deleted.`,
      action: async () => {
        setConfirm((p) => ({ ...p, open: false }));
        setBulkLoading(true);
        let ok = 0;
        for (const id of ids) {
          try {
            await updateReviewStatus(id, status);
            ok++;
          } catch {
            /* continue */
          }
        }
        notify("success", `${label}: ${ok} of ${ids.length} reviews updated`);
        setSelectedIds(new Set());
        void fetchData();
        setBulkLoading(false);
      },
    });
  };

  const columns: Column<AdminReview & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "reviewer",
        header: "Reviewer",
        render: (item) => (
          <button
            type="button"
            onClick={() => setDetailReview(item as AdminReview)}
            className="text-left font-medium hover:text-primary hover:underline"
          >
            {item.reviewer?.name || "—"}
          </button>
        ),
        exportValue: (item) => item.reviewer?.name,
      },
      { key: "entityType", header: "Type" },
      {
        key: "entityName",
        header: "Entity",
        render: (item) => (
          <span className="max-w-[180px] truncate block">{item.entityName || "—"}</span>
        ),
      },
      { key: "rating", header: "Rating", sortable: true },
      {
        key: "content",
        header: "Content",
        render: (item) => (
          <span className="max-w-xs truncate block text-sm text-muted-foreground">
            {item.content || "—"}
          </span>
        ),
        exportValue: (item) => item.content,
      },
      {
        key: "reportsCount",
        header: "Reports",
        render: (item) =>
          item.reportsCount > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {item.reportsCount}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "status",
        header: "Status",
        render: (item) => <StatusBadge status={item.status} />,
        exportValue: (item) => item.status,
      },
      {
        key: "createdAt",
        header: "Date",
        render: (item) => new Date(item.createdAt).toLocaleDateString(),
        exportValue: (item) => item.createdAt,
      },
      {
        key: "actions",
        header: "Actions",
        render: (item) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDetailReview(item as AdminReview)}
              className="rounded p-1.5 text-primary hover:bg-muted"
              title="View details"
            >
              <Eye size={16} />
            </button>
            {item.status !== "APPROVED" && (
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    open: true,
                    title: "Approve Review",
                    message: "Approve and publish this review?",
                    action: async () => {
                      setConfirm((p) => ({ ...p, open: false }));
                      await updateReviewStatus(item.id, "APPROVED");
                      notify("success", "Review approved");
                      void fetchData();
                    },
                  })
                }
                className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
                title="Approve"
              >
                <Check size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  open: true,
                  title: "Reject Review",
                  message: "Reject this review? It will remain auditable with status REJECTED and will no longer appear publicly.",
                  action: async () => {
                    setConfirm((p) => ({ ...p, open: false }));
                    await updateReviewStatus(item.id, "REJECTED");
                    notify("success", "Review rejected");
                    void fetchData();
                  },
                })
              }
              className="rounded p-1.5 text-red-600 hover:bg-red-50"
              title="Reject"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
      },
    ],
    [fetchData, notify],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reviews"
        description="Moderate place and vendor reviews — approve, hide, or remove reported and spam content."
        icon={Flag}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatusTab(tab.value);
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              statusTab === tab.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search review content..."
            className="admin-input pl-10"
            aria-label="Search reviews"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          className="admin-input w-auto min-w-[160px]"
          aria-label="Filter by entity type"
        >
          <option value="">All Types</option>
          <option value="PLACE">Place Reviews</option>
          <option value="VENDOR">Vendor Reviews</option>
        </select>
      </div>

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No reviews found"
          description="Try adjusting filters or check back when users submit new reviews."
        />
      ) : (
        <DataTable
          columns={columns}
          data={items as (AdminReview & Record<string, unknown>)[]}
          loading={loading}
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onPageChange={setPage}
          emptyMessage="No reviews found"
          exportFilename="reviews-export"
          showFirstLast
          selectable
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          toolbar={
            selectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => runBulkStatus("APPROVED", "Approve")}
                  className="admin-btn-primary py-1.5 text-xs"
                >
                  Bulk Approve
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => runBulkStatus("PENDING", "Mark Pending")}
                  className="admin-btn-secondary py-1.5 text-xs"
                >
                  Bulk Pending
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => runBulkStatus("REJECTED", "Reject")}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Bulk Reject
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        onConfirm={() => void confirm.action()}
        onCancel={() => setConfirm((p) => ({ ...p, open: false }))}
      />

      <Drawer
        open={!!detailReview}
        onClose={() => setDetailReview(null)}
        title="Review Details"
        width="max-w-lg"
      >
        {detailReview && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <User size={18} />
              </span>
              <div>
                <p className="font-semibold">{detailReview.reviewer?.name}</p>
                <Link
                  href={`/dashboard/users?id=${detailReview.reviewer?.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  View user profile
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Rating</p>
                <p className="text-lg font-bold">{detailReview.rating} / 5</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Status</p>
                <StatusBadge status={detailReview.status} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Type</p>
                <p className="flex items-center gap-1 text-sm">
                  {detailReview.entityType === "VENDOR" ? <Store size={14} /> : <MapPin size={14} />}
                  {detailReview.entityType}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Reports</p>
                <p>{detailReview.reportsCount || 0}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Entity</p>
              <p className="font-medium">{detailReview.entityName}</p>
              {detailReview.entityType === "PLACE" && (
                <Link
                  href={`/dashboard/places?search=${encodeURIComponent(detailReview.entityName)}`}
                  className="text-xs text-primary hover:underline"
                >
                  View in Places
                </Link>
              )}
              {detailReview.entityType === "VENDOR" && (
                <Link
                  href={`/dashboard/vendors?search=${encodeURIComponent(detailReview.entityName)}`}
                  className="text-xs text-primary hover:underline"
                >
                  View in Vendors
                </Link>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Content</p>
              <p className="text-sm leading-relaxed">{detailReview.content || "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted {new Date(detailReview.createdAt).toLocaleString()}
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
