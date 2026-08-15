"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clapperboard, Check, X as XIcon, Ban, Video,
  Search, RefreshCw, Eye, Trophy,
} from "lucide-react";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import { getCreatorApplications, verifyCreator, type CreatorApplication, type CreatorStatus } from "@/services/creators";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
] as const;

export default function CreatorsPage() {
  const { notify } = useNotification();
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailCreator, setDetailCreator] = useState<CreatorApplication | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "primary" | "danger";
    action: () => Promise<void>;
  }>({ open: false, title: "", message: "", variant: "primary", action: async () => {} });

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await getCreatorApplications(
        (activeTab || undefined) as CreatorApplication["status"] | undefined,
      );
      setApplications(data);
    } catch (err) {
      setApplications([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load creators");
      notify("error", "Failed to load creator applications");
    } finally {
      setLoading(false);
    }
  }, [activeTab, notify]);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  const filtered = useMemo(() => {
    if (!search.trim()) return applications;
    const q = search.toLowerCase();
    return applications.filter(
      (a) =>
        a.username?.toLowerCase().includes(q) ||
        a.fullName?.toLowerCase().includes(q) ||
        a.user?.email?.toLowerCase().includes(q),
    );
  }, [applications, search]);

  const stats = useMemo(() => ({
    total: applications.length,
    pending: applications.filter((a) => a.status === "PENDING").length,
    approved: applications.filter((a) => a.status === "APPROVED").length,
  }), [applications]);

  const handleVerify = useCallback((id: string, status: CreatorStatus) => {
    const isApprove = status === "APPROVED";
    const isChangesRequested = status === "CHANGES_REQUESTED";
    const needsReason = status === "REJECTED" || isChangesRequested;
    const reason = needsReason
      ? window.prompt(isChangesRequested ? "Describe the changes required:" : "Provide a rejection reason:")
      : undefined;
    if (needsReason && !reason?.trim()) return;

    const titles: Record<string, string> = {
      APPROVED: "Approve Creator",
      REJECTED: "Reject Creator",
      CHANGES_REQUESTED: "Request Creator Changes",
      SUSPENDED: "Suspend Creator",
      PAUSED: "Pause Creator",
    };

    setConfirmDialog({
      open: true,
      title: titles[status] || "Update Creator",
      message: isApprove
        ? "Approve this creator on the same user account?"
        : `Set creator status to ${status}?`,
      variant: status === "REJECTED" || status === "SUSPENDED" ? "danger" : "primary",
      action: async () => {
        setActionLoading(id);
        try {
          await verifyCreator(id, status, reason?.trim());
          notify("success", `Creator ${status.toLowerCase().replace(/_/g, " ")}`);
          void fetchApplications();
          if (detailCreator?.id === id) setDetailCreator(null);
        } catch (err) {
          notify("error", err instanceof Error ? err.message : "Failed to update creator");
        } finally {
          setActionLoading(null);
        }
      },
    });
  }, [detailCreator?.id, fetchApplications, notify]);

  const handleBulkApprove = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setConfirmDialog({
      open: true,
      title: "Bulk Approve Creators",
      message: `Approve ${ids.length} selected creator application(s)?`,
      variant: "primary",
      action: async () => {
        let ok = 0;
        for (const id of ids) {
          try {
            await verifyCreator(id, "APPROVED");
            ok++;
          } catch {
            /* continue */
          }
        }
        notify("success", `Approved ${ok} of ${ids.length} creators`);
        setSelectedIds(new Set());
        fetchApplications();
      },
    });
  };

  const columns: Column<CreatorApplication & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "username",
        header: "Creator",
        render: (item) => (
          <button type="button" onClick={() => setDetailCreator(item as CreatorApplication)} className="flex items-center gap-3 text-left">
            {item.avatar ? (
              <img src={item.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                <Clapperboard size={18} className="text-amber-600" />
              </div>
            )}
            <div>
              <p className="font-medium hover:text-primary hover:underline">@{item.username}</p>
              <p className="text-xs text-muted-foreground">{item.fullName || item.user?.name}</p>
            </div>
          </button>
        ),
      },
      {
        key: "travelCategories",
        header: "Categories",
        render: (item) => (
          <div className="flex max-w-[180px] flex-wrap gap-1">
            {(item.travelCategories || []).slice(0, 3).map((cat) => (
              <span key={cat} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {cat}
              </span>
            ))}
          </div>
        ),
      },
      { key: "status", header: "Status", render: (item) => <StatusBadge status={item.status} /> },
      {
        key: "createdAt",
        header: "Applied",
        render: (item) => new Date(item.createdAt).toLocaleDateString(),
      },
      {
        key: "actions",
        header: "Actions",
        render: (item) => (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setDetailCreator(item as CreatorApplication)} className="rounded p-1.5 text-primary hover:bg-muted" title="View">
              <Eye size={16} />
            </button>
            {item.status === "PENDING" && (
              <>
                <button type="button" onClick={() => handleVerify(item.id, "APPROVED")} disabled={actionLoading === item.id} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" title="Approve">
                  <Check size={16} />
                </button>
                <button type="button" onClick={() => handleVerify(item.id, "REJECTED")} disabled={actionLoading === item.id} className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50" title="Reject">
                  <XIcon size={16} />
                </button>
              </>
            )}
            {item.status === "APPROVED" && (
              <button type="button" onClick={() => handleVerify(item.id, "SUSPENDED")} disabled={actionLoading === item.id} className="rounded p-1.5 text-orange-700 hover:bg-orange-50 disabled:opacity-50" title="Suspend">
                <Ban size={16} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [actionLoading, handleVerify],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Creators"
        description="Review creator applications, verify profiles, manage engagement, and commission eligibility."
        icon={Clapperboard}
        actions={
          <button type="button" onClick={() => fetchApplications()} className="admin-btn-secondary">
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="admin-card p-4">
          <p className="text-sm text-muted-foreground">Total Applications</p>
          <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-sm text-muted-foreground">Pending Review</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600">{stats.pending}</p>
        </div>
        <div className="admin-card p-4">
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Trophy size={14} /> Approved Creators
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.approved}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.value ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search creators..." className="admin-input pl-9" aria-label="Search creators" />
      </div>

      {loadError && !loading && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40">
          {loadError}
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No creator applications" description="Applications will appear when users apply to become creators." />
      ) : (
        <DataTable
          columns={columns}
          data={filtered as (CreatorApplication & Record<string, unknown>)[]}
          loading={loading}
          emptyMessage="No creator applications found"
          exportFilename="creators-export"
          selectable
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          toolbar={
            selectedIds.size > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                <button type="button" onClick={handleBulkApprove} className="admin-btn-primary py-1.5 text-xs">Bulk Approve</button>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground">Clear</button>
              </div>
            ) : null
          }
        />
      )}

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

      <Drawer open={!!detailCreator} onClose={() => setDetailCreator(null)} title={detailCreator ? `@${detailCreator.username}` : "Creator"} width="max-w-xl">
        {detailCreator && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {detailCreator.avatar && <img src={detailCreator.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />}
              <div>
                <p className="font-semibold">{detailCreator.fullName}</p>
                <p className="text-sm text-muted-foreground">{detailCreator.user?.email}</p>
                <StatusBadge status={detailCreator.status} />
              </div>
            </div>
            {detailCreator.bio && <p className="text-sm leading-relaxed">{detailCreator.bio}</p>}
            <div className="flex flex-wrap gap-2">
              {detailCreator.instagramUrl && <a href={detailCreator.instagramUrl} target="_blank" rel="noreferrer" className="admin-btn-secondary py-1 text-xs">Instagram</a>}
              {detailCreator.youtubeUrl && <a href={detailCreator.youtubeUrl} target="_blank" rel="noreferrer" className="admin-btn-secondary py-1 text-xs">YouTube</a>}
              {detailCreator.sampleReelUrl && <a href={detailCreator.sampleReelUrl} target="_blank" rel="noreferrer" className="admin-btn-secondary py-1 text-xs"><Video size={12} /> Sample Reel</a>}
            </div>
            <Link href={`/dashboard/users?id=${detailCreator.userId}`} className="text-sm text-primary hover:underline">
              View user profile
            </Link>
            <Link href="/dashboard/reels" className="block text-sm text-primary hover:underline">
              View creator uploads (Reels)
            </Link>
          </div>
        )}
      </Drawer>
    </div>
  );
}
