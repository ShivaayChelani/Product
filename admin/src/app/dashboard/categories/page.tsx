"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Pencil, Trash2 } from "lucide-react";
import { getCategories, updateCategory, deleteCategory, type Category } from "@/services/categories";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function CategoriesPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; item?: Category; action?: () => void; title: string; message: string }>({ open: false, title: "", message: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCategories({ page, limit: 20, search: search || undefined });
      setItems(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      notify("error", "Failed to load categories");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRename = (item: Category) => {
    const name = window.prompt("New category name:", item.name);
    if (!name?.trim() || name === item.name) return;
    updateCategory(item.id, { name: name.trim() })
      .then(() => { notify("success", "Category renamed"); fetchData(); })
      .catch(() => notify("error", "Failed to rename category"));
  };

  const handleDelete = (item: Category) => {
    setConfirm({
      open: true,
      title: "Delete Category",
      message: `Remove "${item.name}" from all places (reassigns to "Other")?`,
      action: () =>
        deleteCategory(item.id)
          .then(() => { notify("success", "Category removed"); fetchData(); })
          .catch(() => notify("error", "Failed to delete category")),
    });
  };

  const columns: Column<Category & Record<string, unknown>>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "slug", header: "Slug" },
    { key: "linkedEntitiesCount", header: "Places", sortable: true },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex gap-1">
          <button type="button" onClick={() => handleRename(item as Category)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="Rename"><Pencil size={16} /></button>
          <button type="button" onClick={() => handleDelete(item as Category)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Derived from live place.category values (not a separate taxonomy CMS). Rename updates places in bulk.
        </p>
      </div>
      <div className="mb-4 relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search categories..."
          className="admin-input pl-10"
          aria-label="Search categories"
        />
      </div>
      <DataTable columns={columns} data={items as (Category & Record<string, unknown>)[]} loading={loading} page={page} totalPages={totalPages} totalRecords={totalRecords} hasNext={hasNext} hasPrev={hasPrev} onPageChange={setPage} emptyMessage="No categories found" exportFilename="categories" pageSize={20} />
      <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} onConfirm={() => { confirm.action?.(); setConfirm((p) => ({ ...p, open: false })); }} onCancel={() => setConfirm((p) => ({ ...p, open: false }))} />
    </div>
  );
}
