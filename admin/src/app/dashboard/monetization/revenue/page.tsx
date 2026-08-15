"use client";

import { useEffect, useState } from "react";
import { DollarSign, CreditCard, RotateCcw, Users } from "lucide-react";
import { monetizationApi } from "@/services/monetization";
import StatCard from "@/components/StatCard";

export default function PlatformRevenuePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await monetizationApi.revenue();
        setData((res.data as any).data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Revenue</h1>
        <p className="text-sm text-gray-500">Money collected via IAP and Razorpay (distinct from PalPoints offer redemptions).</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Captured" value={`₹${((data?.capturedAmountPaise || 0) / 100).toFixed(2)}`} icon={DollarSign} color="emerald" />
        <StatCard title="Payments" value={String(data?.capturedCount || 0)} icon={CreditCard} color="blue" />
        <StatCard title="Refunded" value={`₹${((data?.refundedAmountPaise || 0) / 100).toFixed(2)}`} icon={RotateCcw} color="orange" />
        <StatCard title="Active subscriptions" value={String(data?.activeSubscriptions || 0)} icon={Users} color="purple" />
      </div>
    </div>
  );
}
