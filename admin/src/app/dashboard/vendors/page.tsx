"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Store, Handshake, Check, X as XIcon, Pause, Ban, Trash2, FileText, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getVendors, verifyVendor, deleteVendor, resetVendorCode, type Vendor, type VendorStatus } from "@/services/vendors";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Paused", value: "PAUSED" },
  { label: "Changes Requested", value: "CHANGES_REQUESTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Retired", value: "RETIRED" },
] as const;

const TYPE_EMOJIS: Record<string, string> = {
  hotel: "🏨", restaurant: "🍽️", guide: "🧑‍🏫",
  travel_agent: "✈️", vehicle_rental: "🚗", local_shop: "🛒",
};

export default function VendorsPage() {
  const { notify } = useNotification();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status) setActiveTab(status);
  }, []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "primary" | "danger";
    action: () => Promise<void>;
  }>({ open: false, title: "", message: "", variant: "primary", action: async () => {} });

  const fetchVendors = useCallback(async (status: string, p: number) => {
    setLoading(true);
    try {
      const params: { status?: string; page: number; limit: number } = { page: p, limit: 20 };
      if (status) params.status = status;
      const res = await getVendors(params);
      setVendors(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
      setPage(res.pagination.page);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors(activeTab, 1);
  }, [activeTab, fetchVendors]);

  const handleVerify = (id: string, status: VendorStatus) => {
    const isApprove = status === "APPROVED";
    const isChangesRequested = status === "CHANGES_REQUESTED";
    const needsReason = status === "REJECTED" || isChangesRequested;
    const reason = needsReason
      ? window.prompt(isChangesRequested ? "Describe the changes required:" : "Provide a rejection reason:")
      : undefined;

    if (needsReason && !reason?.trim()) return;

    const titles: Record<string, string> = {
      APPROVED: "Approve Vendor",
      REJECTED: "Reject Vendor",
      CHANGES_REQUESTED: "Request Vendor Changes",
      SUSPENDED: "Suspend Vendor",
      PAUSED: "Pause Vendor",
    };

    setConfirmDialog({
      open: true,
      title: titles[status] || "Update Vendor",
      message: isApprove
        ? "Approve this vendor on the same user account? They can switch to Vendor mode without a new login."
        : `Set vendor status to ${status}?`,
      variant: status === "REJECTED" || status === "SUSPENDED" ? "danger" : "primary",
      action: async () => {
        setActionLoading(id);
        try {
          await verifyVendor(id, status, reason?.trim());
          notify("success", `Vendor ${status.toLowerCase().replace(/_/g, " ")}`);
          fetchVendors(activeTab, page);
        } catch (err) {
          notify("error", err instanceof Error ? err.message : "Failed to update vendor");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleResetCode = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Reset Vendor Code",
      message: "Generate a new vendor code? The old code will stop working for redemptions.",
      variant: "primary",
      action: async () => {
        setActionLoading(id);
        try {
          await resetVendorCode(id);
          notify("success", "Vendor code reset");
          fetchVendors(activeTab, page);
        } catch {
          notify("error", "Failed to reset vendor code");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Vendor",
      message: "Permanently remove this vendor profile? The underlying user account stays; vendor role will be revoked.",
      variant: "danger",
      action: async () => {
        setActionLoading(id);
        try {
          await deleteVendor(id);
          notify("success", "Vendor deleted");
          fetchVendors(activeTab, page);
        } catch {
          notify("error", "Failed to delete vendor");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleBulkApprove = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setConfirmDialog({
      open: true,
      title: "Bulk Approve Vendors",
      message: `Approve ${ids.length} selected vendor(s)?`,
      variant: "primary",
      action: async () => {
        setBulkLoading(true);
        let ok = 0;
        for (const id of ids) {
          try {
            await verifyVendor(id, "APPROVED");
            ok++;
          } catch {
            /* continue */
          }
        }
        notify("success", `Approved ${ok} of ${ids.length} vendors`);
        setSelectedIds(new Set());
        fetchVendors(activeTab, page);
        setBulkLoading(false);
      },
    });
  };

  const handleBulkSuspend = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setConfirmDialog({
      open: true,
      title: "Bulk Suspend Vendors",
      message: `Suspend ${ids.length} selected vendor(s)?`,
      variant: "danger",
      action: async () => {
        setBulkLoading(true);
        let ok = 0;
        for (const id of ids) {
          try {
            await verifyVendor(id, "SUSPENDED");
            ok++;
          } catch {
            /* continue */
          }
        }
        notify("success", `Suspended ${ok} of ${ids.length} vendors`);
        setSelectedIds(new Set());
        fetchVendors(activeTab, page);
        setBulkLoading(false);
      },
    });
  };

  const columns: Column<Vendor & Record<string, unknown>>[] = [
    {
      key: "businessName",
      header: "Business",
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <Store size={18} className="text-indigo-600" />
          </div>
          <div>
            <Link href={`/dashboard/vendors/${item.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
              {item.businessName}
            </Link>
            <p className="text-xs text-gray-500">{item.user?.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "businessType",
      header: "Type",
      render: (item) => (
        <span className="text-sm text-gray-600">
          {TYPE_EMOJIS[item.businessType] || "🏪"} {item.businessType.replace(/_/g, " ")}
        </span>
      ),
    },
    { key: "city", header: "City" },
    { key: "state", header: "State" },
    {
      key: "vendorCode",
      header: "Vendor Code",
      render: (item) => (
        <span className="font-mono text-xs text-gray-700">{item.vendorCode || "—"}</span>
      ),
    },
    {
      key: "documents",
      header: "Documents",
      render: (item) => (
        <div className="flex max-w-[140px] flex-wrap gap-1">
          {(item.documents || []).length === 0 ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            (item.documents || []).slice(0, 3).map((url, i) => (
              <a
                key={`${url}-${i}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-200"
              >
                <FileText size={10} /> Doc {i + 1}
              </a>
            ))
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: "createdAt",
      header: "Requested",
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
        <div className="flex flex-wrap items-center gap-1">
          {item.status === "PENDING" && (
            <>
              <button
                onClick={() => handleVerify(item.id, "APPROVED")}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                title="Approve"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => handleVerify(item.id, "REJECTED")}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                title="Reject"
              >
                <XIcon size={16} />
              </button>
              <button
                onClick={() => handleVerify(item.id, "CHANGES_REQUESTED")}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-amber-600 transition hover:bg-amber-50 disabled:opacity-50"
                title="Request Changes"
              >
                <Handshake size={16} />
              </button>
            </>
          )}
          {item.status === "APPROVED" && (
            <>
              <button
                onClick={() => handleVerify(item.id, "PAUSED")}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-amber-600 transition hover:bg-amber-50 disabled:opacity-50"
                title="Pause"
              >
                <Pause size={16} />
              </button>
              <button
                onClick={() => handleVerify(item.id, "SUSPENDED")}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                title="Suspend"
              >
                <Ban size={16} />
              </button>
              <button
                onClick={() => handleResetCode(item.id)}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                title="Reset Vendor Code"
              >
                <RefreshCw size={16} />
              </button>
            </>
          )}
          {(item.status === "PAUSED" || item.status === "SUSPENDED") && (
            <button
              onClick={() => handleVerify(item.id, "APPROVED")}
              disabled={actionLoading === item.id}
              className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
              title="Re-approve"
            >
              <Check size={16} />
            </button>
          )}
          <button
            onClick={() => handleDelete(item.id)}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-red-700 transition hover:bg-red-50 disabled:opacity-50"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Vendors"
        description="Approval queue, documents, QR codes, offers, and vendor lifecycle management."
        icon={Store}
        actions={
          activeTab === "PENDING" ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Approval Queue
            </span>
          ) : null
        }
      />

      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setPage(1); }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={vendors as (Vendor & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={(p) => fetchVendors(activeTab, p)}
        emptyMessage={
          activeTab
            ? `No ${activeTab.toLowerCase()} vendors found`
            : "No vendors found"
        }
        exportFilename="vendors-export"
        showFirstLast
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        toolbar={
          selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{selectedIds.size} selected</span>
              <button type="button" disabled={bulkLoading} onClick={handleBulkApprove} className="admin-btn-primary py-1.5 text-xs">
                Bulk Approve
              </button>
              <button type="button" disabled={bulkLoading} onClick={handleBulkSuspend} className="admin-btn-secondary py-1.5 text-xs">
                Bulk Suspend
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground">
                Clear
              </button>
            </div>
          ) : null
        }
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onConfirm={async () => {
          await confirmDialog.action();
          setConfirmDialog((p) => ({ ...p, open: false }));
        }}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
