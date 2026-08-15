"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Users, MapPin, DollarSign, Download, RefreshCw, BarChart3, Search,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonCards, SkeletonChart } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import StatCard from "@/components/StatCard";
import { useNotification } from "@/components/Notification";
import { getAnalyticsDashboard, getUsersAnalyticsSeries, exportAnalyticsReport } from "@/services/analytics";
import { getGrowthDashboard } from "@/services/growth";
import { getCityAnalyticsDashboard } from "@/services/cityAnalytics";
import { getRevenueDashboard, exportRevenueCSV } from "@/services/revenue";
import { getCanonicalStatus } from "@/services/canonical";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "places", label: "Tourism & Places", icon: MapPin },
  { id: "revenue", label: "Revenue", icon: DollarSign },
  { id: "growth", label: "Growth & Retention", icon: TrendingUp },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PIE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function AnalyticsPage() {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [chartsReady, setChartsReady] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [growth, setGrowth] = useState<any>(null);
  const [cities, setCities] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [userSeries, setUserSeries] = useState<{ date: string; count: number }[]>([]);
  const [placesTotal, setPlacesTotal] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const [ov, gr, ci, rev, users, canonical] = await Promise.all([
        getAnalyticsDashboard().catch(() => null),
        getGrowthDashboard().catch(() => null),
        getCityAnalyticsDashboard().catch(() => null),
        getRevenueDashboard().catch(() => null),
        getUsersAnalyticsSeries().catch(() => []),
        getCanonicalStatus().catch(() => null),
      ]);
      setOverview(ov);
      setGrowth(gr);
      setCities(ci);
      setRevenue(rev);
      setUserSeries(Array.isArray(users) ? users : []);
      setPlacesTotal(canonical?.places?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const userGrowthData = useMemo(
    () => overview?.charts?.userGrowth || growth?.charts?.dailySignups || userSeries.map((r) => ({ date: r.date, newUsers: r.count })),
    [overview, growth, userSeries],
  );

  const topCities = useMemo(
    () => (cities?.topCities || overview?.cityAnalytics || []).slice(0, 10),
    [cities, overview],
  );

  const categoryDistribution = useMemo(() => {
    const byCat = revenue?.revenueByCategory || [];
    if (byCat.length) return byCat.slice(0, 8).map((r: any) => ({ name: r.category, value: Number(r.value || r.redemptions || 0) }));
    return (overview?.charts?.redemptionsPie || []).slice(0, 8);
  }, [revenue, overview]);

  const handleExport = async (type: "users" | "revenue" | "places" | "engagement") => {
    setExporting(true);
    try {
      if (type === "revenue") {
        const blob = await exportRevenueCSV({ type: "summary" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `revenue-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = await exportAnalyticsReport(type, "csv");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}-analytics.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      notify("success", "Export downloaded");
    } catch {
      notify("error", "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <SkeletonCards count={4} />
        <SkeletonChart />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Analytics unavailable"
        description={error}
        action={
          <button type="button" onClick={() => load()} className="admin-btn-primary">
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Analytics"
        description="Live platform metrics — users, tourism, revenue, growth, and retention from backend APIs."
        icon={TrendingUp}
        actions={
          <>
            <button type="button" onClick={() => load(true)} disabled={refreshing} className="admin-btn-secondary">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => handleExport(activeTab === "revenue" ? "revenue" : activeTab === "places" ? "places" : "users")}
              className="admin-btn-primary"
            >
              <Download size={16} />
              Export CSV
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Analytics sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === "overview" || activeTab === "users") && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Users" value={overview?.kpis?.totalUsers?.value ?? 0} icon={Users} color="blue" />
          <StatCard title="DAU" value={overview?.kpis?.dau?.value ?? growth?.metrics?.dau ?? 0} icon={TrendingUp} color="emerald" />
          <StatCard title="MAU" value={overview?.kpis?.mau?.value ?? growth?.metrics?.mau ?? 0} icon={Users} color="purple" />
          <StatCard title="Active Vendors" value={overview?.kpis?.activeVendors?.value ?? 0} icon={MapPin} color="orange" />
        </div>
      )}

      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="admin-card p-5">
            <h2 className="mb-4 text-sm font-bold">User Growth (30 days)</h2>
            <div className="h-64 min-h-[256px] min-w-0 w-full">
              {chartsReady && userGrowthData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
                  <AreaChart data={userGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="newUsers" stroke="#3B82F6" fill="#3B82F620" name="New Users" />
                    <Area type="monotone" dataKey="dau" stroke="#10B981" fill="#10B98120" name="DAU" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No growth data" description="User growth series will appear when signups are recorded." />
              )}
            </div>
          </div>
          <div className="admin-card p-5">
            <h2 className="mb-4 text-sm font-bold">Top Cities</h2>
            <div className="h-64 min-h-[256px] min-w-0 w-full">
              {chartsReady && topCities.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
                  <BarChart data={topCities}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="users" fill="#8B5CF6" name="Users" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No city data" description="City analytics populate as users register by location." />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="admin-card p-5">
          <h2 className="mb-4 text-sm font-bold">Daily Signups</h2>
          <div className="h-72 min-w-0 w-full">
            {chartsReady && userSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288} initialDimension={{ width: 640, height: 288 }}>
                <LineChart data={[...userSeries].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#3B82F6" name="Signups" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No signup series" description="No registration data for this period yet." />
            )}
          </div>
        </div>
      )}

      {activeTab === "places" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="admin-card p-5">
            <h2 className="mb-2 text-sm font-bold">Places Corpus</h2>
            <p className="text-3xl font-bold tabular-nums">{placesTotal.toLocaleString()}</p>
            <p className="mt-1 text-sm text-muted-foreground">Verified tourist destinations in database</p>
          </div>
          <div className="admin-card p-5">
            <h2 className="mb-4 text-sm font-bold">Reel & Content Uploads</h2>
            <p className="text-2xl font-bold tabular-nums">{overview?.kpis?.reelsUploaded?.value?.toLocaleString() ?? "—"}</p>
            <p className="text-sm text-muted-foreground">Total reels uploaded (30-day trend in dashboard)</p>
          </div>
          {topCities.length > 0 && (
            <div className="admin-card p-5 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
                <Search size={16} /> Top Cities by Users
              </h2>
              <div className="max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
                {topCities.map((c: any) => (
                  <div key={c.city} className="flex justify-between text-sm">
                    <span>{c.city}</span>
                    <span className="font-medium tabular-nums">{Number(c.users || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "revenue" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Total Redemptions"
              value={revenue?.summary?.totalRedemptions ?? overview?.kpis?.qrRedemptions?.value ?? 0}
              icon={DollarSign}
              color="emerald"
            />
            <StatCard
              title="Redemption Value"
              value={`₹${Number(revenue?.summary?.totalValue ?? 0).toLocaleString()}`}
              icon={TrendingUp}
              color="blue"
            />
            <StatCard
              title="Active Offers"
              value={revenue?.summary?.activeOffers ?? "—"}
              icon={BarChart3}
              color="purple"
            />
          </div>
          {revenue?.revenueTrend?.length > 0 && chartsReady && (
            <div className="admin-card p-5">
              <h2 className="mb-4 text-sm font-bold">Revenue Trend</h2>
              <div className="h-64 min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
                  <AreaChart data={revenue.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#10B981" fill="#10B98130" name="Value (₹)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {categoryDistribution.length > 0 && chartsReady && (
            <div className="admin-card p-5">
              <h2 className="mb-4 text-sm font-bold">Category Distribution</h2>
              <div className="h-64 min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
                  <PieChart>
                    <Pie data={categoryDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {categoryDistribution.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "growth" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="admin-card p-5">
            <h2 className="mb-4 text-sm font-bold">Retention Metrics</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">DAU / MAU ratio</dt>
                <dd className="font-semibold">
                  {growth?.metrics?.mau
                    ? `${(((growth?.metrics?.dau ?? 0) / growth.metrics.mau) * 100).toFixed(1)}%`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Weekly active users</dt>
                <dd className="font-semibold tabular-nums">{growth?.metrics?.wau?.toLocaleString() ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Monthly active users</dt>
                <dd className="font-semibold tabular-nums">{growth?.metrics?.mau?.toLocaleString() ?? "—"}</dd>
              </div>
            </dl>
          </div>
          <div className="admin-card p-5">
            <h2 className="mb-4 text-sm font-bold">Vendor Growth</h2>
            <div className="h-56 min-w-0 w-full">
              {chartsReady && (overview?.charts?.vendorGrowth?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={224} initialDimension={{ width: 640, height: 224 }}>
                  <LineChart data={overview.charts.vendorGrowth}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="vendors" stroke="#F59E0B" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No vendor growth data" description="Vendor registration trends will appear here." />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
