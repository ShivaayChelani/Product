"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Save, RotateCcw, AlertCircle, CheckCircle, Eye, EyeOff,
} from "lucide-react";
import { getSettings, getSettingCategories, updateSetting, bulkUpdateSettings, resetSettings } from "@/services/settings";
import { changePassword } from "@/services/auth";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getAdminRoleFromStorage } from "@/lib/permissions";
import type { AdminRole } from "@/components/PermissionWrapper";

interface Setting {
  id: string;
  key: string;
  value: any;
  label: string;
  description: string;
  type: string;
  category: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  general: '🔧',
  security: '🔒',
  gamification: '🎮',
  notifications: '🔔',
  vendor_program: '🤝',
  map_settings: '🗺️',
  rewards_settings: '🎁',
  monetization: '💳',
  ads: '📢',
  feature_flags: '🚩',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  security: 'Security',
  gamification: 'Gamification',
  notifications: 'Notifications',
  vendor_program: 'Vendor Program',
  map_settings: 'Map Settings',
  rewards_settings: 'Rewards Settings',
  monetization: 'Monetization',
  ads: 'Advertisements',
  feature_flags: 'Feature Flags',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [canResetDefaults, setCanResetDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, cats] = await Promise.all([getSettings(), getSettingCategories()]);
      setSettings(s);
      setCategories(cats);
      setActiveCategory((prev) => prev || cats[0] || "");
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    const role = getAdminRoleFromStorage() as AdminRole | null;
    setCanResetDefaults(role === "SUPER_ADMIN" || role === "ADMIN" || role === "OPS_ADMIN");
  }, []);

  const filteredSettings = settings.filter(s => s.category === activeCategory);

  const handleValueChange = (key: string, value: any) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    if (!(key in editedValues)) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await updateSetting(key, editedValues[key]);
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: editedValues[key] } : s));
      setEditedValues(prev => { const { [key]: _, ...rest } = prev; return rest; });
      setSuccess('Setting updated');
    } catch {
      setError('Failed to update setting');
    } finally { setSaving(false); }
  };

  const handleSaveAll = async () => {
    const keys = Object.keys(editedValues);
    if (keys.length === 0) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const updates = keys.map(key => ({ key, value: editedValues[key] }));
      await bulkUpdateSettings(updates);
      setSettings(prev => prev.map(s => s.key in editedValues ? { ...s, value: editedValues[s.key] } : s));
      setEditedValues({});
      setSuccess('All settings updated');
    } catch {
      setError('Failed to update settings');
    } finally { setSaving(false); }
  };

  const handleReset = () => {
    setConfirmDialog({
      open: true,
      title: "Reset to Defaults",
      message: "Reset all settings to defaults? This cannot be undone.",
      action: async () => {
        setSaving(true); setError(''); setSuccess('');
        try {
          const result = await resetSettings();
          setSettings(result);
          setEditedValues({});
          setSuccess('Settings reset to defaults');
        } catch {
          setError('Failed to reset settings');
        } finally { setSaving(false); }
        setConfirmDialog((p) => ({ ...p, open: false }));
      },
    });
  };

  const getValue = (s: Setting) => {
    if (s.key in editedValues) return editedValues[s.key];
    return s.value;
  };

  const isDirty = (key: string) => key in editedValues;
  const hasChanges = filteredSettings.some(s => s.key in editedValues);

  const renderSettingInput = (s: Setting) => {
    const val = getValue(s);

    if (s.type === 'boolean') {
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={!!val} onChange={e => handleValueChange(s.key, e.target.checked)}
            className="sr-only peer" />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
        </label>
      );
    }

    if (s.type === 'select') {
      return (
        <select value={String(val)} onChange={e => handleValueChange(s.key, e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
          {['daily', 'weekly', 'monthly'].map(opt => (
            <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
          ))}
        </select>
      );
    }

    if (s.type === 'number') {
      return (
        <div className="relative">
          <input type="number" value={val ?? ''} onChange={e => handleValueChange(s.key, e.target.value === '' ? '' : Number(e.target.value))}
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
      );
    }

    if (s.key.includes('secret') || s.key.includes('key') || s.key.includes('token') || s.key.includes('password')) {
      const show = showValues[s.key] || false;
      return (
        <div className="relative">
          <input type={show ? 'text' : 'password'} value={String(val ?? '')}
            onChange={e => handleValueChange(s.key, e.target.value)}
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm outline-none focus:border-blue-500" />
          <button onClick={() => setShowValues(prev => ({ ...prev, [s.key]: !show }))}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      );
    }

    return (
      <input type="text" value={String(val ?? '')} onChange={e => handleValueChange(s.key, e.target.value)}
        className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage application configuration</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={handleSaveAll} disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              <Save size={16} /> Save All Changes
            </button>
          )}
          {canResetDefaults && (
            <button onClick={handleReset} disabled={saving}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RotateCcw size={16} /> Reset Defaults
            </button>
          )}
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={16} /> {success}
          <button onClick={() => setSuccess('')} className="ml-auto">&times;</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto">&times;</button>
        </div>
      )}

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Change Password</h2>
        <p className="text-sm text-gray-500 mb-4">Update your admin account password</p>
        {pwSuccess && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 mb-4">
            <CheckCircle size={16} /> {pwSuccess}
          </div>
        )}
        {pwError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            <AlertCircle size={16} /> {pwError}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Current Password</label>
            <input type="password" value={pwCurrent} onChange={e => { setPwCurrent(e.target.value); setPwError(''); setPwSuccess(''); }}
              className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">New Password</label>
            <input type="password" value={pwNew} onChange={e => { setPwNew(e.target.value); setPwError(''); setPwSuccess(''); }}
              className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Confirm New</label>
            <input type="password" value={pwConfirm} onChange={e => { setPwConfirm(e.target.value); setPwError(''); setPwSuccess(''); }}
              className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <button onClick={async () => {
            setPwError(''); setPwSuccess('');
            if (!pwCurrent || !pwNew || !pwConfirm) { setPwError('All fields are required'); return; }
            if (pwNew !== pwConfirm) { setPwError('Passwords do not match'); return; }
            if (pwNew.length < 8) { setPwError('Password must be at least 8 characters'); return; }
            setPwLoading(true);
            try {
              await changePassword(pwCurrent, pwNew);
              setPwSuccess('Password changed successfully');
              setPwCurrent(''); setPwNew(''); setPwConfirm('');
            } catch (err: any) {
              setPwError(err?.response?.data?.message || err?.message || 'Failed to change password');
            } finally { setPwLoading(false); }
          }} disabled={pwLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {pwLoading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeCategory === cat ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <span>{CATEGORY_ICONS[cat] || '📋'}</span>
                <span>{CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">
                {CATEGORY_LABELS[activeCategory] || activeCategory}
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {filteredSettings.map(s => (
                <div key={s.key} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-900">{s.label}</label>
                      {isDirty(s.key) && <span className="text-xs text-amber-500 font-medium">(modified)</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{s.key}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {renderSettingInput(s)}
                    {isDirty(s.key) && (
                      <button onClick={() => handleSave(s.key)} disabled={saving}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Save size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredSettings.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">No settings in this category</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Reset"
        variant="danger"
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
