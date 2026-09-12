"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MapPin, Trophy, Trash2, CheckCircle, AlertCircle,
  Puzzle, ChevronLeft, ChevronRight, UploadCloud, Search,
  Building2, History, LayoutDashboard, Eye, TrendingUp,
  Users
} from "lucide-react";
import {
  getHunts, getRiddles, deleteHunt, getTreasureOverview, getCitiesList, getImportHistory,
  type TreasureHunt, type Riddle, type ImportLog, type CityRow
} from "@/services/riddles";
import { getApiErrorMessage } from "@/services/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ExcelImportModal } from "./ExcelImportModal";
import ImportDeleteDialog from "./ImportDeleteDialog";

type Tab = "overview" | "upload" | "hunts" | "riddles" | "cities" | "imports";
type RiddleListParams = NonNullable<Parameters<typeof getRiddles>[0]>;

export default function RiddleHuntAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Treasure Hunt</h1>
          <p className="mt-1 text-sm text-gray-500">Manage city-based text riddle games via Excel import</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit flex-wrap">
        {[
          { key: "overview", label: "Overview", icon: LayoutDashboard },
          { key: "upload", label: "Upload Excel", icon: UploadCloud },
          { key: "hunts", label: "Hunts", icon: MapPin },
          { key: "riddles", label: "Riddles", icon: Puzzle },
          { key: "cities", label: "Cities", icon: Building2 },
          { key: "imports", label: "Import History", icon: History },
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

      {activeTab === "overview" && <OverviewTab onNavigate={setActiveTab} />}
      {activeTab === "upload" && (
        <ExcelImportModal
          open
          onCancel={() => setActiveTab("overview")}
          onSuccess={() => setActiveTab("overview")}
        />
      )}
      {activeTab === "hunts" && <HuntsTab />}
      {activeTab === "riddles" && <RiddlesTab />}
      {activeTab === "cities" && <CitiesTab />}
      {activeTab === "imports" && <ImportHistoryTab />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
      {status}
    </span>
  );
}

function OverviewTab({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingLog, setDeletingLog] = useState<ImportLog | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTreasureOverview();
      setStats(data.stats);
      setRecent(data.recentImports || []);
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to load overview"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const cards = [
    { label: "Active Hunts", value: stats?.activeHunts ?? 0, icon: MapPin, color: "bg-purple-50 text-purple-600" },
    { label: "Active Cities", value: stats?.activeCities ?? 0, icon: Building2, color: "bg-blue-50 text-blue-600" },
    { label: "Active Riddles", value: stats?.activeRiddles ?? 0, icon: Puzzle, color: "bg-amber-50 text-amber-600" },
    { label: "Today's Attempts", value: stats?.todayAttempts ?? 0, icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
    { label: "Today's Correct", value: stats?.todayCorrect ?? 0, icon: CheckCircle, color: "bg-green-50 text-green-600" },
    { label: "Today's Wrong", value: stats?.todayWrong ?? 0, icon: AlertCircle, color: "bg-rose-50 text-rose-600" },
    { label: "Today's Points", value: stats?.todayPoints ?? 0, icon: Trophy, color: "bg-yellow-50 text-yellow-600" },
    { label: "Total Imports", value: stats?.totalImports ?? 0, icon: History, color: "bg-gray-50 text-gray-600" },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
              <c.icon size={18} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? "…" : c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onNavigate("upload")}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
        >
          <UploadCloud size={16} /> Upload Excel
        </button>
        <button
          onClick={() => onNavigate("riddles")}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          <Puzzle size={16} /> Manage Riddles
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 flex items-center gap-2"><History size={16} className="text-gray-400" /> Recent Imports</h3>
          <button onClick={() => onNavigate("imports")} className="text-sm font-medium text-purple-600 hover:text-purple-700">View all</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">File Name</th>
                <th className="px-6 py-3 font-medium">Uploaded By</th>
                <th className="px-6 py-3 font-medium">Rows</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No imports yet.</td></tr>
              ) : recent.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{log.fileName}</td>
                  <td className="px-6 py-3 text-gray-500">{log.uploadedBy?.name || log.uploadedBy?.email || "—"}</td>
                  <td className="px-6 py-3 text-gray-500">
                    <span className="text-emerald-600 font-medium">{log.validRows}</span>
                    {log.failedRows > 0 && <span className="text-red-600 font-medium"> / {log.failedRows} failed</span>}
                  </td>
                  <td className="px-6 py-3 text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-3"><StatusBadge status={log.status} /></td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setDeletingLog(log)}
                      disabled={log.status === "DELETED"}
                      title={log.status === "DELETED" ? "This import was already deleted" : "Delete this import"}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ImportDeleteDialog
        open={!!deletingLog}
        log={deletingLog}
        onClose={() => setDeletingLog(null)}
        onDeleted={(_result, message) => {
          setSuccess(message);
          fetch();
        }}
      />
    </div>
  );
}

