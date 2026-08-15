"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Search, ToggleLeft, ToggleRight, RotateCcw, Edit3, Save, X, Trash2, Plus } from "lucide-react";
import client from "@/services/client";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

interface PointRule {
  id: string;
  key: string;
  label: string;
  description: string | null;
  points: number;
  category: string;
  isActive: boolean;
  cooldownSec: number | null;
  maxDaily: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function PointRulesPage() {
  const { notify } = useNotification();
  const [rules, setRules] = useState<PointRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingLimitsId, setEditingLimitsId] = useState<string | null>(null);
  const [editCooldown, setEditCooldown] = useState("");
  const [editMaxDaily, setEditMaxDaily] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: "danger" | "primary";
    action: () => void;
  }>({ open: false, title: "", message: "", variant: "danger", action: () => {} });

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    key: "",
    label: "",
    description: "",
    points: "10",
    category: "general",
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await client.get<{ success: boolean; data: PointRule[] }>("/point-rules");
      setRules(res.data.data || []);
    } catch {
      setRules([]);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggleActive = async (rule: PointRule) => {
    setActionLoading(rule.id);
    try {
      await client.patch(`/point-rules/${rule.id}`, { isActive: !rule.isActive });
      notify("success", rule.isActive ? "Rule deactivated" : "Rule activated");
      fetchRules();
    } catch {
      notify("error", "Failed to update rule");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartEdit = (rule: PointRule) => {
    setEditingId(rule.id);
    setEditValue(String(rule.points));
  };

  const handleSaveEdit = async (rule: PointRule) => {
    const newPoints = parseInt(editValue, 10);
    if (isNaN(newPoints) || newPoints < 0) {
      notify("error", "Please enter a valid positive number");
      return;
    }
    setActionLoading(rule.id);
    try {
      await client.patch(`/point-rules/${rule.id}`, { points: newPoints });
      notify("success", "Points value updated successfully");
      setEditingId(null);
      fetchRules();
    } catch {
      notify("error", "Failed to update points value");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartLimitsEdit = (rule: PointRule) => {
    setEditingLimitsId(rule.id);
    setEditCooldown(rule.cooldownSec != null ? String(rule.cooldownSec) : "0");
    setEditMaxDaily(rule.maxDaily != null ? String(rule.maxDaily) : "");
  };

  const handleSaveLimits = async (rule: PointRule) => {
    const cooldown = parseInt(editCooldown, 10);
    if (isNaN(cooldown) || cooldown < 0) {
      notify("error", "Cooldown must be 0 or a positive number of seconds");
      return;
    }
    let maxDaily: number | null = null;
    if (editMaxDaily.trim() !== "") {
      const parsed = parseInt(editMaxDaily, 10);
      if (isNaN(parsed) || parsed < 1) {
        notify("error", "Max daily must be empty (unlimited) or a positive integer");
        return;
      }
      maxDaily = parsed;
    }
    setActionLoading(rule.id);
    try {
      await client.patch(`/point-rules/${rule.id}`, {
        cooldownSec: cooldown,
        maxDaily,
      });
      notify("success", "Cooldown / daily limits updated");
      setEditingLimitsId(null);
      fetchRules();
    } catch {
      notify("error", "Failed to update limits");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleDeleteRule = (rule: PointRule) => {
    setConfirmDialog({
      open: true,
      title: "Delete Point Rule",
      message: `Permanently delete "${rule.label}" (${rule.key})? This action cannot be undone.`,
      variant: "danger",
      action: async () => {
        setActionLoading(rule.id);
        try {
          await client.delete(`/point-rules/${rule.id}`);
          notify("success", `"${rule.label}" deleted permanently`);
          fetchRules();
        } catch {
          notify("error", "Failed to delete point rule");
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const handleCreateRule = async () => {
    if (!createForm.key.trim() || !createForm.label.trim()) {
      notify("error", "Key and label are required");
      return;
    }
    const points = parseInt(createForm.points, 10);
    if (isNaN(points) || points < 0) {
      notify("error", "Enter a valid points value");
      return;
    }
    setActionLoading("create");
    try {
      await client.post("/point-rules", {
        key: createForm.key.trim(),
        label: createForm.label.trim(),
        description: createForm.description.trim() || undefined,
        points,
        category: createForm.category.trim() || "general",
        isActive: true,
      });
      notify("success", "Point rule created");
      setShowCreate(false);
      setCreateForm({ key: "", label: "", description: "", points: "10", category: "general" });
      fetchRules();
    } catch {
      notify("error", "Failed to create point rule");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetDefaults = () => {
    setConfirmDialog({
      open: true,
      title: "Reset to Defaults",
      message: "Reset all point rules to their default values? This action cannot be undone.",
      variant: "danger",
      action: async () => {
        setActionLoading("reset");
        try {
          await client.post("/point-rules/reset-defaults");
          notify("success", "Point rules reset to defaults");
          fetchRules();
        } catch {
          notify("error", "Failed to reset point rules");
        } finally {
          setActionLoading(null);
          setConfirmDialog((p) => ({ ...p, open: false }));
        }
      },
    });
  };

  const filteredRules = rules.filter((r) => {
    const matchesSearch = !search || r.label.toLowerCase().includes(search.toLowerCase()) || r.key.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const uniqueCategories = [...new Set(rules.map((r) => r.category))];
  const activeCount = rules.filter((r) => r.isActive).length;
  const totalPoints = rules.reduce((sum, r) => sum + r.points, 0);

  const columns: Column<PointRule & Record<string, unknown>>[] = [
    {
      key: "key",
      header: "Key",
      render: (item) => (
        <div>
          <p className="font-mono text-xs text-gray-500">{item.key}</p>
        </div>
      ),
    },
    {
      key: "label",
      header: "Label",
      render: (item) => (
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{item.label}</p>
          {item.description && (
            <span className="hidden text-xs text-gray-400 lg:inline" title={item.description}>
              ({item.description.slice(0, 40)})
            </span>
          )}
        </div>
      ),
    },
    {
      key: "points",
      header: "Points",
      render: (item) => (
        <div className="flex items-center gap-2">
          {editingId === item.id ? (
            <>
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit(item);
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <button
                onClick={() => handleSaveEdit(item)}
                disabled={actionLoading === item.id}
                className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              >
                <Save size={14} />
              </button>
              <button
                onClick={handleCancelEdit}
                className="rounded-lg p-1 text-red-600 hover:bg-red-50"
              >
                <X size={14} />
              </button>
            </>
          ) : item.key === 'admin_bonus' ? (
            <span className="text-sm font-medium text-gray-500" title="Set per user in Wallets → Adjust">
              Admin choice
            </span>
          ) : (
            <>
              <span className="font-semibold text-emerald-600">{item.points}</span>
              <button
                onClick={() => handleStartEdit(item)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Edit"
              >
                <Edit3 size={12} />
              </button>
            </>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (item) => (
        <span className="text-sm text-gray-600 capitalize">{item.category}</span>
      ),
    },
    {
      key: "cooldownSec",
      header: "Cooldown",
      render: (item) =>
        editingLimitsId === item.id ? (
          <input
            type="number"
            min={0}
            value={editCooldown}
            onChange={(e) => setEditCooldown(e.target.value)}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
            title="Seconds"
          />
        ) : (
          <span className="text-sm text-gray-600">
            {item.cooldownSec ? `${item.cooldownSec}s` : "—"}
          </span>
        ),
    },
    {
      key: "maxDaily",
      header: "Max Daily",
      render: (item) =>
        editingLimitsId === item.id ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={editMaxDaily}
              onChange={(e) => setEditMaxDaily(e.target.value)}
              placeholder="∞"
              className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button
              onClick={() => handleSaveLimits(item)}
              className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
              title="Save limits"
            >
              <Save size={14} />
            </button>
            <button
              onClick={() => setEditingLimitsId(null)}
              className="rounded-lg p-1 text-red-600 hover:bg-red-50"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-600">
              {item.maxDaily ?? "∞"}
            </span>
            <button
              onClick={() => handleStartLimitsEdit(item)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Edit cooldown / max daily"
            >
              <Edit3 size={12} />
            </button>
          </div>
        ),
    },
    {
      key: "isActive",
      header: "Active",
      render: (item) => (
        <StatusBadge status={item.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleToggleActive(item)}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
            title={item.isActive ? "Deactivate" : "Activate"}
          >
            {item.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
          <button
            onClick={() => handleDeleteRule(item)}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
            title="Delete permanently"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Point Rules</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure points awarded for user actions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Plus size={16} />
            Create Rule
          </button>
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load point rules.{" "}
          <button type="button" onClick={fetchRules} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Rules" value={rules.length} icon={Settings} color="emerald" />
        <StatCard title="Active" value={activeCount} icon={ToggleRight} color="blue" />
        <StatCard title="Inactive" value={rules.length - activeCount} icon={ToggleLeft} color="red" />
        <StatCard title="Points Sum" value={totalPoints} icon={Settings} color="purple" />
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by label or key..."
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
        >
          <option value="">All Categories</option>
          {uniqueCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filteredRules as (PointRule & Record<string, unknown>)[]}
        loading={loading}
        emptyMessage="No point rules configured"
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

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Create Point Rule</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Key</label>
                <input
                  value={createForm.key}
                  onChange={(e) => setCreateForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder="e.g. place_visit"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Label</label>
                <input
                  value={createForm.label}
                  onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Place Visit"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Points</label>
                  <input
                    type="number"
                    min={0}
                    value={createForm.points}
                    onChange={(e) => setCreateForm((f) => ({ ...f, points: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Category</label>
                  <input
                    value={createForm.category}
                    onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRule}
                disabled={actionLoading === "create"}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
