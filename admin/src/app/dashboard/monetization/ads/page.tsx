"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, AlertTriangle } from "lucide-react";
import { monetizationApi } from "@/services/monetization";
import { useNotification } from "@/components/Notification";

const emptyForm = {
  adsEnabled: false,
  killSwitch: false,
  bannerEnabled: false,
  interstitialEnabled: false,
  rewardedEnabled: false,
  nativeEnabled: false,
  interstitialCooldownSec: 120,
  rewardedPoints: 0,
  bannerAdUnitIdAndroid: "",
  bannerAdUnitIdIos: "",
  interstitialAdUnitIdAndroid: "",
  interstitialAdUnitIdIos: "",
  rewardedAdUnitIdAndroid: "",
  rewardedAdUnitIdIos: "",
  nativeAdUnitIdAndroid: "",
  nativeAdUnitIdIos: "",
  enabledCountries: "",
  enabledAppVersions: "",
};

export default function AdMobPage() {
  const { notify } = useNotification();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await monetizationApi.getAds();
      const data = res.data?.data || res.data || {};
      setForm({
        adsEnabled: !!data.adsEnabled,
        killSwitch: !!data.killSwitch,
        bannerEnabled: !!data.bannerEnabled,
        interstitialEnabled: !!data.interstitialEnabled,
        rewardedEnabled: !!data.rewardedEnabled,
        nativeEnabled: !!data.nativeEnabled,
        interstitialCooldownSec: Number(data.interstitialCooldownSec || 120),
        rewardedPoints: Number(data.rewardedPoints || 0),
        bannerAdUnitIdAndroid: data.bannerAdUnitIdAndroid || "",
        bannerAdUnitIdIos: data.bannerAdUnitIdIos || "",
        interstitialAdUnitIdAndroid: data.interstitialAdUnitIdAndroid || "",
        interstitialAdUnitIdIos: data.interstitialAdUnitIdIos || "",
        rewardedAdUnitIdAndroid: data.rewardedAdUnitIdAndroid || "",
        rewardedAdUnitIdIos: data.rewardedAdUnitIdIos || "",
        nativeAdUnitIdAndroid: data.nativeAdUnitIdAndroid || "",
        nativeAdUnitIdIos: data.nativeAdUnitIdIos || "",
        enabledCountries: Array.isArray(data.enabledCountries) ? data.enabledCountries.join(", ") : "",
        enabledAppVersions: Array.isArray(data.enabledAppVersions) ? data.enabledAppVersions.join(", ") : "",
      });
    } catch {
      notify("error", "Failed to load AdMob configuration.");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        enabledCountries: form.enabledCountries.split(",").map((s) => s.trim()).filter(Boolean),
        enabledAppVersions: form.enabledAppVersions.split(",").map((s) => s.trim()).filter(Boolean),
      };
      await monetizationApi.updateAds(payload);
      notify("success", "AdMob configuration saved.");
      load();
    } catch {
      notify("error", "Failed to save AdMob configuration.");
    } finally {
      setSaving(false);
    }
  };

  const isTestConfig =
    (form.bannerAdUnitIdAndroid && form.bannerAdUnitIdAndroid.includes("3940256099942544")) ||
    (form.interstitialAdUnitIdAndroid && form.interstitialAdUnitIdAndroid.includes("3940256099942544"));

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading AdMob configuration…</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AdMob Configuration</h1>
        <p className="text-sm text-gray-500">Manage PalSafar advertising configuration for Android and iOS.</p>
      </div>

      {isTestConfig && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div className="text-sm">
            <strong className="font-semibold block">TEST MODE ACTIVE</strong>
            Google test ads are currently configured. Do not use production ad units until testing is complete.
          </div>
        </div>
      )}

      {/* Global */}
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Global Ads</h2>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.adsEnabled}
              onChange={(e) => setForm({ ...form, adsEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">Ads Enabled</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.killSwitch}
              onChange={(e) => setForm({ ...form, killSwitch: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm font-medium text-red-700">Kill Switch (Disables ALL ads instantly)</span>
          </label>
        </div>
      </div>

      {/* Banner */}
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Banner</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.bannerEnabled}
              onChange={(e) => setForm({ ...form, bannerEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">Enabled</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm block">
            Android Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.bannerAdUnitIdAndroid}
              onChange={(e) => setForm({ ...form, bannerAdUnitIdAndroid: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            iOS Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.bannerAdUnitIdIos}
              onChange={(e) => setForm({ ...form, bannerAdUnitIdIos: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* Interstitial */}
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Interstitial</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.interstitialEnabled}
              onChange={(e) => setForm({ ...form, interstitialEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">Enabled</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm block">
            Android Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.interstitialAdUnitIdAndroid}
              onChange={(e) => setForm({ ...form, interstitialAdUnitIdAndroid: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            iOS Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.interstitialAdUnitIdIos}
              onChange={(e) => setForm({ ...form, interstitialAdUnitIdIos: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            Cooldown (seconds)
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.interstitialCooldownSec}
              onChange={(e) => setForm({ ...form, interstitialCooldownSec: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {/* Rewarded */}
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Rewarded</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.rewardedEnabled}
              onChange={(e) => setForm({ ...form, rewardedEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">Enabled</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm block">
            Android Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.rewardedAdUnitIdAndroid}
              onChange={(e) => setForm({ ...form, rewardedAdUnitIdAndroid: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            iOS Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.rewardedAdUnitIdIos}
              onChange={(e) => setForm({ ...form, rewardedAdUnitIdIos: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            PalPoints Reward
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.rewardedPoints}
              onChange={(e) => setForm({ ...form, rewardedPoints: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {/* Native */}
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Native</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.nativeEnabled}
              onChange={(e) => setForm({ ...form, nativeEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">Enabled</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm block">
            Android Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.nativeAdUnitIdAndroid}
              onChange={(e) => setForm({ ...form, nativeAdUnitIdAndroid: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            iOS Ad Unit ID
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.nativeAdUnitIdIos}
              onChange={(e) => setForm({ ...form, nativeAdUnitIdIos: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* Optional Targeting */}
      <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Optional Targeting</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm block">
            Enabled Countries (comma-separated, e.g. IN, US)
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.enabledCountries}
              onChange={(e) => setForm({ ...form, enabledCountries: e.target.value })}
            />
          </label>
          <label className="text-sm block">
            Enabled App Versions (comma-separated)
            <input
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 px-3 py-2 border"
              value={form.enabledAppVersions}
              onChange={(e) => setForm({ ...form, enabledAppVersions: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end sticky bottom-6">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-800 disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>
    </form>
  );
}
