"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit3, Trash2, Megaphone, X, ToggleLeft, ToggleRight } from "lucide-react";
import {
  listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  type Announcement, type AnnouncementInput, type AnnouncementSeverity, type AnnouncementAudience,
} from "@/services/announcements";
import { useNotification } from "@/components/Notification";
import ConfirmDialog from "@/components/ConfirmDialog";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";

const SEVERITY_STYLES: Record<AnnouncementSeverity, string> = {
  INFO: "bg-blue-100 text-blue-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  WARNING: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const EMPTY_FORM: AnnouncementInput = {
  title: "", body: "", severity: "INFO", audience: "ALL", isActive: true,
  startsAt: null, endsAt: null, linkUrl: null, linkLabel: null,
};

function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AnnouncementsPage() {
  const { notify } = useNotification();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ totalPages: number; hasNext: boolean; hasPrev: boolean; total: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "true" | "false">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; action: () => void }>({
    open: false, title: "", message: "", action: () => {},
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAnnouncements({ page, limit: 15, isActive: statusFilter || undefined });
      setItems(res.data);
      setPagination(res.pagination);
    } catch {
      setItems([]);
      notify("error", "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, notify]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title, body: a.body, severity: a.severity, audience: a.audience, isActive: a.isActive,
      startsAt: toDateTimeLocal(a.startsAt) || null, endsAt: toDateTimeLocal(a.endsAt) || null,
      linkUrl: a.linkUrl, linkLabel: a.linkLabel,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      notify("error", "Title and body are required");
      return;
    }
    setSaving(true);
    try {
      const payload: AnnouncementInput = {
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      if (editingId) {
        await updateAnnouncement(editingId, payload);
        notify("success", "Announcement updated");
      } else {
        await createAnnouncement(payload);
        notify("success", "Announcement created");
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      notify("error", err?.message || "Failed to save announcement");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (a: Announcement) => {
    try {
      await updateAnnouncement(a.id, { isActive: !a.isActive });
      setItems((prev) => prev.map((i) => (i.id === a.id ? { ...i, isActive: !i.isActive } : i)));
      notify("success", a.isActive ? "Announcement deactivated" : "Announcement activated");
    } catch {
      notify("error", "Failed to update status");
    }
  };

  const handleDelete = (a: Announcement) => {
    setConfirmDialog({
      open: true,
      title: "Delete announcement?",
      message: `"${a.title}" will be permanently removed and stop showing to users immediately.`,
      action: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          await deleteAnnouncement(a.id);
          notify("success", "Announcement deleted");
          fetchData();
        } catch {
          notify("error", "Failed to delete");
        }
      },
    });
  };

  const columns: Column<Announcement & Record<string, unknown>>[] = [
    {
      key: "title", header: "Announcement", render: (a) => (
        <div className="max-w-sm">
          <p className="font-medium text-gray-900">{a.title}</p>
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{a.body}</p>
        </div>
      ),
    },
    {
      key: "severity", header: "Severity", render: (a) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[a.severity]}`}>{a.severity}</span>
      ),
    },
    { key: "audience", header: "Audience", render: (a) => <span className="text-xs text-gray-600">{a.audience === "ALL" ? "Everyone" : a.audience.replace("_", " ")}</span> },
    {
      key: "window", header: "Active Window", render: (a) => (
        <span className="text-xs text-gray-500">
          {a.startsAt ? new Date(a.startsAt).toLocaleDateString() : "Now"} → {a.endsAt ? new Date(a.endsAt).toLocaleDateString() : "No end"}
        </span>
      ),
    },
    {
      key: "isActive", header: "Status", render: (a) => (
        <button onClick={() => handleToggleActive(a)} className="flex items-center gap-1.5 text-xs font-medium">
          {a.isActive ? <ToggleRight size={20} className="text-emerald-600" /> : <ToggleLeft size={20} className="text-gray-400" />}
          <span className={a.isActive ? "text-emerald-600" : "text-gray-400"}>{a.isActive ? "Active" : "Inactive"}</span>
        </button>
      ),
    },
    {
      key: "actions", header: "", className: "text-right", render: (a) => (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => openEdit(a)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Edit3 size={13} /> Edit</button>
          <button onClick={() => handleDelete(a)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={13} /> Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="mt-1 text-sm text-gray-500">In-app banners and notices shown to users, vendors, or creators for a defined time window.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus size={16} /> New Announcement
        </button>
      </div>

      <div className="flex gap-2">
        {(["", "true", "false"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setStatusFilter(f); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "" ? "All" : f === "true" ? "Active" : "Inactive"}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={items as (Announcement & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={pagination?.totalPages}
        hasNext={pagination?.hasNext}
        hasPrev={pagination?.hasPrev}
        totalRecords={pagination?.total}
        onPageChange={setPage}
        emptyMessage="No announcements yet"
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Megaphone size={18} className="text-blue-600" /> {editingId ? "Edit" : "New"} Announcement
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Scheduled maintenance tonight"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Body</label>
                <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  rows={3} placeholder="Details shown to the user"
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Severity</label>
                  <select value={form.severity} onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value as AnnouncementSeverity }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                    <option value="INFO">Info</option>
                    <option value="SUCCESS">Success</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Audience</label>
                  <select value={form.audience} onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value as AnnouncementAudience }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                    <option value="ALL">Everyone</option>
                    <option value="USER">Users</option>
                    <option value="VENDOR">Vendors</option>
                    <option value="CONTENT_CREATOR">Creators</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Starts At (optional)</label>
                  <input type="datetime-local" value={form.startsAt || ""} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value || null }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ends At (optional)</label>
                  <input type="datetime-local" value={form.endsAt || ""} onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value || null }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Link URL (optional)</label>
                  <input value={form.linkUrl || ""} onChange={(e) => setForm((p) => ({ ...p, linkUrl: e.target.value || null }))}
                    placeholder="https://..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Link Label (optional)</label>
                  <input value={form.linkLabel || ""} onChange={(e) => setForm((p) => ({ ...p, linkLabel: e.target.value || null }))}
                    placeholder="Learn more" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
                Active (visible to users immediately when within the date window)
              </label>
              <button onClick={handleSave} disabled={saving}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Update Announcement" : "Create Announcement"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
