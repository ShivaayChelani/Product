"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Store, Receipt, Star, Diamond, Video, TrendingUp, TrendingDown,
  Clock, MapPin, Activity, Database, CheckCircle2, AlertCircle, LayoutDashboard, Clapperboard,
} from "lucide-react";
import client from "@/services/client";
import { getHealth } from "@/services/apiMonitor";
import { getCanonicalStatus } from "@/services/canonical";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonCards } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import NeedsAttention from "@/components/NeedsAttention";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

interface DashboardData {
  kpis: {
    totalUsers: { value: number; prev: number };
    dau: { value: number; prev: number };
    mau: { value: number; prev: number };
    activeVendors: { value: number; prev: number };
    qrRedemptions: { value: number; prev: number };
    hiddenGems: { value: number };
    reelsUploaded: { value: number; prev: number };
  };
  charts: {
    userGrowth: { date: string; newUsers: number; dau: number; mau: number }[];
    vendorGrowth: { date: string; vendors: number }[];
    redemptionsPie: { name: string; value: number }[];
  };
  cityAnalytics: { city: string; users: number; growth: number }[];
  pendingApprovals: { hiddenGems: number; vendors: number };
  recentActivity: { id: string; action: string; user: string; target: string; time: string }[];
  quickStats: { newUsers: number; reelsUploaded: number; reviews: number; checkIns: number; qrRedeemed: number };
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [chartsReady, setChartsReady] = useState(false);
  const [adminName, setAdminName] = useState("Admin");
  const [systemHealth, setSystemHealth] = useState<{
    api: "up" | "down" | "unknown";
    database: "up" | "down" | "unknown";
    places: number;
  }>({ api: "unknown", database: "unknown", places: 0 });

