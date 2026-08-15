"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Receipt, Download, RefreshCw, RotateCcw, Eye, AlertCircle,
} from "lucide-react";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import { useNotification } from "@/components/Notification";
import { exportTableData } from "@/lib/exportUtils";
import {
  listRedemptions,
  refundRedemption,
  exportRedemptionsUrl,
  type RedemptionRow,
} from "@/services/redemptions";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Pending", value: "PENDING" },
];

const PAGE_SIZE = 25;

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-border py-2.5 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export default function RedemptionsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState<RedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [receiptInput, setReceiptInput] = useState("");
  const [vendorInput, setVendorInput] = useState("");
  const [userInput, setUserInput] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [detailRow, setDetailRow] = useState<RedemptionRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<RedemptionRow | null>(null);
  const [refundNotes, setRefundNotes] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setReceiptNumber(receiptInput);
      setVendorSearch(vendorInput);
      setUserSearch(userInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [receiptInput, vendorInput, userInput]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRedemptions({
        page: p,
        limit: PAGE_SIZE,
        status: status || undefined,
        receiptNumber: receiptNumber || undefined,
        vendorSearch: vendorSearch || undefined,
        userSearch: userSearch || undefined,
      });
      setRows(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
      setPage(res.pagination.page);
    } catch {
      setError("Failed to load redemptions");
      setRows([]);
      notify("error", "Failed to load redemptions");
    } finally {
      setLoading(false);
    }
  }, [status, receiptNumber, vendorSearch, userSearch, notify]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    setActionLoading(refundTarget.id);
    try {
      await refundRedemption(refundTarget.id, refundNotes.trim() || undefined);
      notify("success", "Redemption refunded");
      setRefundTarget(null);
      setRefundNotes("");
      setDetailRow(null);
      void load(page);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Refund failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportBackendCsv = () => {
    const url = exportRedemptionsUrl({
      status: status || undefined,
      receiptNumber: receiptNumber || undefined,
      vendorSearch: vendorSearch || undefined,
      userSearch: userSearch || undefined,
    });
    window.open(url, "_blank");
  };

  const columns: Column<RedemptionRow & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "receiptNumber",
        header: "Receipt",
        render: (r) => (
          <button
            type="button"
            onClick={() => setDetailRow(r as RedemptionRow)}
            className="font-mono text-xs hover:text-primary hover:underline"
          >
            {r.receiptNumber || "—"}
          </button>
        ),
        exportValue: (r) => r.receiptNumber,
      },
      {
        key: "vendor",
        header: "Vendor",
        render: (r) => (
          <div>
            <p className="text-sm font-medium">{r.vendor?.businessName || "—"}</p>
            <p className="font-mono text-xs text-muted-foreground">{r.vendor?.vendorCode || ""}</p>
          </div>
        ),
        exportValue: (r) => r.vendor?.businessName,
      },
      {
        key: "user",
        header: "User",
        render: (r) => (
          <div>
            <p className="text-sm">{r.user?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">{r.user?.email || ""}</p>
          </div>
        ),
        exportValue: (r) => r.user?.email,
      },
      { key: "offer", header: "Offer", render: (r) => r.offer?.title || "—", exportValue: (r) => r.offer?.title },
      { key: "pointsSpent", header: "Points", exportValue: (r) => r.pointsSpent },
      {
        key: "discountValue",
        header: "Value",
        render: (r) => `₹${Math.round(r.discountValue || 0)}`,
        exportValue: (r) => r.discountValue,
      },
      {
        key: "status",
        header: "Status",
        render: (r) => <StatusBadge status={r.status} />,
        exportValue: (r) => r.status,
      },
      {
        key: "createdAt",
        header: "Redeemed",
        render: (r) => new Date(r.createdAt).toLocaleString(),
        exportValue: (r) => r.createdAt,
      },
      {
        key: "actions",
        header: "",
        render: (r) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDetailRow(r as RedemptionRow)}
              className="rounded p-1.5 text-primary hover:bg-muted"
              aria-label="View redemption"
            >
              <Eye size={16} />
            </button>
            {r.status === "VERIFIED" && !r.refundedAt && (
              <button
                type="button"
                onClick={() => setRefundTarget(r as RedemptionRow)}
                disabled={actionLoading === r.id}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                <RotateCcw size={12} /> Refund
              </button>
            )}
          </div>
        ),
      },
    ],
    [actionLoading],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Redemptions"
        description="Search receipts, review redemption details, process refunds, and export data."
        icon={Receipt}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load(page)} className="admin-btn-secondary">
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" onClick={handleExportBackendCsv} className="admin-btn-primary">
              <Download size={16} /> Export CSV (full)
            </button>
            <button
              type="button"
              disabled={!rows.length}
              onClick={() => exportTableData(columns, rows as (RedemptionRow & Record<string, unknown>)[], "redemptions-page", "excel")}
              className="admin-btn-secondary disabled:opacity-50"
              title="Exports the current page only"
            >
              Export Excel (page)
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              status === tab.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          className="admin-input"
          placeholder="Search receipt (RCP-…)"
          value={receiptInput}
          onChange={(e) => setReceiptInput(e.target.value)}
          aria-label="Search by receipt number"
        />
        <input
          className="admin-input"
          placeholder="Search vendor name or code"
          value={vendorInput}
          onChange={(e) => setVendorInput(e.target.value)}
          aria-label="Search by vendor"
        />
        <input
          className="admin-input"
          placeholder="Search user name or email"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          aria-label="Search by user"
        />
      </div>

      {error && !loading ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load redemptions"
          description={error}
          action={
            <button type="button" onClick={() => void load(page)} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      ) : !loading && rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No redemptions found"
          description="Try adjusting filters or search terms."
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows as (RedemptionRow & Record<string, unknown>)[]}
          loading={loading}
          emptyMessage="No redemptions found"
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onPageChange={setPage}
          showFirstLast
          pageSize={PAGE_SIZE}
        />
      )}

      <Drawer open={!!detailRow} onClose={() => setDetailRow(null)} title="Redemption Details" width="max-w-lg">
        {detailRow && (
          <div className="space-y-4">
            <dl>
              <FieldRow label="Receipt">
                <span className="font-mono">{detailRow.receiptNumber || "—"}</span>
              </FieldRow>
              <FieldRow label="Status"><StatusBadge status={detailRow.status} /></FieldRow>
              <FieldRow label="Vendor">{detailRow.vendor?.businessName || "—"}</FieldRow>
              <FieldRow label="Vendor Code">{detailRow.vendor?.vendorCode || "—"}</FieldRow>
              <FieldRow label="User">{detailRow.user?.name || "—"}</FieldRow>
              <FieldRow label="Email">{detailRow.user?.email || "—"}</FieldRow>
              <FieldRow label="Offer">{detailRow.offer?.title || "—"}</FieldRow>
              <FieldRow label="Points Spent">{detailRow.pointsSpent}</FieldRow>
              <FieldRow label="Discount">₹{Math.round(detailRow.discountValue || 0)}</FieldRow>
              <FieldRow label="Redeemed">{new Date(detailRow.createdAt).toLocaleString()}</FieldRow>
              {detailRow.verifiedAt && (
                <FieldRow label="Verified">{new Date(detailRow.verifiedAt).toLocaleString()}</FieldRow>
              )}
              {detailRow.refundedAt && (
                <FieldRow label="Refunded">{new Date(detailRow.refundedAt).toLocaleString()}</FieldRow>
              )}
              {detailRow.notes && <FieldRow label="Notes">{detailRow.notes}</FieldRow>}
            </dl>
            {detailRow.status === "VERIFIED" && !detailRow.refundedAt && (
              <button
                type="button"
                onClick={() => {
                  setRefundNotes("");
                  setRefundTarget(detailRow);
                }}
                className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                Process Refund
              </button>
            )}
          </div>
        )}
      </Drawer>

      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Refund Redemption</h3>
            <p className="mt-2 text-sm text-gray-600">
              Refund {refundTarget.pointsSpent || 0} PalPoints to {refundTarget.user?.name || "user"}?
              Receipt: <span className="font-mono">{refundTarget.receiptNumber || "—"}</span>
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-500" htmlFor="refund-notes">
              Refund notes (optional)
            </label>
            <textarea
              id="refund-notes"
              className="admin-input mt-1 min-h-[80px] w-full"
              value={refundNotes}
              onChange={(e) => setRefundNotes(e.target.value)}
              placeholder="Reason for refund…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => {
                  setRefundTarget(null);
                  setRefundNotes("");
                }}
                disabled={!!actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => void handleRefund()}
                disabled={!!actionLoading}
              >
                {actionLoading ? "Refunding…" : "Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
