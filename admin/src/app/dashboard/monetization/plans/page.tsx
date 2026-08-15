"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Copy, Trash2, Power, Save, X } from "lucide-react";
import { monetizationApi, type PlanAudience, type PlanPeriod, type PlanStatus, type SubscriptionPlan } from "@/services/monetization";
import { useNotification } from "@/components/Notification";
import StatusBadge from "@/components/StatusBadge";

const AUDIENCES: { id: PlanAudience | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "USER_PREMIUM", label: "User Premium" },
  { id: "VENDOR", label: "Vendor" },
  { id: "CREATOR", label: "Creator" },
];

function paiseToRupees(paise: number) {
  return (paise / 100).toFixed(2);
}

function buildPrices(form: typeof emptyForm): Array<{ period: PlanPeriod; amountPaise: number; currency: string }> {
  const prices: Array<{ period: PlanPeriod; amountPaise: number; currency: string }> = [];
  const push = (period: PlanPeriod, rupees: string) => {
    const n = Number(rupees);
    if (Number.isFinite(n) && n > 0) {
      prices.push({ period, amountPaise: Math.round(n * 100), currency: "INR" });
    }
  };
  push("MONTHLY", form.monthlyRupees);
  return prices.length ? prices : [{ period: "MONTHLY", amountPaise: 0, currency: "INR" }];
}

const emptyForm = {
  audience: "VENDOR" as PlanAudience,
  name: "Starter",
  slug: "vendor-starter",
  description: "Business map listing, 1 active offer, and 2 reels per month.",
  badge: "Starter",
  color: "#0E7490",
  status: "ACTIVE" as PlanStatus,
  monthlyRupees: "99",
  maxOffers: "1",
  maxReels: "2",
  analyticsLevel: "advanced",
  featuredListing: false,
  uploadLimit: "30",
  verifiedBadge: false,
  priorityRanking: false,
  premiumTheme: true,
  premiumBadge: "Premium",
  googleProductIdMonthly: "",
  googleProductIdYearly: "",
  appleProductIdMonthly: "",
  appleProductIdYearly: "",
};

