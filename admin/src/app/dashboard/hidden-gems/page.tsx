"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Check, X as XIcon, MapPin, Clock, Eye, GitMerge, AlertCircle, Archive } from "lucide-react";
import {
  getHiddenGems,
  approveHiddenGem,
  rejectHiddenGem,
  unpublishHiddenGem,
  getHiddenGemDuplicates,
  mergeHiddenGemContribution,
  type HiddenGemDuplicateCandidate,
} from "@/services/hiddenGems";
import type { HiddenGemSubmission } from "@/services/hiddenGems";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

const formatBestTime = (time: any) => {
  if (!time) return "Not specified";
  if (typeof time === "string") return time;
  if (typeof time === "object") {
    const { from, to, label } = time;
    if (from && to) {
      return label ? `${label} (${from} – ${to})` : `${from} – ${to}`;
    }
    return label || "Not specified";
  }
  return "Not specified";
};

export default function HiddenGemsPage() {
  const { notify } = useNotification();
  const [submissions, setSubmissions] = useState<HiddenGemSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<HiddenGemSubmission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<HiddenGemDuplicateCandidate[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: string;
    action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHiddenGems({
        page,
        limit: 15,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      });
      setSubmissions(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const openDetail = async (sub: HiddenGemSubmission) => {
    setSelected(sub);
    setDetailOpen(true);
    setMergeTarget("");
    setDuplicates([]);
    if (sub.status === "pending") {
      setDuplicatesLoading(true);
      try {
        const dups = await getHiddenGemDuplicates(sub.id);
        setDuplicates(dups);
      } catch {
        setDuplicates([]);
      } finally {
        setDuplicatesLoading(false);
      }
    }
  };

  const handleApprove = (sub: HiddenGemSubmission, force = false) => {
    const dupWarning = duplicates.length > 0 && !force
      ? ` ${duplicates.length} possible duplicate(s) detected. Approve only if this is a genuinely new place.`
      : "";
    setConfirmDialog({
      open: true,
      title: force ? "Approve as New Place" : "Approve Hidden Gem",
      message: `Approve "${sub.placeName}" as a hidden gem?${dupWarning}`,
      variant: "success",
      action: async () => {
        setActionLoading(sub.id);
        try {
          await approveHiddenGem(sub.id, undefined, force);
          notify("success", "Hidden gem approved successfully");
          setDetailOpen(false);
          setSelected(null);
          fetchSubmissions();
        } catch (err: any) {
          const code = err?.response?.data?.code;
          if (code === "DUPLICATE_CANDIDATES") {
            notify("error", "Duplicate places detected — merge or approve as new place explicitly");
          } else {
            notify("error", "Failed to approve hidden gem");
          }
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const handleMerge = (sub: HiddenGemSubmission) => {
    if (!mergeTarget) {
      notify("error", "Select an existing place to merge into");
      return;
    }
    setConfirmDialog({
      open: true,
      title: "Merge Contribution",
      message: `Merge "${sub.placeName}" into the selected existing place? Photos and description will be added; contributor will be rewarded.`,
      variant: "success",
      action: async () => {
        setActionLoading(sub.id);
        try {
          await mergeHiddenGemContribution(sub.id, {
            targetPlaceId: mergeTarget,
            appendDescription: true,
          });
          notify("success", "Contribution merged into existing place");
          setDetailOpen(false);
          setSelected(null);
          fetchSubmissions();
        } catch {
          notify("error", "Failed to merge contribution");
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const handleRejectDuplicate = (sub: HiddenGemSubmission) => {
    setConfirmDialog({
      open: true,
      title: "Reject Duplicate",
      message: `Reject "${sub.placeName}" as a duplicate submission?`,
      variant: "danger",
      action: async () => {
        setActionLoading(sub.id);
        try {
          await rejectHiddenGem(sub.id, "Duplicate of an existing place");
          notify("success", "Duplicate submission rejected");
          setDetailOpen(false);
          setSelected(null);
          fetchSubmissions();
        } catch {
          notify("error", "Failed to reject hidden gem");
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const handleReject = (sub: HiddenGemSubmission) => {
    const reason = prompt("Rejection reason (optional):");
    setConfirmDialog({
      open: true,
      title: "Reject Hidden Gem",
      message: `Reject "${sub.placeName}"?`,
      variant: "danger",
      action: async () => {
        setActionLoading(sub.id);
        try {
          await rejectHiddenGem(sub.id, reason || undefined);
          notify("success", "Hidden gem rejected successfully");
          fetchSubmissions();
        } catch {
          notify("error", "Failed to reject hidden gem");
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const handleUnpublish = (sub: HiddenGemSubmission) => {
    const reason = prompt("Unpublish reason (optional):") || undefined;
    setConfirmDialog({
      open: true,
      title: "Unpublish Hidden Gem",
      message: `Remove "${sub.placeName}" from public discovery? Media and audit records are kept. This does not hard-delete the Place.`,
      variant: "danger",
      action: async () => {
        setActionLoading(sub.id);
        try {
          await unpublishHiddenGem(sub.id, reason);
          notify("success", "Hidden gem unpublished");
          fetchSubmissions();
        } catch {
          notify("error", "Failed to unpublish hidden gem");
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const filtered = submissions;

  const columns: Column<HiddenGemSubmission & Record<string, unknown>>[] = [
    {
      key: "placeName",
      header: "Place Name",
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">{item.placeName}</p>
          <p className="text-xs text-gray-500">{item.city}, {item.state}</p>
        </div>
      ),
    },
    {
      key: "userName",
      header: "Submitted By",
      render: (item) => <span className="text-gray-600">{item.userName}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (item) => <span className="text-sm capitalize text-gray-600">{item.category.replace(/_/g, " ")}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (item) => (
        <span className="text-sm text-gray-500">{new Date(item.submittedAt).toLocaleDateString()}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openDetail(item)}
            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
            title="View Details"
          >
            <Eye size={16} />
          </button>
          {item.status === "pending" && (
            <>
              <button
                onClick={() => handleApprove(item)}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                title="Approve"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => handleReject(item)}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                title="Reject"
              >
                <XIcon size={16} />
              </button>
            </>
          )}
          {item.status === "approved" && (
            <button
              onClick={() => handleUnpublish(item)}
              disabled={actionLoading === item.id}
              className="rounded-lg p-1.5 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              title="Unpublish (deactivate)"
            >
              <Archive size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Hidden Gems</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by place or user..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered as (HiddenGemSubmission & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={setPage}
        emptyMessage="No hidden gems found"
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant as any}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />

      {detailOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-gray-100 pb-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected.placeName}</h2>
                <p className="text-sm text-gray-500">{selected.city}, {selected.state}</p>
              </div>
              <button
                onClick={() => { setDetailOpen(false); setSelected(null); }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <XIcon size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {selected.imageUri && (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
                  <img
                    src={selected.imageUri}
                    alt={selected.placeName}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Description</h4>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Submitted By</h4>
                  <p className="mt-1 text-sm text-gray-700">{selected.userName}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Category</h4>
                  <p className="mt-1 text-sm capitalize text-gray-700">{selected.category.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Best Time to Visit</h4>
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-700">
                    <Clock size={14} className="text-emerald-500" />
                    {formatBestTime(selected.bestTimeToVisit)}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Coordinates</h4>
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-700">
                    <MapPin size={14} className="text-rose-500" />
                    {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
                  </p>
                </div>
              </div>

              {selected.status === "pending" && (
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                      <AlertCircle size={14} />
                      Duplicate Check
                    </h4>
                    {duplicatesLoading ? (
                      <p className="mt-2 text-sm text-gray-500">Checking place database...</p>
                    ) : duplicates.length === 0 ? (
                      <p className="mt-2 text-sm text-emerald-600">No matching places found — safe to approve as new.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-amber-700">
                          {duplicates.length} possible duplicate(s) found in the place database:
                        </p>
                        {duplicates.map((dup) => (
                          <label
                            key={dup.placeId}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                              mergeTarget === dup.placeId
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="mergeTarget"
                              value={dup.placeId}
                              checked={mergeTarget === dup.placeId}
                              onChange={() => setMergeTarget(dup.placeId)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900">{dup.place.name}</p>
                              <p className="text-xs text-gray-500">
                                {dup.place.state} · {dup.distanceM}m away · {Math.round(dup.nameScore * 100)}% name match
                              </p>
                              {dup.place.description && (
                                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{dup.place.description}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selected.status !== "pending" && (
                <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Status</h4>
                    <div className="mt-1">
                      <StatusBadge status={selected.status} />
                    </div>
                  </div>
                  {selected.rejectionReason && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Rejection Reason</h4>
                      <p className="mt-1 text-sm text-red-600 font-medium">{selected.rejectionReason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => { setDetailOpen(false); setSelected(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {selected.status === "pending" && duplicates.length > 0 && (
                <>
                  <button
                    onClick={() => handleRejectDuplicate(selected)}
                    className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                  >
                    Reject Duplicate
                  </button>
                  <button
                    onClick={() => handleMerge(selected)}
                    disabled={!mergeTarget}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <GitMerge size={14} />
                    Merge into Existing
                  </button>
                  <button
                    onClick={() => handleApprove(selected, true)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Approve as New Place
                  </button>
                </>
              )}
              {selected.status === "pending" && duplicates.length === 0 && !duplicatesLoading && (
                <>
                  <button
                    onClick={() => handleReject(selected)}
                    className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(selected)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                </>
              )}
              {selected.status === "approved" && (
                <button
                  onClick={() => handleUnpublish(selected)}
                  className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  Unpublish
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