function HuntsTab() {
  const [hunts, setHunts] = useState<TreasureHunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const fetchHunts = useCallback(async () => {
    setLoading(true);
    try {
      const params: RiddleListParams = { page, limit: 20 };
      if (cityFilter) params.city = cityFilter;
      const res = await getHunts(params);
      setHunts(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch { setHunts([]); } finally { setLoading(false); }
  }, [page, cityFilter]);

  useEffect(() => { fetchHunts(); }, [fetchHunts]);

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true, title: "Delete Hunt", message: "Delete this hunt and ALL its riddles?",
      action: async () => {
        try { await deleteHunt(id); fetchHunts(); setSuccess("Hunt deleted"); }
        catch { setError("Failed to delete"); }
        setConfirmDialog((p) => ({ ...p, open: false }));
      },
    });
  };

  return (
    <div className="space-y-4">
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">{success}</p>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex-1 w-full sm:w-auto relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search city..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-transparent focus:bg-white focus:border-brand-500 rounded-lg text-sm transition-colors"
          />
        </div>
        <button
          onClick={() => setIsImportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
        >
          <UploadCloud size={16} /> Bulk Import
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">City</th>
                <th className="px-6 py-4 font-medium">Title</th>
                <th className="px-6 py-4 font-medium">Riddles</th>
                <th className="px-6 py-4 font-medium">Reward (Coins)</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading hunts...</td>
                </tr>
              ) : hunts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <MapPin className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No hunts found.</p>
                  </td>
                </tr>
              ) : (
                hunts.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{h.city}</td>
                    <td className="px-6 py-4 text-gray-500">{h.title}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">{h._count.riddles}</td>
                    <td className="px-6 py-4 text-emerald-600 font-medium flex items-center gap-1">
                      <Trophy size={14} /> {h.rewardCoins}
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={h.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleDelete(h.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} hasPrev={hasPrev} hasNext={hasNext} onPageChange={setPage} />

      <ExcelImportModal open={isImportOpen} onCancel={() => setIsImportOpen(false)} onSuccess={() => { setIsImportOpen(false); fetchHunts(); }} />
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} onConfirm={confirmDialog.action} onCancel={() => setConfirmDialog(p => ({ ...p, open: false }))} />
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
  const [cityFilter, setCityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const fetchRiddles = useCallback(async () => {
    setLoading(true);
    try {
      const params: RiddleListParams = { page, limit: 20 };
      if (cityFilter) params.city = cityFilter;
      if (search) params.search = search;
      const res = await getRiddles(params);
      setRiddles(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch { setRiddles([]); } finally { setLoading(false); }
  }, [page, cityFilter, search]);

  useEffect(() => { fetchRiddles(); }, [fetchRiddles]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex-1 w-full sm:w-auto relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search riddles, answers or cities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-transparent focus:bg-white focus:border-brand-500 rounded-lg text-sm transition-colors"
          />
        </div>
        <input
          type="text"
          placeholder="Filter by city..."
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="w-full sm:w-48 px-4 py-2 bg-gray-50 border-transparent focus:bg-white focus:border-brand-500 rounded-lg text-sm transition-colors"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">City</th>
                <th className="px-6 py-4 font-medium">Seq</th>
                <th className="px-6 py-4 font-medium">Clue (EN)</th>
                <th className="px-6 py-4 font-medium">Answer (EN)</th>
                <th className="px-6 py-4 font-medium">Clue (HI)</th>
                <th className="px-6 py-4 font-medium">Answer (HI)</th>
                <th className="px-6 py-4 font-medium">Reward</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">Loading riddles...</td>
                </tr>
              ) : riddles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Puzzle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No riddles found.</p>
                  </td>
                </tr>
              ) : (
                riddles.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{r.city}</td>
                    <td className="px-6 py-4 text-gray-500">#{r.sequence}</td>
                    <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={r.clueEnglish}>{r.clueEnglish}</td>
                    <td className="px-6 py-4 max-w-[150px] truncate">
                      {revealed[r.id] ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1.5" title={r.answerEnglish}>
                          {r.answerEnglish}
                          <button onClick={() => setRevealed((p) => ({ ...p, [r.id]: false }))} className="p-0.5 text-gray-400 hover:text-gray-700" title="Hide">
                            <Eye size={14} className="text-gray-300" />
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-gray-400">
                          ··········
                          <button onClick={() => setRevealed((p) => ({ ...p, [r.id]: true }))} className="p-0.5 text-gray-400 hover:text-gray-700" title="View Answer">
                            <Eye size={14} />
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={r.clueHindi}>{r.clueHindi}</td>
                    <td className="px-6 py-4 max-w-[150px] truncate">
                      {revealed[r.id] ? (
                        <span className="text-emerald-700 font-medium" title={r.answerHindi}>{r.answerHindi}</span>
                      ) : (
                        <span className="text-gray-400">··········</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-amber-600 font-medium">{r.rewardCoins}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-6 py-4 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} hasPrev={hasPrev} hasNext={hasNext} onPageChange={setPage} />
    </div>
  );
}

function CitiesTab() {
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      setCities(await getCitiesList());
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to load cities"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">City</th>
                <th className="px-6 py-4 font-medium">Hunt Title</th>
                <th className="px-6 py-4 font-medium">Active Riddles</th>
                <th className="px-6 py-4 font-medium">Today Attempts</th>
                <th className="px-6 py-4 font-medium">Today Correct</th>
                <th className="px-6 py-4 font-medium">Today Wrong</th>
                <th className="px-6 py-4 font-medium">Today Points</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">Loading cities...</td>
                </tr>
              ) : cities.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No cities with riddles yet. Upload an Excel file to get started.</p>
                  </td>
                </tr>
              ) : (
                cities.map((c) => (
                  <tr key={c.city} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{c.city}</td>
                    <td className="px-6 py-4 text-gray-500">{c.title || "—"}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">{c.riddleCount}</td>
                    <td className="px-6 py-4 text-gray-500">{(c as any).todayAttempts ?? 0}</td>
                    <td className="px-6 py-4 text-emerald-600 font-medium">{(c as any).todayCorrect ?? 0}</td>
                    <td className="px-6 py-4 text-red-600 font-medium">{(c as any).todayWrong ?? 0}</td>
                    <td className="px-6 py-4 text-amber-600 font-medium">{(c as any).todayPoints ?? 0}</td>
                    <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
                    <td className="px-6 py-4 text-gray-400">{c.lastUpdatedAt ? new Date(c.lastUpdatedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ImportHistoryTab() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingLog, setDeletingLog] = useState<ImportLog | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getImportHistory({ page, limit: 20 });
      setLogs(res.data);
      setTotalPages(res.pagination.totalPages);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to load import history"));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">{success}</p>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">File Name</th>
                <th className="px-6 py-4 font-medium">Uploaded By</th>
                <th className="px-6 py-4 font-medium">Total Rows</th>
                <th className="px-6 py-4 font-medium">Imported</th>
                <th className="px-6 py-4 font-medium">Failed</th>
                <th className="px-6 py-4 font-medium">Cities</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Upload Date</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">Loading imports...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No imports recorded yet.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{log.fileName}</td>
                    <td className="px-6 py-4 text-gray-500">
                      <span className="flex items-center gap-2"><Users size={14} className="text-gray-300" />{log.uploadedBy?.name || log.uploadedBy?.email || "—"}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{log.totalRows}</td>
                    <td className="px-6 py-4 text-emerald-600 font-medium">{log.validRows}</td>
                    <td className="px-6 py-4 text-red-600 font-medium">{log.failedRows}</td>
                    <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={log.cities?.join(", ")}>
                      {log.cities?.join(", ") || "—"}
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={log.status} /></td>
                    <td className="px-6 py-4 text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setDeletingLog(log)}
                        disabled={log.status === "DELETED"}
                        title={log.status === "DELETED" ? "This import was already deleted" : "Delete this import"}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} hasPrev={hasPrev} hasNext={hasNext} onPageChange={setPage} />

      <ImportDeleteDialog
        open={!!deletingLog}
        log={deletingLog}
        onClose={() => setDeletingLog(null)}
        onDeleted={(_result, message) => {
          setSuccess(message);
          fetch();
        }}
      />
    </div>
  );
}

function Pagination({
  page, totalPages, hasPrev, hasNext, onPageChange
}: {
  page: number; totalPages: number; hasPrev: boolean; hasNext: boolean; onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-lg">
      <p className="text-sm text-gray-700">Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span></p>
      <div className="flex gap-2">
        <button onClick={() => onPageChange(page - 1)} disabled={!hasPrev} className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 disabled:opacity-50">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(page + 1)} disabled={!hasNext} className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 disabled:opacity-50">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}