  useEffect(() => {
    setChartsReady(true);
  }, []);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      if (user?.name) setAdminName(user.name.split(" ")[0] || user.name);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function fetchStats() {
      setLoadError("");
      try {
        const res = await client.get<{ success: boolean; data: DashboardData }>("/analytics/dashboard");
        setData(res.data.data);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (e instanceof Error ? e.message : "Failed to load dashboard analytics");
        setLoadError(msg);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  useEffect(() => {
    Promise.all([
      getHealth().catch(() => null),
      getCanonicalStatus().catch(() => null),
    ]).then(([health, canonical]) => {
      setSystemHealth({
        api: health?.success ? "up" : health ? "down" : "unknown",
        database: health?.data?.database ?? "unknown",
        places: canonical?.places?.total ?? 0,
      });
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        <NeedsAttention />
        <SkeletonCards count={8} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <NeedsAttention />
        <EmptyState
          title="Failed to load dashboard"
          description={loadError || "The analytics service may be unavailable. Check API Monitor and retry."}
          action={
            <button type="button" onClick={() => window.location.reload()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      </div>
    );
  }

  const d = data;

  const renderTrend = (current: number, prev: number) => {
    if (prev === 0) {
      // Honest fallback: with no prior-period baseline a percentage is
      // meaningless — show "New" instead of fabricating +100%.
      return current > 0 ? (
        <span className="text-emerald-500 text-xs font-semibold flex items-center"><TrendingUp size={12} className="mr-1"/> New</span>
      ) : null;
    }
    const diff = current - prev;
    const pct = (diff / prev) * 100;
    if (pct >= 0) return <span className="text-emerald-500 text-xs font-semibold flex items-center"><TrendingUp size={12} className="mr-1"/> +{pct.toFixed(1)}%</span>;
    return <span className="text-red-500 text-xs font-semibold flex items-center"><TrendingDown size={12} className="mr-1"/> {pct.toFixed(1)}%</span>;
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      <PageHeader
        title={`Welcome back, ${adminName}`}
        description="Executive overview of PalSafar platform performance and system health."
        icon={LayoutDashboard}
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock size={16} />
            {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        }
      />

      <NeedsAttention />

      {/* System health */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/dashboard/api-monitor" className="admin-card flex items-center gap-4 p-4 transition hover:border-primary/30">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${systemHealth.api === "up" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
            {systemHealth.api === "up" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">API Status</p>
            <p className="font-semibold capitalize">{systemHealth.api === "unknown" ? "Checking…" : systemHealth.api}</p>
          </div>
          <Activity size={16} className="ml-auto text-muted-foreground" />
        </Link>
        <Link href="/dashboard/database-health" className="admin-card flex items-center gap-4 p-4 transition hover:border-primary/30">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${systemHealth.database === "up" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
            <Database size={20} />
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Database</p>
            <p className="font-semibold capitalize">{systemHealth.database === "unknown" ? "Checking…" : systemHealth.database}</p>
          </div>
        </Link>
        <Link href="/dashboard/places" className="admin-card flex items-center gap-4 p-4 transition hover:border-primary/30">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <MapPin size={20} />
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Places in corpus</p>
            <p className="font-semibold tabular-nums">{systemHealth.places.toLocaleString()}</p>
          </div>
        </Link>
      </div>

      {/* Today's activity */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { title: "Today's Users", value: d.quickStats?.newUsers ?? 0, icon: Users },
          { title: "Today's Uploads", value: d.quickStats?.reelsUploaded ?? 0, icon: Clapperboard },
          { title: "Today's Reviews", value: d.quickStats?.reviews ?? 0, icon: Star },
          { title: "Check-ins", value: d.quickStats?.checkIns ?? 0, icon: MapPin },
          { title: "QR Redemptions", value: d.quickStats?.qrRedeemed ?? 0, icon: Receipt },
        ].map((stat) => (
          <div key={stat.title} className="admin-card p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <stat.icon size={16} />
              <span className="text-xs font-medium">{stat.title}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        {[
          { title: "Total Places", value: systemHealth.places, icon: MapPin, href: "/dashboard/places" },
          { title: "Total Users", value: d.kpis?.totalUsers?.value || 0, prev: d.kpis?.totalUsers?.prev || 0, icon: Users, color: "text-blue-600", bg: "bg-blue-100" },
          { title: 'DAU', value: d.kpis?.dau?.value || 0, prev: d.kpis?.dau?.prev || 0, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { title: 'MAU', value: d.kpis?.mau?.value || 0, prev: d.kpis?.mau?.prev || 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-100' },
          { title: 'Active Vendors', value: d.kpis?.activeVendors?.value || 0, prev: d.kpis?.activeVendors?.prev || 0, icon: Store, color: 'text-orange-500', bg: 'bg-orange-100' },
          { title: 'Offer Redemptions', value: d.kpis?.qrRedemptions?.value || 0, prev: d.kpis?.qrRedemptions?.prev || 0, icon: Receipt, color: 'text-pink-600', bg: 'bg-pink-100' },
          { title: 'Hidden Gems', value: d.kpis?.hiddenGems?.value || 0, subtitle: 'Pending Approval', icon: Diamond, color: 'text-teal-600', bg: 'bg-teal-100' },
          { title: 'Moments Uploaded', value: d.kpis?.reelsUploaded?.value || 0, prev: d.kpis?.reelsUploaded?.prev || 0, icon: Video, color: 'text-blue-500', bg: 'bg-blue-100' },
        ].map((kpi, i) => {
          const content = (
            <>
              <div className={`w-8 h-8 rounded-lg ${kpi.bg || "bg-blue-100"} flex items-center justify-center mb-3`}>
                <kpi.icon size={16} className={kpi.color || "text-blue-600"} />
              </div>
              <div>
                <p className="mb-1 truncate text-xs font-medium text-muted-foreground">{kpi.title}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-foreground">{kpi.value.toLocaleString()}</span>
                  {"prev" in kpi && kpi.prev !== undefined && renderTrend(kpi.value as number, kpi.prev as number)}
                </div>
                {"subtitle" in kpi && kpi.subtitle && <p className="text-[10px] text-orange-500 font-medium mt-1">{kpi.subtitle}</p>}
                {"prev" in kpi && kpi.prev !== undefined && <p className="mt-1 text-[10px] text-muted-foreground">vs last 30 days</p>}
              </div>
            </>
          );
          return "href" in kpi && kpi.href ? (
            <Link key={i} href={kpi.href} className="admin-card p-4 flex flex-col justify-between transition hover:border-primary/30">
              {content}
            </Link>
          ) : (
            <div key={i} className="admin-card p-4 flex flex-col justify-between">
              {content}
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Growth */}
        <div className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="min-w-0 text-sm font-bold text-foreground">User Growth <span className="font-normal text-muted-foreground">(Last 30 Days)</span></h2>
            <Link href="/dashboard/analytics" className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full">View All</Link>
          </div>
          <div className="h-64 min-h-[256px] min-w-0 w-full">
            {chartsReady ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
              <AreaChart data={d.charts?.userGrowth || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDau" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorMau" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6B7280'}} minTickGap={30} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6B7280'}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                <Area type="monotone" name="New Users" dataKey="newUsers" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorNew)" />
                <Area type="monotone" name="DAU" dataKey="dau" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorDau)" />
                <Area type="monotone" name="MAU" dataKey="mau" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorMau)" />
              </AreaChart>
            </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        {/* Vendor Growth */}
        <div className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="min-w-0 text-sm font-bold text-foreground">Vendor Growth <span className="font-normal text-muted-foreground">(Last 30 Days)</span></h2>
            <Link href="/dashboard/vendors" className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full">View All</Link>
          </div>
          <div className="h-64 min-h-[256px] min-w-0 w-full">
            {chartsReady ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
              <LineChart data={d.charts?.vendorGrowth || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6B7280'}} minTickGap={30} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6B7280'}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="vendors" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        {/* Offer Redemptions Overview */}
        <div className="admin-card flex flex-col p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="min-w-0 text-sm font-bold text-foreground">Offer Redemptions</h2>
            <Link href="/dashboard/monetization/revenue" className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full">View All</Link>
          </div>
          <div className="flex-1 flex items-center">
          <div className="w-1/3">
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Total</p>
              <p className="text-xl font-bold text-blue-600">{(d.kpis?.qrRedemptions?.value || 0).toLocaleString()}</p>
            </div>
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Previous Period</p>
              <p className="text-xl font-bold text-foreground">{(d.kpis?.qrRedemptions?.prev || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">vs Last 30 Days</p>
              <p className="mt-1 text-lg font-bold">{(d.kpis?.qrRedemptions?.prev || 0) > 0
                ? renderTrend(d.kpis?.qrRedemptions?.value || 0, d.kpis?.qrRedemptions?.prev || 0)
                : <span className="text-muted-foreground">N/A</span>
              }</p>
            </div>
          </div>
            <div className="w-2/3 h-64 min-h-[256px] min-w-0">
              {chartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} initialDimension={{ width: 640, height: 256 }}>
                <PieChart>
                  <Pie data={d.charts?.redemptionsPie || []} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {(d.charts?.redemptionsPie || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} layout="horizontal" verticalAlign="bottom" align="center" />
                </PieChart>
              </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* City Analytics */}
        <div className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">City Analytics</h2>
            <Link href="/dashboard/analytics" className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full">View All</Link>
          </div>
          <div className="space-y-4">
            {(d.cityAnalytics || []).map((city, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">{i + 1}</div>
                  <span className="text-sm font-medium text-foreground">{city.city}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">{city.users.toLocaleString()} Users</span>
                  {typeof city.growth === "number" ? (
                    <span className={`w-10 text-right text-xs font-bold ${city.growth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {city.growth >= 0 ? "↑" : "↓"} {Math.abs(city.growth)}%
                    </span>
                  ) : (
                    <span className="w-10 text-right text-xs font-bold text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center opacity-30" aria-hidden="true">
            <MapPin size={120} className="text-blue-200" />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="admin-card p-5">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
            <Link href="/dashboard/audit-logs" className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full">View All</Link>
          </div>
          <div className="relative space-y-5">
            <div className="absolute bottom-2 left-[11px] top-2 z-0 w-px bg-border"></div>
            {(d.recentActivity || []).map((act, i) => (
              <div key={i} className="relative z-10 flex gap-4">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-card">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                </div>
                <div className="flex-1">
                  <p className="text-xs leading-snug text-foreground"><span className="font-semibold">{act.user}</span> {act.action} {act.target}</p>
                </div>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">{new Date(act.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="admin-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Quick Stats <span className="font-normal text-muted-foreground">(Today)</span></h2>
        </div>
        <div className="flex items-center gap-8 overflow-x-auto pb-2 custom-scrollbar">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Users size={14}/></div>
            <div><p className="text-[10px] font-medium text-muted-foreground">New Users</p><p className="text-sm font-bold text-foreground">{d.quickStats?.newUsers || 0}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center"><Video size={14}/></div>
            <div><p className="text-[10px] font-medium text-muted-foreground">Moments Uploaded</p><p className="text-sm font-bold text-foreground">{d.quickStats?.reelsUploaded || 0}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center"><Star size={14}/></div>
            <div><p className="text-[10px] font-medium text-muted-foreground">Reviews</p><p className="text-sm font-bold text-foreground">{d.quickStats?.reviews || 0}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><MapPin size={14}/></div>
            <div><p className="text-[10px] font-medium text-muted-foreground">Check-ins</p><p className="text-sm font-bold text-foreground">{d.quickStats?.checkIns || 0}</p></div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Receipt size={14}/></div>
            <div><p className="text-[10px] font-medium text-muted-foreground">Redeemed Today</p><p className="text-sm font-bold text-foreground">{d.quickStats?.qrRedeemed || 0}</p></div>
          </div>
        </div>
      </div>

    </div>
  );
}