export default function MonetizationPlansPage() {
  const { notify } = useNotification();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<PlanAudience | "ALL">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await monetizationApi.listPlans(
        audience === "ALL" ? undefined : { audience },
      );
      setPlans(res.data.data || []);
    } catch {
      setPlans([]);
      notify("error", "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [audience, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const result = [...plans];
    result.sort((a, b) => {
      if (a.audience !== b.audience) {
        return a.audience.localeCompare(b.audience);
      }
      const aPrice = a.prices.find(p => p.period === "MONTHLY")?.amountPaise || 0;
      const bPrice = b.prices.find(p => p.period === "MONTHLY")?.amountPaise || 0;
      return aPrice - bPrice;
    });
    return result;
  }, [plans]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      notify("error", "Name and slug are required");
      return;
    }
    setSaving(true);
    try {
      await monetizationApi.createPlan({
        audience: form.audience,
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description: form.description || null,
        badge: form.badge || null,
        color: form.color,
        status: form.status,
        features:
          form.audience === "VENDOR"
            ? {
                maxOffers: Number(form.maxOffers) || 20,
                maxReels: Number(form.maxReels) || 10,
                analyticsLevel: form.analyticsLevel,
                featuredListing: form.featuredListing,
              }
            : form.audience === "CREATOR"
            ? {
                uploadLimit: Number(form.uploadLimit) || 30,
                analyticsLevel: form.analyticsLevel,
                verifiedBadge: form.verifiedBadge,
                priorityRanking: form.priorityRanking,
              }
            : {
                premiumTheme: form.premiumTheme,
                premiumBadge: form.premiumBadge,
              },
        googleProductIdMonthly: form.googleProductIdMonthly || null,
        googleProductIdYearly: form.googleProductIdYearly || null,
        appleProductIdMonthly: form.appleProductIdMonthly || null,
        appleProductIdYearly: form.appleProductIdYearly || null,
        prices: buildPrices(form),
      });
      notify("success", "Plan created");
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (e: any) {
      notify("error", e?.response?.data?.message || e?.message || "Failed to create plan");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: SubscriptionPlan) => {
    const next = plan.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await monetizationApi.setStatus(plan.id, next);
      notify("success", `Plan ${next === "ACTIVE" ? "activated" : "deactivated"}`);
      load();
    } catch {
      notify("error", "Failed to update status");
    }
  };

  const duplicate = async (id: string) => {
    try {
      await monetizationApi.duplicate(id);
      notify("success", "Plan duplicated");
      load();
    } catch {
      notify("error", "Failed to duplicate");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this plan? Active subscriptions will block deletion.")) return;
    try {
      await monetizationApi.remove(id);
      notify("success", "Plan deleted");
      load();
    } catch (e: any) {
      notify("error", e?.response?.data?.message || "Failed to delete");
    }
  };

  const startEdit = (plan: SubscriptionPlan) => {
    const monthly = plan.prices.find((p) => p.period === "MONTHLY");
    const features = plan.features || {};
    setForm({
      audience: plan.audience,
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      badge: plan.badge ?? "",
      color: plan.color ?? "#B9834B",
      status: plan.status,
      monthlyRupees: monthly ? String(Math.round(monthly.amountPaise / 100)) : "",
      maxOffers: String((features as any).maxOffers ?? 20),
      maxReels: String((features as any).maxReels ?? 10),
      analyticsLevel: (features as any).analyticsLevel ?? "basic",
      featuredListing: (features as any).featuredListing ?? false,
      uploadLimit: String((features as any).uploadLimit ?? 30),
      verifiedBadge: Boolean((features as any).verifiedBadge ?? false),
      priorityRanking: Boolean((features as any).priorityRanking ?? false),
      premiumTheme: Boolean((features as any).premiumTheme ?? true),
      premiumBadge: String((features as any).premiumBadge ?? "Premium"),
      googleProductIdMonthly: plan.googleProductIdMonthly ?? "",
      googleProductIdYearly: plan.googleProductIdYearly ?? "",
      appleProductIdMonthly: plan.appleProductIdMonthly ?? "",
      appleProductIdYearly: plan.appleProductIdYearly ?? "",
    });
    setEditingPlan(plan);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUpdate = async () => {
    if (!editingPlan) return;
    if (!form.name.trim() || !form.slug.trim()) {
      notify("error", "Name and slug are required");
      return;
    }
    setSaving(true);
    try {
      await monetizationApi.updatePlan(editingPlan.id, {
        audience: form.audience,
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description: form.description || null,
        badge: form.badge || null,
        color: form.color,
        status: form.status,
        features:
          form.audience === "VENDOR"
            ? {
                maxOffers: Number(form.maxOffers) || 20,
                maxReels: Number(form.maxReels) || 10,
                analyticsLevel: form.analyticsLevel,
                featuredListing: form.featuredListing,
              }
            : form.audience === "CREATOR"
            ? {
                uploadLimit: Number(form.uploadLimit) || 30,
                analyticsLevel: form.analyticsLevel,
                verifiedBadge: form.verifiedBadge,
                priorityRanking: form.priorityRanking,
              }
            : {
                premiumTheme: form.premiumTheme,
                premiumBadge: form.premiumBadge,
              },
        googleProductIdMonthly: form.googleProductIdMonthly || null,
        googleProductIdYearly: form.googleProductIdYearly || null,
        appleProductIdMonthly: form.appleProductIdMonthly || null,
        appleProductIdYearly: form.appleProductIdYearly || null,
        prices: buildPrices(form),
      });
      notify("success", "Plan updated");
      setShowForm(false);
      setEditingPlan(null);
      setForm(emptyForm);
      load();
    } catch (e: any) {
      notify("error", e?.response?.data?.message || e?.message || "Failed to update plan");
    } finally {
      setSaving(false);
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingPlan(null);
    setForm(emptyForm);
  };

  const persistSort = async () => {
    try {
      await monetizationApi.sortPlans(filtered.map((p) => p.id));
      notify("success", "Sort order saved");
    } catch {
      notify("error", "Failed to save sort order");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <p className="text-sm text-gray-500">Dynamic pricing for User Premium, Vendor, and Creator — no hardcoded prices in the app.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={persistSort}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Save sort order
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            <Plus size={16} /> New plan
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIENCES.map((a) => (
          <button
            key={a.id}
            onClick={() => setAudience(a.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              audience === a.id ? "bg-amber-700 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{editingPlan ? "Edit plan" : "Create plan"}</h2>
            <button onClick={cancelForm}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">Audience
              <select className="mt-1 w-full rounded border px-3 py-2" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as PlanAudience })}>
                <option value="VENDOR">Vendor</option>
                <option value="USER_PREMIUM">User Premium</option>
                <option value="CREATOR">Creator</option>
              </select>
            </label>
            <label className="text-sm">Name
              <input className="mt-1 w-full rounded border px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") })} />
            </label>
            <label className="text-sm">Slug
              <input className="mt-1 w-full rounded border px-3 py-2" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </label>
            <label className="text-sm">Badge
              <input className="mt-1 w-full rounded border px-3 py-2" value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
            </label>
            <label className="text-sm">Monthly price (₹)
              <input className="mt-1 w-full rounded border px-3 py-2" value={form.monthlyRupees} onChange={(e) => setForm({ ...form, monthlyRupees: e.target.value })} />
            </label>
            <label className="text-sm md:col-span-2">Description
              <textarea className="mt-1 w-full rounded border px-3 py-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            {form.audience === "USER_PREMIUM" && (
              <>
                <label className="text-sm">Premium Badge Text
                  <input className="mt-1 w-full rounded border px-3 py-2" value={form.premiumBadge} onChange={(e) => setForm({ ...form, premiumBadge: e.target.value })} />
                </label>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="premiumTheme" checked={form.premiumTheme} onChange={(e) => setForm({ ...form, premiumTheme: e.target.checked })} />
                  <label htmlFor="premiumTheme" className="text-sm font-medium text-gray-700">Premium Theme</label>
                </div>
                <label className="text-sm">Google monthly SKU
                  <input className="mt-1 w-full rounded border px-3 py-2" value={form.googleProductIdMonthly} onChange={(e) => setForm({ ...form, googleProductIdMonthly: e.target.value })} />
                </label>
                <label className="text-sm">Google yearly SKU
                  <input className="mt-1 w-full rounded border px-3 py-2" value={form.googleProductIdYearly} onChange={(e) => setForm({ ...form, googleProductIdYearly: e.target.value })} />
                </label>
                <label className="text-sm">Apple monthly SKU
                  <input className="mt-1 w-full rounded border px-3 py-2" value={form.appleProductIdMonthly} onChange={(e) => setForm({ ...form, appleProductIdMonthly: e.target.value })} />
                </label>
                <label className="text-sm">Apple yearly SKU
                  <input className="mt-1 w-full rounded border px-3 py-2" value={form.appleProductIdYearly} onChange={(e) => setForm({ ...form, appleProductIdYearly: e.target.value })} />
                </label>
              </>
            )}
            {form.audience === "VENDOR" && (
              <>
                <label className="text-sm">Max Offers
                  <input className="mt-1 w-full rounded border px-3 py-2" type="number" value={form.maxOffers} onChange={(e) => setForm({ ...form, maxOffers: e.target.value })} />
                </label>
                <label className="text-sm">Max Reels
                  <input className="mt-1 w-full rounded border px-3 py-2" type="number" value={form.maxReels} onChange={(e) => setForm({ ...form, maxReels: e.target.value })} />
                </label>
                <label className="text-sm">Analytics Level
                  <select className="mt-1 w-full rounded border px-3 py-2" value={form.analyticsLevel} onChange={(e) => setForm({ ...form, analyticsLevel: e.target.value })}>
                    <option value="basic">Basic</option>
                    <option value="advanced">Advanced</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="featuredListing" checked={form.featuredListing} onChange={(e) => setForm({ ...form, featuredListing: e.target.checked })} />
                  <label htmlFor="featuredListing" className="text-sm font-medium text-gray-700">Featured Listing</label>
                </div>
              </>
            )}
            {form.audience === "CREATOR" && (
              <>
                <label className="text-sm">Upload Limit (Reels)
                  <input className="mt-1 w-full rounded border px-3 py-2" type="number" value={form.uploadLimit} onChange={(e) => setForm({ ...form, uploadLimit: e.target.value })} />
                </label>
                <label className="text-sm">Analytics Level
                  <select className="mt-1 w-full rounded border px-3 py-2" value={form.analyticsLevel} onChange={(e) => setForm({ ...form, analyticsLevel: e.target.value })}>
                    <option value="basic">Basic</option>
                    <option value="advanced">Advanced</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="verifiedBadge" checked={form.verifiedBadge} onChange={(e) => setForm({ ...form, verifiedBadge: e.target.checked })} />
                  <label htmlFor="verifiedBadge" className="text-sm font-medium text-gray-700">Verified Badge</label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="priorityRanking" checked={form.priorityRanking} onChange={(e) => setForm({ ...form, priorityRanking: e.target.checked })} />
                  <label htmlFor="priorityRanking" className="text-sm font-medium text-gray-700">Priority Ranking</label>
                </div>
              </>
            )}
          </div>
          <button type="button" disabled={saving} onClick={(e) => { e.preventDefault(); if (editingPlan) { handleUpdate(); } else { handleCreate(); } }} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={16} /> {saving ? "Saving…" : editingPlan ? "Update plan" : "Create plan"}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading plans…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No plans yet. Create your first plan above.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Pricing</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((plan) => {
                const monthly = plan.prices.find((p) => p.period === "MONTHLY");
                return (
                  <tr key={plan.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{plan.name}</div>
                      <div className="text-xs text-gray-500">{plan.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        plan.audience === "VENDOR" ? "bg-blue-100 text-blue-800" :
                        plan.audience === "CREATOR" ? "bg-purple-100 text-purple-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {plan.audience}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {monthly ? `₹${paiseToRupees(monthly.amountPaise)}/mo` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={plan.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button title="Edit plan" onClick={() => startEdit(plan)} className="rounded px-2 py-1 text-xs font-semibold hover:bg-gray-100">Edit</button>
                        <button title="Activate/Deactivate" onClick={() => toggleActive(plan)} className="rounded p-1.5 hover:bg-gray-100"><Power size={16} /></button>
                        <button title="Duplicate" onClick={() => duplicate(plan.id)} className="rounded p-1.5 hover:bg-gray-100"><Copy size={16} /></button>
                        <button title="Delete" onClick={() => remove(plan.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
