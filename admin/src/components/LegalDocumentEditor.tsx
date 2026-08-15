"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Save, Eye, EyeOff, UploadCloud, Archive, History, RotateCcw,
  CheckCircle2, Clock, FileEdit, AlertCircle, X,
} from "lucide-react";
import {
  listLegalDocuments, ensureLegalDocument, listLegalVersions, createLegalVersion,
  updateLegalVersion, publishLegalVersion, archiveLegalVersion, rollbackLegalVersion,
  type LegalDocumentType, type LegalVersionDetail,
} from "@/services/legal";
import { useNotification } from "@/components/Notification";
import ConfirmDialog from "@/components/ConfirmDialog";

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  DRAFT: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

interface DraftForm {
  id: string | null;
  title: string;
  content: string;
  effectiveDate: string;
  changeSummary: string;
}

function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM: DraftForm = { id: null, title: "", content: "", effectiveDate: "", changeSummary: "" };

export default function LegalDocumentEditor({
  type,
  label,
  description,
}: {
  type: LegalDocumentType;
  label: string;
  description?: string;
}) {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [versions, setVersions] = useState<LegalVersionDetail[]>([]);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewVersion, setViewVersion] = useState<LegalVersionDetail | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel?: string; variant?: "danger" | "primary"; action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const publishedVersion = useMemo(() => versions.find((v) => v.status === "PUBLISHED") || null, [versions]);
  const draftVersions = useMemo(() => versions.filter((v) => v.status === "DRAFT"), [versions]);
  const historyVersions = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions]
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await listLegalDocuments();
      let doc = docs.find((d) => d.type === type);
      if (!doc) {
        await ensureLegalDocument(type);
        const refreshed = await listLegalDocuments();
        doc = refreshed.find((d) => d.type === type);
      }
      if (!doc) throw new Error("Could not resolve document");
      setDocumentId(doc.id);
      const v = await listLegalVersions(doc.id);
      setVersions(v);
    } catch {
      notify("error", `Failed to load ${label}`);
    } finally {
      setLoading(false);
    }
  }, [type, label, notify]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const startNewDraft = () => {
    setForm({
      id: null,
      title: publishedVersion?.title || label,
      content: publishedVersion?.content || "",
      effectiveDate: "",
      changeSummary: "",
    });
    setIsDraftOpen(true);
    setShowPreview(false);
  };

  const editDraft = (v: LegalVersionDetail) => {
    setForm({
      id: v.id,
      title: v.title,
      content: v.content,
      effectiveDate: toDateTimeLocal(v.effectiveDate),
      changeSummary: v.changeSummary || "",
    });
    setIsDraftOpen(true);
    setShowPreview(false);
  };

  const handleSaveDraft = async (): Promise<LegalVersionDetail | null> => {
    if (!documentId) return null;
    if (!form.title.trim() || !form.content.trim()) {
      notify("error", "Title and content are required");
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        content: form.content,
        effectiveDate: form.effectiveDate ? new Date(form.effectiveDate).toISOString() : null,
        changeSummary: form.changeSummary || null,
      };
      const result = form.id
        ? await updateLegalVersion(form.id, payload)
        : await createLegalVersion(documentId, payload);
      setForm((prev) => ({ ...prev, id: result.id }));
      await fetchAll();
      notify("success", "Draft saved");
      return result;
    } catch (err: any) {
      notify("error", err?.message || "Failed to save draft");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      const saved = await handleSaveDraft();
      const versionId = saved?.id || form.id;
      if (!versionId) return;
      await publishLegalVersion(versionId);
      await fetchAll();
      setIsDraftOpen(false);
      setForm(EMPTY_FORM);
      notify("success", `${label} published`);
    } catch (err: any) {
      notify("error", err?.message || "Failed to publish");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishDirect = (v: LegalVersionDetail) => {
    setConfirmDialog({
      open: true,
      title: "Publish this draft?",
      message: `Version ${v.versionNumber} will go live immediately and replace the current published version.`,
      confirmLabel: "Publish",
      action: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          await publishLegalVersion(v.id);
          await fetchAll();
          notify("success", `${label} published`);
        } catch (err: any) {
          notify("error", err?.message || "Failed to publish");
        }
      },
    });
  };

  const handleArchive = (v: LegalVersionDetail) => {
    setConfirmDialog({
      open: true,
      title: "Archive published version?",
      message: `Version ${v.versionNumber} will be archived. Users will see no published version for ${label} until a new one is published.`,
      confirmLabel: "Archive",
      variant: "danger",
      action: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          await archiveVersion(v.id);
        } catch (err: any) {
          notify("error", err?.message || "Failed to archive");
        }
      },
    });
  };

  async function archiveVersion(id: string) {
    await archiveLegalVersion(id);
    await fetchAll();
    notify("success", "Version archived");
  }

  const handleRollback = (v: LegalVersionDetail, publish: boolean) => {
    setConfirmDialog({
      open: true,
      title: publish ? "Rollback and publish?" : "Rollback as draft?",
      message: publish
        ? `A new version will be created from version ${v.versionNumber}'s content and published immediately.`
        : `A new draft will be created from version ${v.versionNumber}'s content for further editing.`,
      confirmLabel: "Rollback",
      action: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          await rollbackLegalVersion(v.id, publish);
          await fetchAll();
          notify("success", publish ? "Rolled back and published" : "Rollback draft created");
        } catch (err: any) {
          notify("error", err?.message || "Rollback failed");
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{label}</h1>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <History size={16} /> Version History
          </button>
          {!isDraftOpen && (
            <button
              onClick={startNewDraft}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <FileEdit size={16} /> {publishedVersion ? "Edit as New Draft" : "Create Content"}
            </button>
          )}
        </div>
      </div>

      {/* Current live status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Published</p>
          </div>
          {publishedVersion ? (
            <>
              <p className="text-sm font-semibold text-gray-900">{publishedVersion.title}</p>
              <p className="mt-1 text-xs text-gray-500">
                v{publishedVersion.versionNumber} · Published {publishedVersion.publishedAt ? new Date(publishedVersion.publishedAt).toLocaleString() : "—"}
              </p>
              {publishedVersion.effectiveDate && (
                <p className="mt-1 text-xs text-gray-400">Effective: {new Date(publishedVersion.effectiveDate).toLocaleDateString()}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">Nothing published yet — mobile app will show a 404 for this document.</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Clock size={16} className="text-amber-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Drafts pending</p>
          </div>
          {draftVersions.length > 0 ? (
            <div className="space-y-1.5">
              {draftVersions.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <button onClick={() => editDraft(v)} className="font-medium text-blue-600 hover:underline">
                    v{v.versionNumber} — {v.title}
                  </button>
                  <button onClick={() => handlePublishDirect(v)} className="text-xs text-emerald-600 hover:underline">
                    Publish
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No drafts in progress.</p>
          )}
        </div>
      </div>

      {isDraftOpen && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="font-bold text-gray-900">{form.id ? "Edit Draft" : "New Draft"}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview((s) => !s)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} {showPreview ? "Hide Preview" : "Preview"}
              </button>
              <button onClick={() => { setIsDraftOpen(false); setForm(EMPTY_FORM); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Effective Date</label>
                  <input
                    type="datetime-local"
                    value={form.effectiveDate}
                    onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Change Summary</label>
                  <input
                    value={form.changeSummary}
                    onChange={(e) => setForm((p) => ({ ...p, changeSummary: e.target.value }))}
                    placeholder="What changed in this version?"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Content (Markdown)</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  rows={18}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 resize-none"
                  placeholder="# Heading&#10;&#10;Body text with **bold** and - bullet points."
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save size={16} /> Save Draft
                </button>
                <button
                  onClick={handlePublish}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <UploadCloud size={16} /> Save &amp; Publish
                </button>
              </div>
            </div>

            {showPreview && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 overflow-auto max-h-[640px]">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{form.content || "*Nothing to preview yet.*"}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {publishedVersion && !isDraftOpen && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Live Preview</h3>
            <button onClick={() => handleArchive(publishedVersion)} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700">
              <Archive size={13} /> Archive
            </button>
          </div>
          <div className="prose prose-sm max-w-none max-h-96 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
            <ReactMarkdown>{publishedVersion.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="font-bold text-gray-900">Version History</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {historyVersions.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-gray-400">No versions yet.</div>
            )}
            {historyVersions.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-gray-50/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">v{v.versionNumber} — {v.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[v.status]}`}>{v.status}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {v.createdBy?.name ? `By ${v.createdBy.name} · ` : ""}
                    {new Date(v.createdAt).toLocaleString()}
                    {v.changeSummary ? ` · ${v.changeSummary}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button onClick={() => setViewVersion(v)} className="text-gray-500 hover:text-blue-600">View</button>
                  {v.status === "DRAFT" && (
                    <button onClick={() => editDraft(v)} className="text-blue-600 hover:underline">Edit</button>
                  )}
                  {v.status !== "PUBLISHED" && (
                    <>
                      <button onClick={() => handleRollback(v, false)} className="flex items-center gap-1 text-gray-500 hover:text-blue-600">
                        <RotateCcw size={12} /> Rollback as Draft
                      </button>
                      <button onClick={() => handleRollback(v, true)} className="flex items-center gap-1 text-emerald-600 hover:underline">
                        <RotateCcw size={12} /> Rollback &amp; Publish
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{viewVersion.title}</h3>
                <p className="text-xs text-gray-400">
                  v{viewVersion.versionNumber} · <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[viewVersion.status]}`}>{viewVersion.status}</span>
                </p>
              </div>
              <button onClick={() => setViewVersion(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{viewVersion.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant || "primary"}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />

      {!publishedVersion && !isDraftOpen && draftVersions.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle size={16} /> This document has no content yet. The mobile app will show a "not available" state until you publish a version.
        </div>
      )}
    </div>
  );
}
