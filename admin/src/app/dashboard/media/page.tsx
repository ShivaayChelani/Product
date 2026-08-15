"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { getMediaAssets, deleteMediaAsset, type MediaAsset } from "@/services/media";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function MediaLibraryPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; item?: MediaAsset; title: string; message: string }>({ open: false, title: "", message: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMediaAssets({ page, limit: 20, search: search || undefined, type: typeFilter || undefined });
      setItems(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      notify("error", "Failed to load media");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: Column<MediaAsset & Record<string, unknown>>[] = [
    {
      key: "preview",
      header: "Preview",
      render: (item) => (
        <img src={item.thumbnail || item.url} alt="" className="h-10 w-10 rounded object-cover" />
      ),
    },
    { key: "title", header: "Title" },
    { key: "type", header: "Type" },
    { key: "entityName", header: "Entity" },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
      exportValue: (item) => item.status,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (item) => new Date(item.createdAt).toLocaleDateString(),
      exportValue: (item) => item.createdAt,
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <button
          type="button"
          onClick={() => setConfirm({ open: true, item: item as MediaAsset, title: "Delete Media", message: `Delete this ${item.type} asset?` })}
          className="rounded p-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
        <p className="mt-1 text-sm text-gray-500">Place images, user submissions, and reels</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search media..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500" />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm">
          <option value="">All Types</option>
          <option value="PLACE_IMAGE">Place Images</option>
          <option value="USER_PLACE_IMAGE">User Submissions</option>
          <option value="REEL">Reels</option>
        </select>
      </div>
      <DataTable columns={columns} data={items as (MediaAsset & Record<string, unknown>)[]} loading={loading} page={page} totalPages={totalPages} totalRecords={totalRecords} hasNext={hasNext} hasPrev={hasPrev} onPageChange={setPage} emptyMessage="No media found" exportFilename="media-library" pageSize={20} />
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        onConfirm={async () => {
          if (confirm.item) {
            try {
              await deleteMediaAsset(confirm.item.type, confirm.item.id);
              notify("success", "Media deleted");
              fetchData();
            } catch {
              notify("error", "Failed to delete media");
            }
          }
          setConfirm((p) => ({ ...p, open: false }));
        }}
        onCancel={() => setConfirm((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
