"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Bell, Send, Users, MapPin, Tag, FileText, Plus, Trash2,
  Edit3, RefreshCw, CheckCircle, AlertCircle, Eye,
} from "lucide-react";
import {
  getAdminNotificationList, sendNotification, sendToRole, sendToCity,
  sendToCategory, getTemplates, createTemplate, updateTemplate,
  deleteTemplate, sendFromTemplate
} from "@/services/notificationsAdmin";
import ConfirmDialog from "@/components/ConfirmDialog";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import type { PaginatedResponse } from "@/types";

type Tab = "send" | "templates" | "history";

interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body?: string;
  type?: string;
  variables?: string[];
}

interface NotificationHistoryRow {
  id: string;
  title: string;
  body?: string;
  type?: string;
  createdAt: string;
  recipientId?: string;
  role?: string;
  city?: string;
  category?: string;
  recipients?: unknown[];
  readAt?: string;
  user?: { name?: string; email?: string };
}

interface TempForm {
  name: string;
  title: string;
  body: string;
  type: string;
  variables: string;
}

interface SendForm {
  targetType: "user" | "role" | "city" | "category";
  userId: string;
  title: string;
  body: string;
  type: string;
  role: string;
  city: string;
  category: string;
  templateId: string;
  templateTarget: { type: string; value: string };
  templateVars: string;
}

