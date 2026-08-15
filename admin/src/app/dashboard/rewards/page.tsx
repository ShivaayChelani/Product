"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Gift, Wallet, Receipt, Sparkles, ShieldAlert, RefreshCw, ArrowRight,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonCards } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import client from "@/services/client";
import { listRedemptions, getFraudAlerts } from "@/services/redemptions";
import { getCampaigns } from "@/services/campaigns";

type RewardsOverview = {
  walletsWithBalance: number;
  redemptionsTotal: number;
  pendingRedemptions: number;
  activeCampaigns: number;
  fraudAlerts: number;
};

const MODULES = [
  { href: "/dashboard/wallets", label: "Wallet", description: "User balances, PalPoints, and manual adjustments", icon: Wallet },
  { href: "/dashboard/palpoints", label: "PalPoints", description: "Point rules, earning, and spending ledger", icon: Sparkles },
  { href: "/dashboard/monetization/transactions", label: "Transactions", description: "Subscription and payment transactions", icon: Receipt },
  { href: "/dashboard/campaigns", label: "Campaigns", description: "Reward campaigns and promotional programs", icon: Gift },
  { href: "/dashboard/redemptions", label: "Redemptions", description: "Offer redemptions and QR verification", icon: Receipt },
  { href: "/dashboard/fraud-detection", label: "Fraud Detection", description: "Suspicious redemption patterns and alerts", icon: ShieldAlert },
];

export default function RewardsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<RewardsOverview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [redemptionsRes, pendingRes, fraud, campaignsRes, leaderboardRes] = await Promise.all([
        listRedemptions({ limit: 1, page: 1 }),
        listRedemptions({ limit: 1, page: 1, status: "PENDING" }),
        getFraudAlerts(),
        getCampaigns({ limit: 100, page: 1 }),
        client.get<{ pagination?: { total: number }; data?: unknown[] }>("/wallet/leaderboard", { params: { limit: 1, page: 1 } }),
      ]);

      const campaigns = campaignsRes.data ?? [];
      setOverview({
        walletsWithBalance: leaderboardRes.data?.pagination?.total ?? 0,
        redemptionsTotal: redemptionsRes.pagination?.total ?? 0,
        pendingRedemptions: pendingRes.pagination?.total ?? 0,
        activeCampaigns: campaigns.filter((c: { status?: string }) =>
          c.status === "ACTIVE" || c.status === "RUNNING",
        ).length,
        fraudAlerts: (fraud?.auditLogs?.length ?? 0) + (fraud?.notifications?.length ?? 0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rewards overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="animate-fade-in"><SkeletonCards count={4} /></div>;

  if (error && !overview) {
    return (
      <EmptyState
        icon={Gift}
        title="Rewards overview unavailable"
        description={error}
        action={<button type="button" onClick={() => load()} className="admin-btn-primary">Retry</button>}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Rewards"
        description="Wallet, PalPoints, transactions, campaigns, redemptions, and fraud monitoring."
        icon={Gift}
        actions={
          <button type="button" onClick={() => load()} className="admin-btn-secondary">
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Wallets with Balance</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{overview?.walletsWithBalance?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Total Redemptions</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{overview?.redemptionsTotal?.toLocaleString() ?? 0}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Pending Redemptions</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-600">{overview?.pendingRedemptions ?? 0}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Fraud Alerts</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">{overview?.fraudAlerts ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => (
          <Link
            key={mod.label}
            href={mod.href}
            className="admin-card group flex gap-4 p-5 transition hover:border-primary/30 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
              <mod.icon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{mod.label}</h2>
                <ArrowRight size={16} className="text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
