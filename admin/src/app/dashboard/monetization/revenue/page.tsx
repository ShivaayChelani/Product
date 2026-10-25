"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, CreditCard, RotateCcw, Users, AlertCircle, RefreshCw } from "lucide-react";
import { monetizationApi } from "@/services/monetization";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

type RevenueSummary = {
  capturedAmountPaise?: number;
  capturedCount?: number;
  refundedAmountPaise?: number;
  activeSubscriptions?: number;
};

export default function PlatformRevenuePage() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await monetizationApi.revenue();
      const payload = (res.data as { data?: RevenueSummary }).data ?? (res.data as RevenueSummary);
      setData(payload ?? null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Revenue"
        description="Money collected via IAP and Razorpay (distinct from PalPoints offer redemptions)."
        icon={DollarSign}
        actions={
          <button type="button" onClick={() => void load()} className="admin-btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {error ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load revenue"
          description={error}
          action={
            <button type="button" onClick={() => void load()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard title="Captured" value={`₹${((data?.capturedAmountPaise || 0) / 100).toFixed(2)}`} icon={DollarSign} color="emerald" />
          <StatCard title="Payments" value={String(data?.capturedCount || 0)} icon={CreditCard} color="blue" />
          <StatCard title="Refunded" value={`₹${((data?.refundedAmountPaise || 0) / 100).toFixed(2)}`} icon={RotateCcw} color="orange" />
          <StatCard title="Active subscriptions" value={String(data?.activeSubscriptions || 0)} icon={Users} color="purple" />
        </div>
      )}
    </div>
  );
}
