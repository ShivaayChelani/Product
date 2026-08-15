"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Search, Edit3, Trash2, Eye, Power, PowerOff,
  MapPin, Trophy, Calendar, Users, CheckCircle, AlertCircle,
  Puzzle, Clock, Image as ImageIcon, ChevronLeft, ChevronRight,
  ThumbsUp, ThumbsDown, MessageSquare, Star
} from "lucide-react";
import {
  getRiddles, createRiddle, updateRiddle, deleteRiddle,
  getRiddleSubmissions, getAllPendingSubmissions,
  approveSubmission, rejectSubmission,
  type Riddle, type RiddleSubmission
} from "@/services/riddles";
import { getApiErrorMessage } from "@/services/client";
import ConfirmDialog from "@/components/ConfirmDialog";

type Tab = "riddles" | "pending";
type RiddleListParams = NonNullable<Parameters<typeof getRiddles>[0]>;
type RiddleWritePayload = Parameters<typeof createRiddle>[0];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

export default function RiddleHuntAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("riddles");

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Riddle Hunt</h1>
        <p className="mt-1 text-sm text-gray-500">Manage the official PalSafar location riddle game and photo submissions</p>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {[
          { key: "riddles", label: "Riddles", icon: Puzzle },
          { key: "pending", label: "Pending Reviews", icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === key ? "bg-white text-purple-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "riddles" && <RiddlesTab />}
      {activeTab === "pending" && <PendingReviewsTab />}
    </div>
  );
}

function RiddlesTab() {
  const [riddles, setRiddles] = useState<Riddle[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showSubmissions, setShowSubmissions] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<RiddleSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subPage, setSubPage] = useState(1);
  const [subTotalPages, setSubTotalPages] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });
  const [rejectModal, setRejectModal] = useState<{ open: boolean; submissionId: string }>({ open: false, submissionId: "" });
  const [rejectComment, setRejectComment] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const emptyForm = {
    title: "", clue: "", hintImage: "", correctPlaceName: "",
    correctLat: "", correctLng: "", city: "", rewardPoints: "100",
    startsAt: "", endsAt: "",
  };
  const [form, setForm] = useState(emptyForm);

  const fetchRiddles = useCallback(async () => {
    setLoading(true);
    try {
      const params: RiddleListParams = { page, limit: 20 };
      if (filterActive) params.isActive = filterActive;
      if (cityFilter) params.city = cityFilter;
      if (searchQuery) params.search = searchQuery;
      const res = await getRiddles(params);
      setRiddles(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch { setRiddles([]); } finally { setLoading(false); }
  }, [page, filterActive, cityFilter, searchQuery]);

  useEffect(() => { fetchRiddles(); }, [fetchRiddles]);

  const fetchSubmissions = async (riddleId: string, p: number = 1) => {
    setLoadingSubs(true);
    try {
      const res = await getRiddleSubmissions(riddleId, { page: p, limit: 10 });
      setSubmissions(res.data);
      setSubTotalPages(res.pagination.totalPages);
      setSubPage(p);
    } catch { setSubmissions([]); } finally { setLoadingSubs(false); }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (r: Riddle) => {
    setEditingId(r.id);
    setForm({
      title: r.title, clue: r.clue, hintImage: r.hintImage || "",
      correctPlaceName: r.correctPlaceName, correctLat: String(r.correctLat ?? ""),
      correctLng: String(r.correctLng ?? ""), city: r.city,
      rewardPoints: String(r.rewardPoints),
      startsAt: r.startsAt.slice(0, 16), endsAt: r.endsAt ? r.endsAt.slice(0, 16) : "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.clue || !form.correctPlaceName || !form.city || !form.startsAt) {
      setError("Title, clue, correct place, city, and start date are required.");
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload: RiddleWritePayload = {
        title: form.title, clue: form.clue,
        hintImage: form.hintImage || undefined,
        correctPlaceName: form.correctPlaceName,
        correctLat: form.correctLat ? parseFloat(form.correctLat) : undefined,
        correctLng: form.correctLng ? parseFloat(form.correctLng) : undefined,
        city: form.city, rewardPoints: parseInt(form.rewardPoints) || 100,
        startsAt: form.startsAt, endsAt: form.endsAt || undefined,
      };
      if (editingId) {
        await updateRiddle(editingId, payload);
      } else {
        await createRiddle(payload);
      }
      setShowModal(false);
      fetchRiddles();
      setSuccess(editingId ? "Riddle updated!" : "Riddle created!");
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to save riddle"));
    } finally { setSaving(false); }
  };

  const handleToggle = async (r: Riddle) => {
    try {
      await updateRiddle(r.id, { isActive: !r.isActive });
      fetchRiddles();
      setSuccess(r.isActive ? "Riddle deactivated" : "Riddle activated");
    } catch { setError("Failed to toggle"); }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true, title: "Delete Riddle", message: "Delete this riddle and all its submissions?",
      action: async () => {
        try { await deleteRiddle(id); fetchRiddles(); setSuccess("Riddle deleted"); }
        catch { setError("Failed to delete"); }
        setConfirmDialog((p) => ({ ...p, open: false }));
      },
    });
  };

  const handleApprove = async (submissionId: string) => {
    setActionLoading(submissionId);
    try {
      await approveSubmission(submissionId);
      setSuccess("Submission approved — 100 PalPoints awarded!");
      if (showSubmissions) fetchSubmissions(showSubmissions, subPage);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to approve"));
    } finally { setActionLoading(null); }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) return;
    setActionLoading(rejectModal.submissionId);
    try {
      await rejectSubmission(rejectModal.submissionId, rejectComment.trim());
      setSuccess("Submission rejected. User notified with correct location.");
      setRejectModal({ open: false, submissionId: "" });
      setRejectComment("");
      if (showSubmissions) fetchSubmissions(showSubmissions, subPage);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to reject"));
    } finally { setActionLoading(null); }
  };

  return (
    <>
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={16} /> {success}
          <button onClick={() => setSuccess("")} className="ml-auto">&times;</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError("")} className="ml-auto">&times;</button>
        </div>
      )}

      {/* Info banner */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 flex items-start gap-3">
        <Puzzle size={18} className="text-purple-500 mt-0.5 shrink-0" />
        <div className="text-sm text-purple-800">
          <p className="font-semibold mb-1">How Riddle Hunt Works</p>
          <p>The app detects the user&apos;s city via GPS and shows them the active riddle for that city. The user must physically visit the hinted place, take a photo, and submit. You review the submission and approve (awarding {" "}<strong>100 PalPoints</strong>) or reject with a comment explaining the correct location.</p>
        </div>
      </div>

      {/* Filters & create */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search riddles…" className="rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm outline-none focus:border-purple-500 w-40" />
          </div>
          <input value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
            placeholder="Filter by city…" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-purple-500 w-36" />
          <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-purple-500">
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-700">
          <Plus size={16} /> New Riddle
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        </div>
      ) : riddles.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Puzzle size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No riddles yet. Create the first Riddle Hunt challenge!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {riddles.map((r) => (
            <div key={r.id} className={`bg-white rounded-xl border shadow-sm p-5 ${r.isActive ? "border-purple-100" : "border-gray-200 bg-gray-50"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${r.isActive ? "bg-purple-100 text-purple-600" : "bg-gray-200 text-gray-500"}`}>
                    <Puzzle size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{r.title}</h3>
                    <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={10} />{r.city}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.isActive ? "bg-purple-100 text-purple-700" : "bg-gray-200 text-gray-500"}`}>
                  {r.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <p className="text-xs text-gray-600 mb-3 line-clamp-2 italic">&quot;{r.clue}&quot;</p>

              <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-500">
                <div className="flex items-center gap-1"><Trophy size={12} className="text-purple-500" /> {r.rewardPoints} pts</div>
                <div className="flex items-center gap-1"><Calendar size={12} /> {new Date(r.startsAt).toLocaleDateString()}{r.endsAt && <> — {new Date(r.endsAt).toLocaleDateString()}</>}</div>
                <div className="flex items-center gap-1"><Users size={12} /> {r._count.submissions} submissions</div>
                {r.hintImage && <div className="flex items-center gap-1"><ImageIcon size={12} /> Has image hint</div>}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <button onClick={() => { setShowSubmissions(r.id); fetchSubmissions(r.id); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600">
                  <Eye size={13} /> View Submissions
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(r)} className="p-1.5 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-gray-100">
                    {r.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                  <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!hasPrev} className="text-sm text-gray-500 hover:text-purple-600 disabled:opacity-40">Previous</button>
          <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={!hasNext} className="text-sm text-gray-500 hover:text-purple-600 disabled:opacity-40">Next</button>
        </div>
      )}

      {/* Riddle Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{editingId ? "Edit" : "Create"} Riddle</h3>
                <p className="text-xs text-gray-500 mt-0.5">The correct place name is hidden from users — only shown on rejection.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Title *</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. The Sleeping Giant of Jaipur" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Riddle Clue * <span className="text-gray-400 font-normal">(shown to user)</span></label>
                <textarea value={form.clue} onChange={(e) => setForm((p) => ({ ...p, clue: e.target.value }))}
                  placeholder="I was built in the 16th century. My walls rise like red mountains…" rows={4}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">City * <span className="text-gray-400 font-normal">(for GPS matching)</span></label>
                  <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    placeholder="Jaipur" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Reward Points</label>
                  <input type="number" value={form.rewardPoints} onChange={(e) => setForm((p) => ({ ...p, rewardPoints: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Correct Place Name * <span className="text-gray-400 font-normal">(admin only — shown to user on rejection)</span></label>
                <input value={form.correctPlaceName} onChange={(e) => setForm((p) => ({ ...p, correctPlaceName: e.target.value }))}
                  placeholder="Amer Fort, Jaipur" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Latitude (optional)</label>
                  <input type="number" step="any" value={form.correctLat} onChange={(e) => setForm((p) => ({ ...p, correctLat: e.target.value }))}
                    placeholder="26.9855" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Longitude (optional)</label>
                  <input type="number" step="any" value={form.correctLng} onChange={(e) => setForm((p) => ({ ...p, correctLng: e.target.value }))}
                    placeholder="75.8513" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Hint Image URL (optional)</label>
                <input value={form.hintImage} onChange={(e) => setForm((p) => ({ ...p, hintImage: e.target.value }))}
                  placeholder="https://…" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Start Date *</label>
                  <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">End Date (optional)</label>
                  <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-purple-500" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving}
                className="w-full bg-purple-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" /> : (editingId ? "Update" : "Create") + " Riddle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submissions modal */}
      {showSubmissions && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Riddle Submissions</h3>
              <button onClick={() => setShowSubmissions(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            {loadingSubs ? (
              <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-3 border-purple-600 border-t-transparent" /></div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-8 text-gray-400"><Users size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No submissions yet</p></div>
            ) : (
              <div className="space-y-4">
                {submissions.map((s) => (
                  <SubmissionCard
                    key={s.id} submission={s}
                    onApprove={() => handleApprove(s.id)}
                    onReject={() => { setRejectModal({ open: true, submissionId: s.id }); }}
                    loading={actionLoading === s.id}
                  />
                ))}
              </div>
            )}
            {subTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button onClick={() => fetchSubmissions(showSubmissions, subPage - 1)} disabled={subPage === 1}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 disabled:opacity-40"><ChevronLeft size={14} /> Prev</button>
                <span className="text-xs text-gray-400">Page {subPage} of {subTotalPages}</span>
                <button onClick={() => fetchSubmissions(showSubmissions, subPage + 1)} disabled={subPage >= subTotalPages}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 disabled:opacity-40">Next <ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject comment modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Submission</h3>
            <p className="text-sm text-gray-500 mb-4">Write the correct location — this will be sent to the user as a notification so they know where the place actually was.</p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="e.g. The correct place is Hawa Mahal, Badi Choupad, Jaipur — the Palace of Winds built in 1799"
              rows={4} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-red-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setRejectModal({ open: false, submissionId: "" }); setRejectComment(""); }}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleReject} disabled={!rejectComment.trim() || actionLoading === rejectModal.submissionId}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {actionLoading === rejectModal.submissionId ? "Rejecting…" : "Reject & Notify User"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message}
        onConfirm={confirmDialog.action} onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING REVIEWS TAB — All pending across all riddles
// ═══════════════════════════════════════════════════════════════════════════════
function PendingReviewsTab() {
  const [submissions, setSubmissions] = useState<RiddleSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; submissionId: string }>({ open: false, submissionId: "" });
  const [rejectComment, setRejectComment] = useState("");

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllPendingSubmissions({ page, limit: 15 });
      setSubmissions(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch { setSubmissions([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = async (submissionId: string) => {
    setActionLoading(submissionId);
    try {
      await approveSubmission(submissionId);
      setSuccess("Approved! 100 PalPoints awarded to user.");
      fetchPending();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to approve"));
    } finally { setActionLoading(null); }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) return;
    setActionLoading(rejectModal.submissionId);
    try {
      await rejectSubmission(rejectModal.submissionId, rejectComment.trim());
      setSuccess("Rejected. User notified with the correct location.");
      setRejectModal({ open: false, submissionId: "" });
      setRejectComment("");
      fetchPending();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to reject"));
    } finally { setActionLoading(null); }
  };

  return (
    <>
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={16} /> {success}
          <button onClick={() => setSuccess("")} className="ml-auto">&times;</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError("")} className="ml-auto">&times;</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Clock size={16} className="text-amber-500" />
          Pending Submissions ({submissions.length})
        </h2>
        <button onClick={fetchPending} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <CheckCircle size={48} className="mx-auto mb-3 opacity-40 text-emerald-400" />
          <p className="text-sm font-medium text-gray-500">All caught up!</p>
          <p className="text-xs mt-1">No pending submissions to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <SubmissionCard
              key={s.id} submission={s}
              showRiddleInfo
              onApprove={() => handleApprove(s.id)}
              onReject={() => setRejectModal({ open: true, submissionId: s.id })}
              loading={actionLoading === s.id}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!hasPrev}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={!hasNext}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      )}

      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Submission</h3>
            <p className="text-sm text-gray-500 mb-4">Enter the correct place name / location. This will be sent to the user as a push notification.</p>
            <textarea
              value={rejectComment} onChange={(e) => setRejectComment(e.target.value)}
              placeholder="The correct answer is Hawa Mahal — the Palace of Winds, Jaipur…"
              rows={4} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-red-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setRejectModal({ open: false, submissionId: "" }); setRejectComment(""); }}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleReject} disabled={!rejectComment.trim() || actionLoading === rejectModal.submissionId}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {actionLoading === rejectModal.submissionId ? "Rejecting…" : "Reject & Notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Submission Card Component
// ═══════════════════════════════════════════════════════════════════════════════
function SubmissionCard({
  submission: s, showRiddleInfo = false, onApprove, onReject, loading,
}: {
  submission: RiddleSubmission;
  showRiddleInfo?: boolean;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  const [imgOpen, setImgOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">
            {s.user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{s.user.name}</p>
            <p className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>

      {showRiddleInfo && s.riddle && (
        <div className="mt-3 p-2.5 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-700 flex items-center gap-1">
            <Puzzle size={11} /> {s.riddle.title}
          </p>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={10} /> {s.riddle.city}</p>
          {s.riddle.correctPlaceName && (
            <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
              <Star size={10} /> Correct: {s.riddle.correctPlaceName}
            </p>
          )}
        </div>
      )}

      {/* Photo thumbnail */}
      <div className="mt-3">
        <button onClick={() => setImgOpen(true)}
          className="relative group w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50 h-36 flex items-center justify-center hover:border-purple-300 transition-colors">
          <img src={s.photoUrl} alt="Submission" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
            <ImageIcon size={20} className="text-white opacity-0 group-hover:opacity-100" />
          </div>
        </button>
        <a href={s.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs text-blue-500 hover:underline block">Open full image ↗</a>
      </div>

      {s.adminComment && (
        <div className="mt-3 p-2.5 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-xs font-medium text-red-700 flex items-center gap-1"><MessageSquare size={11} /> Admin comment:</p>
          <p className="text-xs text-red-600 mt-0.5">{s.adminComment}</p>
        </div>
      )}

      {s.status === "PENDING" && (
        <div className="flex gap-2 mt-3">
          <button onClick={onApprove} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <><ThumbsUp size={14} /> Approve (+{s.riddle?.correctPlaceName ? "100" : "??"} pts)</>}
          </button>
          <button onClick={onReject} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 border border-red-300 text-red-600 rounded-lg px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50">
            <ThumbsDown size={14} /> Reject
          </button>
        </div>
      )}

      {s.status === "APPROVED" && (
        <p className="mt-3 text-xs text-emerald-600 font-medium">✓ Approved — {s.pointsAwarded} PalPoints awarded</p>
      )}

      {/* Full image overlay */}
      {imgOpen && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setImgOpen(false)}>
          <img src={s.photoUrl} alt="Full submission" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
