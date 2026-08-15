"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Pencil, Trash2 } from "lucide-react";
import { getTags, updateTag, deleteTag, type Tag } from "@/services/tags";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function TagsPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; action?: () => void; title: string; message: string }>({ open: false, title: "", message: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTags({ page, limit: 20, search: search || undefined });
      setItems(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      notify("error", "Failed to load tags");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRename = (item: Tag) => {
    const name = window.prompt("New tag name:", item.name);
    if (!name?.trim() || name === item.name) return;
    updateTag(item.id, { name: name.trim() })
      .then(() => { notify("success", "Tag renamed"); fetchData(); })
      .catch(() => notify("error", "Failed to rename tag"));
  };

  const handleDelete = (item: Tag) => {
    setConfirm({
      open: true,
      title: "Delete Tag",
      message: `Remove tag "${item.name}" from all places?`,
      action: () =>
        deleteTag(item.id)
          .then(() => { notify("success", "Tag removed"); fetchData(); })
          .catch(() => notify("error", "Failed to delete tag")),
    });
  };

  const columns: Column<Tag & Record<string, unknown>>[] = [
    { key: "name", header: "Tag", sortable: true },
    { key: "slug", header: "Slug" },
    { key: "usageCount", header: "Usage", sortable: true },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex gap-1">
          <button type="button" onClick={() => handleRename(item as Tag)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil size={16} /></button>
          <button type="button" onClick={() => handleDelete(item as Tag)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
        <p className="mt-1 text-sm text-gray-500">Place tags aggregated from live place data</p>
      </div>
      <div className="mb-4 relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search tags..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500" />
      </div>
      <DataTable columns={columns} data={items as (Tag & Record<string, unknown>)[]} loading={loading} page={page} totalPages={totalPages} totalRecords={totalRecords} hasNext={hasNext} hasPrev={hasPrev} onPageChange={setPage} emptyMessage="No tags found" exportFilename="tags" pageSize={20} />
      <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} onConfirm={() => { confirm.action?.(); setConfirm((p) => ({ ...p, open: false })); }} onCancel={() => setConfirm((p) => ({ ...p, open: false }))} />
    </div>
  );
}
