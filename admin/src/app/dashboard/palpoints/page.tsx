"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Sparkles, RefreshCw, AlertCircle, Store } from "lucide-react";
import { monetizationApi } from "@/services/monetization";
import { useNotification } from "@/components/Notification";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

interface PalPointsConfig {
  enabled: boolean;
  defaultPointsRequired: number;
  defaultMaxDiscountPct: number;
  diamondPlanSlug: string;
}

export default function PalPointsPage() {
  const { notify } = useNotification();
  const [config, setConfig] = useState<PalPointsConfig>({
    enabled: true,
    defaultPointsRequired: 1000,
    defaultMaxDiscountPct: 10,
    diamondPlanSlug: "vendor-diamond",
  });
  const [savedConfig, setSavedConfig] = useState<PalPointsConfig | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorDrawerOpen, setVendorDrawerOpen] = useState(false);
  const [vendorAction, setVendorAction] = useState<"enable" | "disable">("enable");
  const [vendorBusy, setVendorBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await monetizationApi.getPalPointsPartnerConfig();
      const data = (res.data as { data?: PalPointsConfig }).data;
      if (data) {
        setConfig(data);
        setSavedConfig(data);
      }
    } catch {
      setError("Failed to load PalPoints settings");
      notify("error", "Failed to load PalPoints settings");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await monetizationApi.updatePalPointsPartnerConfig(config as unknown as Record<string, unknown>);
      setSavedConfig(config);
      notify("success", "PalPoints settings saved");
    } catch {
      notify("error", "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const openVendorDrawer = (action: "enable" | "disable") => {
    setVendorAction(action);
    setVendorDrawerOpen(true);
  };

  const toggleVendor = async () => {
    if (!vendorId.trim()) {
      notify("error", "Enter a vendor ID");
      return;
    }
    setVendorBusy(true);
    try {
      await monetizationApi.enablePalPointsPartnerVendor(
        vendorId.trim(),
        vendorAction === "enable",
      );
      notify(
        "success",
        vendorAction === "enable"
          ? "Vendor enabled as PalPoints partner"
          : "Partner access revoked",
      );
      setVendorDrawerOpen(false);
      setVendorId("");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notify("error", msg || "Failed to update vendor");
    } finally {
      setVendorBusy(false);
    }
  };

  const hasChanges =
    savedConfig &&
    (config.enabled !== savedConfig.enabled ||
      config.defaultPointsRequired !== savedConfig.defaultPointsRequired ||
      config.defaultMaxDiscountPct !== savedConfig.defaultMaxDiscountPct ||
      config.diamondPlanSlug !== savedConfig.diamondPlanSlug);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader
          title="PalPoints"
          description="Diamond vendor PalPoints redemption program configuration"
          icon={Sparkles}
        />
        <div className="grid max-w-2xl gap-4">
          <div className="admin-card p-6 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="admin-card p-6 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="PalPoints" description="PalPoints partner program settings" icon={Sparkles} />
        <EmptyState
          icon={AlertCircle}
          title="Could not load settings"
          description={error}
          action={
            <button type="button" onClick={() => void load()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="PalPoints"
        description="Configure the Diamond vendor PalPoints redemption program and manage partner access."
        icon={Sparkles}
        actions={
          <button type="button" onClick={() => void load()} className="admin-btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="grid max-w-2xl gap-6">
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Global Program Settings</h2>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                id="enabled"
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium">Program enabled globally</span>
            </label>
            <div>
              <label htmlFor="points-required" className="mb-1 block text-sm font-medium">
                Default Pal Points required
              </label>
              <input
                id="points-required"
                type="number"
                min={0}
                className="admin-input"
                value={config.defaultPointsRequired}
                onChange={(e) =>
                  setConfig({ ...config, defaultPointsRequired: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label htmlFor="max-discount" className="mb-1 block text-sm font-medium">
                Maximum discount (%)
              </label>
              <input
                id="max-discount"
                type="number"
                step="0.1"
                min={0}
                max={100}
                className="admin-input"
                value={config.defaultMaxDiscountPct}
                onChange={(e) =>
                  setConfig({ ...config, defaultMaxDiscountPct: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label htmlFor="diamond-slug" className="mb-1 block text-sm font-medium">
                Diamond plan slug
              </label>
              <input
                id="diamond-slug"
                className="admin-input font-mono text-sm"
                value={config.diamondPlanSlug}
                onChange={(e) => setConfig({ ...config, diamondPlanSlug: e.target.value })}
              />
            </div>
            <button
              type="button"
              disabled={saving || !hasChanges}
              onClick={() => void saveConfig()}
              className="admin-btn-primary disabled:opacity-50"
            >
              <Save size={16} /> {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Store size={18} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Vendor Partner Access</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Enable or revoke PalPoints partner access for individual vendors by ID.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openVendorDrawer("enable")}
              className="admin-btn-primary"
            >
              Enable Partner
            </button>
            <button
              type="button"
              onClick={() => openVendorDrawer("disable")}
              className="admin-btn-secondary text-red-700"
            >
              Revoke Partner
            </button>
          </div>
        </section>
      </div>

      <Drawer
        open={vendorDrawerOpen}
        onClose={() => setVendorDrawerOpen(false)}
        title={vendorAction === "enable" ? "Enable Partner" : "Revoke Partner Access"}
        width="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {vendorAction === "enable"
              ? "Grant PalPoints partner privileges to a vendor."
              : "Remove PalPoints partner privileges from a vendor."}
          </p>
          <div>
            <label htmlFor="vendor-id" className="mb-1 block text-sm font-medium">
              Vendor ID
            </label>
            <input
              id="vendor-id"
              className="admin-input font-mono text-sm"
              placeholder="Vendor cuid…"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setVendorDrawerOpen(false)} className="admin-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={vendorBusy || !vendorId.trim()}
              onClick={() => void toggleVendor()}
              className={
                vendorAction === "enable" ? "admin-btn-primary disabled:opacity-50" : "rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              }
            >
              {vendorBusy ? "Processing…" : vendorAction === "enable" ? "Enable" : "Revoke"}
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