const HISTORY_PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("send");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [sendForm, setSendForm] = useState<SendForm>({
    targetType: "user", userId: "", title: "", body: "", type: "admin",
    role: "USER", city: "", category: "", templateId: "",
    templateTarget: { type: "role", value: "USER" }, templateVars: "",
  });
  const [tempForm, setTempForm] = useState<TempForm>({ name: "", title: "", body: "", type: "admin", variables: "" });
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [history, setHistory] = useState<NotificationHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [detailNotification, setDetailNotification] = useState<NotificationHistoryRow | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasNext, setHistoryHasNext] = useState(false);
  const [historyHasPrev, setHistoryHasPrev] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const t = await getTemplates();
      setTemplates(t as NotificationTemplate[]);
    } catch {
      setTemplates([]);
      setError("Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await getAdminNotificationList({ page: historyPage, limit: HISTORY_PAGE_SIZE });
      const body = res as PaginatedResponse<NotificationHistoryRow>;
      setHistory(body.data || []);
      if (body.pagination) {
        setHistoryTotalPages(body.pagination.totalPages);
        setHistoryTotal(body.pagination.total);
        setHistoryHasNext(body.pagination.hasNext);
        setHistoryHasPrev(body.pagination.hasPrev);
      }
    } catch {
      setHistory([]);
      setHistoryError("Failed to load notification history");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  useEffect(() => {
    if (tab === "templates") void fetchTemplates();
  }, [tab, fetchTemplates]);

  useEffect(() => {
    if (tab === "history") void fetchHistory();
  }, [tab, fetchHistory]);

  useEffect(() => {
    void getTemplates().then((t) => setTemplates(t as NotificationTemplate[])).catch(() => {});
  }, []);

  const handleSend = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      if (sendForm.targetType === "user") {
        await sendNotification({ userId: sendForm.userId, title: sendForm.title, body: sendForm.body, type: sendForm.type });
      } else if (sendForm.targetType === "role") {
        await sendToRole({ role: sendForm.role, title: sendForm.title, body: sendForm.body, type: sendForm.type });
      } else if (sendForm.targetType === "city") {
        await sendToCity({ city: sendForm.city, title: sendForm.title, body: sendForm.body, type: sendForm.type });
      } else {
        await sendToCategory({ category: sendForm.category, title: sendForm.title, body: sendForm.body, type: sendForm.type });
      }
      setSuccess("Notification sent successfully!");
      setSendForm((prev) => ({ ...prev, title: "", body: "" }));
    } catch {
      setError("Failed to send notification");
    } finally { setLoading(false); }
  };

  const handleSendFromTemplate = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      let variables: Record<string, string> = {};
      try { variables = JSON.parse(sendForm.templateVars || "{}"); } catch { /* keep defaults */ }
      await sendFromTemplate({
        templateId: sendForm.templateId,
        target: sendForm.templateTarget,
        variables,
      });
      setSuccess("Template notification sent!");
    } catch {
      setError("Failed to send template notification");
    } finally { setLoading(false); }
  };

  const handleSaveTemplate = async () => {
    setLoading(true); setError("");
    try {
      const vars = tempForm.variables ? tempForm.variables.split(",").map((v) => v.trim()).filter(Boolean) : [];
      if (editingTemplate) {
        await updateTemplate(editingTemplate, {
          name: tempForm.name, title: tempForm.title, body: tempForm.body,
          type: tempForm.type, variables: vars,
        });
      } else {
        await createTemplate({
          name: tempForm.name, title: tempForm.title, body: tempForm.body,
          type: tempForm.type, variables: vars,
        });
      }
      setTemplateDrawerOpen(false);
      setEditingTemplate(null);
      setTempForm({ name: "", title: "", body: "", type: "admin", variables: "" });
      void fetchTemplates();
      setSuccess("Template saved!");
    } catch {
      setError("Failed to save template");
    } finally { setLoading(false); }
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTempForm({ name: "", title: "", body: "", type: "admin", variables: "" });
    setTemplateDrawerOpen(true);
  };

  const handleEditTemplate = (t: NotificationTemplate) => {
    setEditingTemplate(t.id);
    setTempForm({
      name: t.name, title: t.title, body: t.body || "", type: t.type || "admin",
      variables: (t.variables || []).join(", "),
    });
    setTemplateDrawerOpen(true);
  };

  const handleDeleteTemplate = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Template",
      message: "Delete this template?",
      action: async () => {
        try {
          await deleteTemplate(id);
          void fetchTemplates();
          setSuccess("Template deleted");
        } catch {
          setError("Failed to delete");
        }
        setConfirmDialog((p) => ({ ...p, open: false }));
      },
    });
  };

  const historyColumns: Column<NotificationHistoryRow & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "title",
        header: "Title",
        render: (n) => (
          <button
            type="button"
            onClick={() => setDetailNotification(n as NotificationHistoryRow)}
            className="text-left font-medium hover:text-primary hover:underline"
          >
            {n.title}
          </button>
        ),
        exportValue: (n) => n.title,
      },
      {
        key: "body",
        header: "Body",
        render: (n) => <span className="max-w-xs truncate block text-sm text-muted-foreground">{n.body || "—"}</span>,
        exportValue: (n) => n.body,
      },
      {
        key: "target",
        header: "Target",
        render: (n) =>
          Array.isArray(n.recipients)
            ? `${n.recipients.length} users`
            : n.recipientId || n.role || n.city || n.category || n.user?.email || "—",
      },
      {
        key: "type",
        header: "Type",
        render: (n) => (n.type ? <span className="capitalize">{n.type}</span> : "—"),
        exportValue: (n) => n.type,
      },
      {
        key: "createdAt",
        header: "Sent",
        render: (n) => new Date(n.createdAt).toLocaleString(),
        exportValue: (n) => n.createdAt,
      },
      {
        key: "actions",
        header: "",
        render: (n) => (
          <button
            type="button"
            onClick={() => setDetailNotification(n as NotificationHistoryRow)}
            className="rounded p-1.5 text-primary hover:bg-muted"
            aria-label="View notification"
          >
            <Eye size={16} />
          </button>
        ),
      },
    ],
    [],
  );

  const tabs: { key: Tab; label: string; icon: typeof Send }[] = [
    { key: "send", label: "Send", icon: Send },
    { key: "templates", label: "Templates", icon: FileText },
    { key: "history", label: "History", icon: Eye },
  ];

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      <PageHeader
        title="Notifications"
        description="Send push notifications, manage templates, and review delivery history."
        icon={Bell}
        actions={
          <button type="button" onClick={() => { if (tab === "history") void fetchHistory(); if (tab === "templates") void fetchTemplates(); }} className="admin-btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          <CheckCircle size={16} /> {success}
          <button type="button" onClick={() => setSuccess("")} className="ml-auto" aria-label="Dismiss">×</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError("")} className="ml-auto" aria-label="Dismiss">×</button>
        </div>
      )}

      {tab === "send" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold">Quick Send</h2>
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Target</span>
                <div className="flex flex-wrap gap-2">
                  {(["user", "role", "city", "category"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSendForm((prev) => ({ ...prev, targetType: t }))}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        sendForm.targetType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {t === "user" ? <Bell size={13} /> : t === "role" ? <Users size={13} /> : t === "city" ? <MapPin size={13} /> : <Tag size={13} />}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {sendForm.targetType === "user" && (
                <div>
                  <label htmlFor="send-user-id" className="mb-1.5 block text-xs font-medium">User ID</label>
                  <input id="send-user-id" value={sendForm.userId} onChange={(e) => setSendForm((prev) => ({ ...prev, userId: e.target.value }))} className="admin-input" placeholder="Enter user ID" />
                </div>
              )}
              {sendForm.targetType === "role" && (
                <div>
                  <label htmlFor="send-role" className="mb-1.5 block text-xs font-medium">Role</label>
                  <select id="send-role" value={sendForm.role} onChange={(e) => setSendForm((prev) => ({ ...prev, role: e.target.value }))} className="admin-input">
                    <option value="USER">User</option>
                    <option value="TOURIST">Tourist</option>
                    <option value="PARTNER">Vendor</option>
                    <option value="CREATOR">Creator</option>
                    <option value="ADMIN">Admin</option>
                    <option value="ALL">All Users</option>
                  </select>
                </div>
              )}
              {sendForm.targetType === "city" && (
                <div>
                  <label htmlFor="send-city" className="mb-1.5 block text-xs font-medium">City</label>
                  <input id="send-city" value={sendForm.city} onChange={(e) => setSendForm((prev) => ({ ...prev, city: e.target.value }))} className="admin-input" placeholder="Enter city name" />
                </div>
              )}
              {sendForm.targetType === "category" && (
                <div>
                  <label htmlFor="send-category" className="mb-1.5 block text-xs font-medium">Category</label>
                  <input id="send-category" value={sendForm.category} onChange={(e) => setSendForm((prev) => ({ ...prev, category: e.target.value }))} className="admin-input" placeholder="Enter category" />
                </div>
              )}

              <div>
                <label htmlFor="send-title" className="mb-1.5 block text-xs font-medium">Title</label>
                <input id="send-title" value={sendForm.title} onChange={(e) => setSendForm((prev) => ({ ...prev, title: e.target.value }))} className="admin-input" placeholder="Notification title" />
              </div>
              <div>
                <label htmlFor="send-body" className="mb-1.5 block text-xs font-medium">Body</label>
                <textarea id="send-body" value={sendForm.body} onChange={(e) => setSendForm((prev) => ({ ...prev, body: e.target.value }))} rows={4} className="admin-input resize-none" placeholder="Notification body" />
              </div>
              <div>
                <label htmlFor="send-type" className="mb-1.5 block text-xs font-medium">Type</label>
                <select id="send-type" value={sendForm.type} onChange={(e) => setSendForm((prev) => ({ ...prev, type: e.target.value }))} className="admin-input">
                  <option value="admin">Admin</option>
                  <option value="promo">Promo</option>
                  <option value="alert">Alert</option>
                  <option value="update">Update</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading || !sendForm.title || (sendForm.targetType === "user" && !sendForm.userId)}
                className="admin-btn-primary w-full disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send Notification"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold">Send from Template</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="template-select" className="mb-1.5 block text-xs font-medium">Template</label>
                <select id="template-select" value={sendForm.templateId} onChange={(e) => setSendForm((prev) => ({ ...prev, templateId: e.target.value }))} className="admin-input">
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {t.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="template-target-type" className="mb-1.5 block text-xs font-medium">Target Type</label>
                <select id="template-target-type" value={sendForm.templateTarget.type} onChange={(e) => setSendForm((prev) => ({ ...prev, templateTarget: { ...prev.templateTarget, type: e.target.value } }))} className="admin-input">
                  <option value="role">Role</option>
                  <option value="city">City</option>
                  <option value="category">Category</option>
                  <option value="all">All Users</option>
                </select>
              </div>
              {sendForm.templateTarget.type !== "all" && (
                <div>
                  <label htmlFor="template-target-value" className="mb-1.5 block text-xs font-medium">Target Value</label>
                  <input id="template-target-value" value={sendForm.templateTarget.value} onChange={(e) => setSendForm((prev) => ({ ...prev, templateTarget: { ...prev.templateTarget, value: e.target.value } }))} className="admin-input" placeholder="Role, city, or category" />
                </div>
              )}
              <div>
                <label htmlFor="template-vars" className="mb-1.5 block text-xs font-medium">Variables (JSON)</label>
                <textarea id="template-vars" value={sendForm.templateVars} onChange={(e) => setSendForm((prev) => ({ ...prev, templateVars: e.target.value }))} rows={3} className="admin-input resize-none font-mono" placeholder='{"name": "User"}' />
              </div>
              <button type="button" onClick={() => void handleSendFromTemplate()} disabled={loading || !sendForm.templateId} className="admin-btn-primary w-full disabled:opacity-50">
                Send from Template
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === "templates" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{templates.length} templates</p>
            <button type="button" onClick={openCreateTemplate} className="admin-btn-primary">
              <Plus size={16} /> New Template
            </button>
          </div>

          {templatesLoading ? (
            <p className="text-sm text-muted-foreground">Loading templates…</p>
          ) : templates.length === 0 ? (
            <EmptyState icon={FileText} title="No templates yet" description="Create a template to reuse notification content." action={<button type="button" onClick={openCreateTemplate} className="admin-btn-primary">Create Template</button>} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs capitalize text-primary">{t.type}</span>
                  </div>
                  <p className="mb-1 text-sm font-medium">{t.title}</p>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{t.body || "No body"}</p>
                  {t.variables && t.variables.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {t.variables.map((v) => (
                        <span key={v} className="rounded bg-muted px-2 py-0.5 text-xs">{`{${v}}`}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 border-t border-border pt-2">
                    <button type="button" onClick={() => handleEditTemplate(t)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                      <Edit3 size={13} /> Edit
                    </button>
                    <button type="button" onClick={() => handleDeleteTemplate(t.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div>
          {historyError && !historyLoading ? (
            <EmptyState icon={AlertCircle} title="Could not load history" description={historyError} action={<button type="button" onClick={() => void fetchHistory()} className="admin-btn-primary">Retry</button>} />
          ) : !historyLoading && history.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications sent yet" description="Sent notifications will appear here." />
          ) : (
            <DataTable
              columns={historyColumns}
              data={history as (NotificationHistoryRow & Record<string, unknown>)[]}
              loading={historyLoading}
              page={historyPage}
              totalPages={historyTotalPages}
              totalRecords={historyTotal}
              hasNext={historyHasNext}
              hasPrev={historyHasPrev}
              onPageChange={setHistoryPage}
              emptyMessage="No notifications found"
              exportFilename="notifications-history"
              showFirstLast
              pageSize={HISTORY_PAGE_SIZE}
            />
          )}
        </div>
      )}

      <Drawer
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        title={editingTemplate ? "Edit Template" : "Create Template"}
        width="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="temp-name" className="mb-1 block text-xs font-medium">Name</label>
            <input id="temp-name" value={tempForm.name} onChange={(e) => setTempForm((prev) => ({ ...prev, name: e.target.value }))} className="admin-input" placeholder="Template name" />
          </div>
          <div>
            <label htmlFor="temp-title" className="mb-1 block text-xs font-medium">Title</label>
            <input id="temp-title" value={tempForm.title} onChange={(e) => setTempForm((prev) => ({ ...prev, title: e.target.value }))} className="admin-input" placeholder="Notification title" />
          </div>
          <div>
            <label htmlFor="temp-body" className="mb-1 block text-xs font-medium">Body</label>
            <textarea id="temp-body" value={tempForm.body} onChange={(e) => setTempForm((prev) => ({ ...prev, body: e.target.value }))} rows={3} className="admin-input resize-none" placeholder="Use {variable} placeholders" />
          </div>
          <div>
            <label htmlFor="temp-type" className="mb-1 block text-xs font-medium">Type</label>
            <select id="temp-type" value={tempForm.type} onChange={(e) => setTempForm((prev) => ({ ...prev, type: e.target.value }))} className="admin-input">
              <option value="admin">Admin</option>
              <option value="promo">Promo</option>
              <option value="alert">Alert</option>
              <option value="update">Update</option>
            </select>
          </div>
          <div>
            <label htmlFor="temp-vars" className="mb-1 block text-xs font-medium">Variables (comma-separated)</label>
            <input id="temp-vars" value={tempForm.variables} onChange={(e) => setTempForm((prev) => ({ ...prev, variables: e.target.value }))} className="admin-input" placeholder="name, code, discount" />
          </div>
          <button type="button" onClick={() => void handleSaveTemplate()} disabled={loading || !tempForm.name || !tempForm.title} className="admin-btn-primary w-full disabled:opacity-50">
            {editingTemplate ? "Update" : "Create"} Template
          </button>
        </div>
      </Drawer>

      <Drawer open={!!detailNotification} onClose={() => setDetailNotification(null)} title="Notification Details" width="max-w-lg">
        {detailNotification && (
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Title</dt><dd className="font-medium">{detailNotification.title}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Body</dt><dd>{detailNotification.body || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="capitalize">{detailNotification.type || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Sent</dt><dd>{new Date(detailNotification.createdAt).toLocaleString()}</dd></div>
            {detailNotification.readAt && <div><dt className="text-xs text-muted-foreground">Read</dt><dd>{new Date(detailNotification.readAt).toLocaleString()}</dd></div>}
          </dl>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
