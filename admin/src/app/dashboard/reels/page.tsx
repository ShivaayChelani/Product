"use client";

import { useEffect, useState, useCallback } from "react";
import { Trash2, Star, Eye, Heart, Share2, Video, MapPin } from "lucide-react";
import { getReels, deleteReel, toggleFeatureReel, type AdminReel } from "@/services/reels";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useNotification } from "@/components/Notification";

export default function ReelsPage() {
  const { notify } = useNotification();
  const [reels, setReels] = useState<AdminReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: "danger" | "primary";
    action: () => void;
  }>({ open: false, title: "", message: "", variant: "danger", action: () => {} });

  const fetchReels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReels({ page, limit: 15 });
      setReels(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      setReels([]);
      notify("error", "Failed to load reels. Check API connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [page, notify]);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await deleteReel(id);
      notify("success", "Reel deleted successfully");
      fetchReels();
    } catch {
      notify("error", "Failed to delete reel");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleFeature = async (id: string, currentFeatured: boolean) => {
    setActionLoading(id);
    try {
      await toggleFeatureReel(id, !currentFeatured);
      notify("success", currentFeatured ? "Reel unfeatured" : "Reel featured successfully");
      fetchReels();
    } catch {
      notify("error", "Failed to update reel feature status");
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Reel",
      message: "Are you sure you want to delete this reel? This action is permanent and cannot be undone.",
      variant: "danger",
      action: () => handleDelete(id),
    });
  };

  const columns: Column<AdminReel & Record<string, unknown>>[] = [
    {
      key: "thumbnail",
      header: "Video Info",
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.thumbnail ? (
            <div className="relative h-14 w-10 overflow-hidden rounded bg-gray-100 border border-gray-200 shrink-0">
              <img
                src={item.thumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Video size={12} className="text-white" />
              </div>
            </div>
          ) : (
            <div className="flex h-14 w-10 items-center justify-center rounded bg-gray-100 border text-gray-400 shrink-0">
              <Video size={14} />
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900 line-clamp-1">{item.title || "Untitled Reel"}</p>
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 max-w-xs">{item.description || "No caption description."}</p>
          </div>
        </div>
      ),
    },
    {
      key: "creator",
      header: "Creator",
      render: (item) => (
        <div className="flex items-center gap-2">
          {item.creator?.avatar ? (
            <img src={item.creator.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
              {item.creator?.username.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-gray-700">@{item.creator?.username}</span>
        </div>
      ),
    },
    {
      key: "place",
      header: "Linked Place",
      render: (item) => (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <MapPin size={12} className="text-emerald-500" />
          <span className="font-medium">{item.place?.name || "None"}</span>
        </div>
      ),
    },
    {
      key: "stats",
      header: "Engagement Stats",
      render: (item) => (
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1" title="Views">
            <Eye size={12} className="text-gray-400" />
            <span>{item.views}</span>
          </div>
          <div className="flex items-center gap-1" title="Likes">
            <Heart size={12} className="text-red-400 fill-red-400/10" />
            <span>{item.likes}</span>
          </div>
          <div className="flex items-center gap-1" title="Shares">
            <Share2 size={12} className="text-blue-400" />
            <span>{item.shares}</span>
          </div>
        </div>
      ),
    },
    {
      key: "featured",
      header: "Featured",
      render: (item) => (
        <button
          onClick={() => handleToggleFeature(item.id, item.featured)}
          disabled={actionLoading === item.id}
          className={`rounded-full p-1 transition ${
            item.featured ? "text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:bg-gray-100"
          }`}
          title={item.featured ? "Unfeature Reel" : "Feature Reel"}
        >
          <Star size={16} className={item.featured ? "fill-amber-500" : ""} />
        </button>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <button
          onClick={() => confirmDelete(item.id)}
          disabled={actionLoading === item.id}
          className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          title="Delete Reel"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Video className="text-emerald-600" />
            Reels Moderation
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Moderate and feature travel video reels to showcase high-quality travel guides.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={reels as (AdminReel & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={setPage}
        emptyMessage="No reels found in the database"
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
