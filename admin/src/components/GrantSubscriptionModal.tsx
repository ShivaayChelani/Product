"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  monetizationApi,
  type GrantContextCurrentSubscription,
  type GrantContextVendor,
  type SubscriptionPlan,
} from "@/services/monetization";
import { useNotification } from "@/components/Notification";
import { getApiErrorCode, getApiErrorMessage } from "@/services/client";
import {
  formatVendorPlanOption,
  GRANT_DURATION_OPTIONS,
} from "@/lib/grantSubscription";

interface Props {
  open: boolean;
  userId: string;
  userName: string;
  onClose: () => void;
  onDone: () => void;
}

type Step = "form" | "confirm";

export default function GrantSubscriptionModal({ open, userId, userName, onClose, onDone }: Props) {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [vendor, setVendor] = useState<GrantContextVendor | null>(null);
  const [current, setCurrent] = useState<GrantContextCurrentSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [durationMonths, setDurationMonths] = useState<1 | 3 | 6 | 12>(1);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setStep("form");
    setPlanId("");
    setDurationMonths(1);
    setReason("");
    setCurrent(null);
    setVendor(null);

    monetizationApi
      .getGrantContext(userId)
      .then((res) => {
        const data = res.data.data;
        setVendor(data.vendor);
        setCurrent(data.currentSubscription);
        const list = data.plans || [];
        setPlans(list);
        if (list.length) setPlanId(list[0].id);
      })
      .catch((err) => notify("error", getApiErrorMessage(err, "Failed to load grant details")))
      .finally(() => setLoading(false));
  }, [open, userId, notify]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);

  const handleReview = () => {
    if (!planId) {
      notify("error", "Select a plan");
      return;
    }
    setStep("confirm");
  };

  const handleGrant = async (confirmReplace: boolean) => {
    setSubmitting(true);
    try {
      await monetizationApi.adminGrant({
        userId,
        planId,
        durationMonths,
        reason: reason.trim() || undefined,
        confirmReplace: confirmReplace || undefined,
      });
      notify("success", "Vendor subscription granted");
      onDone();
      onClose();
    } catch (err) {
      if (getApiErrorCode(err) === "ACTIVE_SUBSCRIPTION_EXISTS") {
        setStep("confirm");
        notify("error", getApiErrorMessage(err, "Active subscription already exists. Confirm replacement."));
      } else {
        notify("error", getApiErrorMessage(err, "Grant failed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const displayName = vendor?.businessName || vendor?.name || userName;
  const durationLabel = GRANT_DURATION_OPTIONS.find((d) => d.months === durationMonths)?.label || `${durationMonths} months`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Grant Vendor Subscription</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" disabled={submitting}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="text-slate-500">Vendor</p>
                <p className="font-semibold text-slate-900">{displayName}</p>
                {vendor?.email ? <p className="text-xs text-slate-500">{vendor.email}</p> : null}
                <p className="mt-2 text-slate-500">Current subscription</p>
                {current ? (
                  <p className="font-medium text-slate-900">
                    {current.planName} · {current.status} · expires{" "}
                    {new Date(current.currentPeriodEnd).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="font-medium text-slate-900">{vendor?.subscriptionStatus || "NONE"}</p>
                )}
              </div>

              {step === "form" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Plan</label>
                    {plans.length === 0 ? (
                      <p className="text-sm text-amber-600">No active vendor plans found in the catalog.</p>
                    ) : (
                      <select
                        value={planId}
                        onChange={(e) => setPlanId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatVendorPlanOption(p)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Duration</label>
                    <select
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value) as 1 | 3 | 6 | 12)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    >
                      {GRANT_DURATION_OPTIONS.map((d) => (
                        <option key={d.months} value={d.months}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Admin note <span className="text-gray-400">— optional</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="Reason for this grant"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
                  <p>
                    Grant <span className="font-semibold">{selectedPlan ? formatVendorPlanOption(selectedPlan) : "selected plan"}</span>{" "}
                    for <span className="font-semibold">{durationLabel}</span> to {displayName}?
                  </p>
                  {current ? (
                    <p>
                      This vendor already has <span className="font-semibold">{current.planName}</span> until{" "}
                      {new Date(current.currentPeriodEnd).toLocaleDateString()}. Replacement will not shorten the remaining term —
                      expiry stays the later of the current end date and the granted duration.
                    </p>
                  ) : null}
                  <p className="text-xs text-amber-800">No Razorpay payment is created. This is an admin grant only.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          {step === "confirm" ? (
            <button
              type="button"
              onClick={() => setStep("form")}
              disabled={submitting}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {step === "form" ? (
            <button
              type="button"
              onClick={handleReview}
              disabled={loading || !planId}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Grant Subscription
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleGrant(Boolean(current))}
              disabled={submitting || !planId}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {current ? "Replace & Grant" : "Confirm Grant"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
