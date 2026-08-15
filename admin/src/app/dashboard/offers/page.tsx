"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Tag,
  Star,
  Ban,
  CheckCircle,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  BarChart2,
} from "lucide-react";
import { getOfferAnalytics } from "@/services/redemptions";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import client from "@/services/client";
import type { PaginatedResponse } from "@/types";

export interface AdminOffer {
  id: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  pointsRequired: number;
  isApproved: boolean;
  isActive: boolean;
  isFeatured: boolean;
  rejectionReason: string | null;
  currentRedemptions: number;
  viewCount: number;
  clickCount: number;
  createdAt: string;
  vendor: {
    id: string;
    businessName: string;
    businessType: string;
    city: string;
    state: string;
  };
}

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Featured", value: "featured" },
  { label: "Moderated", value: "moderated" },
] as const;

function getOfferStatus(offer: AdminOffer): string {
  if (offer.rejectionReason) return "MODERATED";
  if (!offer.isActive) return "INACTIVE";
  if (offer.isFeatured) return "FEATURED";
  return "ACTIVE";
}

export default function OffersPage() {
  const { notify } = useNotification();
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [search, setSearch] = useState("");

  const [moderateDialog, setModerateDialog] = useState<{
    open: boolean;
    offerId: string;
    offerTitle: string;
    reason: string;
    action: "disable" | "remove";
  }>({ open: false, offerId: "", offerTitle: "", reason: "", action: "disable" });

  const [analyticsOffer, setAnalyticsOffer] = useState<AdminOffer | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [analyticsGranularity, setAnalyticsGranularity] = useState<"daily" | "weekly" | "monthly">("daily");

  const [totalListed, setTotalListed] = useState(0);
  const [statTotals, setStatTotals] = useState({ active: 0, featured: 0, moderated: 0 });

  const fetchOffers = useCallback(async (status: string, p: number, q?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: 20 };
      if (status) params.status = status;
      if (q) params.search = q;
      const res = await client.get<PaginatedResponse<AdminOffer>>("/vendors/admin/offers/all", { params });
      setOffers(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
      setHasNext(res.data.pagination.hasNext);
      setHasPrev(res.data.pagination.hasPrev);
      setPage(res.data.pagination.page);
      setTotalListed(res.data.pagination.total);

      // Global counts for header cards (independent of current tab page).
      if (!status && !q) {
        const [activeRes, featuredRes, moderatedRes] = await Promise.all([
          client.get<PaginatedResponse<AdminOffer>>("/vendors/admin/offers/all", {
            params: { page: 1, limit: 1, status: "active" },
          }),
          client.get<PaginatedResponse<AdminOffer>>("/vendors/admin/offers/all", {
            params: { page: 1, limit: 1, status: "featured" },
          }),
          client.get<PaginatedResponse<AdminOffer>>("/vendors/admin/offers/all", {
            params: { page: 1, limit: 1, status: "moderated" },
          }),
        ]);
        setStatTotals({
          active: activeRes.data.pagination.total,
          featured: featuredRes.data.pagination.total,
          moderated: moderatedRes.data.pagination.total,
        });
      }
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers(activeTab, 1, search);
  }, [activeTab, fetchOffers, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOffers(activeTab, 1, search);
  };

  const toggleFeature = async (offer: AdminOffer) => {
    setActionLoading(offer.id);
    try {
      await client.patch(`/vendors/admin/offers/${offer.id}/feature`, {
        isFeatured: !offer.isFeatured,
      });
      notify("success", offer.isFeatured ? "Offer unfeatured" : "Offer featured");
      fetchOffers(activeTab, page, search);
    } catch {
      notify("error", "Failed to update featured status");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleActive = async (offer: AdminOffer) => {
    setActionLoading(offer.id);
    try {
      if (offer.isActive) {
        await client.patch(`/vendors/admin/offers/${offer.id}/disable`, {
          reason: "Disabled by admin",
        });
        notify("success", "Offer disabled");
      } else {
        await client.patch(`/vendors/admin/offers/${offer.id}/enable`);
        notify("success", "Offer enabled");
      }
      fetchOffers(activeTab, page, search);
    } catch {
      notify("error", "Failed to update offer status");
    } finally {
      setActionLoading(null);
    }
  };

  const openModerateDialog = (offer: AdminOffer, action: "disable" | "remove") => {
    setModerateDialog({
      open: true,
      offerId: offer.id,
      offerTitle: offer.title,
      reason: "",
      action,
    });
  };

  const openAnalytics = async (offer: AdminOffer, period: "7d" | "30d" | "90d" = analyticsPeriod, granularity: "daily" | "weekly" | "monthly" = analyticsGranularity) => {
    setAnalyticsOffer(offer);
    setAnalyticsLoading(true);
    try {
      const data = await getOfferAnalytics(offer.id, period, granularity);
      setAnalyticsData(data);
    } catch {
      setAnalyticsData(null);
      notify("error", "Failed to load offer analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const executeModerate = async () => {
    const { offerId, reason, action } = moderateDialog;
    if (!reason.trim()) {
      notify("error", "Please provide a moderation reason");
      return;
    }
    setActionLoading(offerId);
    try {
      await client.patch(`/vendors/admin/offers/${offerId}/moderate`, { reason, action });
      notify("success", action === "remove" ? "Offer removed" : "Offer moderated");
      setModerateDialog((d) => ({ ...d, open: false }));
      fetchOffers(activeTab, page, search);
    } catch {
      notify("error", "Moderation action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const statCards = [
    { label: "Listed", value: totalListed, color: "bg-blue-500" },
    { label: "Active", value: statTotals.active, color: "bg-emerald-500" },
    { label: "Featured", value: statTotals.featured, color: "bg-yellow-500" },
    { label: "Moderated", value: statTotals.moderated, color: "bg-red-500" },
  ];

  const discountLabel = (offer: AdminOffer) => {
    const t = String(offer.discountType || "").toLowerCase();
    if (t === "percentage" || t === "percent") return `${offer.discountValue}%`;
    if (t === "flat" || t === "fixed") return `₹${offer.discountValue}`;
    if (t === "freebie") return "Freebie";
    return `${offer.discountValue} ${offer.discountType}`;
  };

  const columns: Column<AdminOffer & Record<string, unknown>>[] = [
    {
      key: "title",
      header: "Title",
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <Tag size={18} className="text-indigo-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{item.title}</p>
            {item.isFeatured && (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                <Star size={12} fill="currentColor" /> Featured
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (item) => (
        <span className="text-sm text-gray-600">{item.vendor.businessName}</span>
      ),
    },
    {
      key: "discountValue",
      header: "Discount",
      render: (item) => (
        <span className="text-sm text-gray-700">{discountLabel(item)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={getOfferStatus(item)} />,
    },
    {
      key: "metrics",
      header: "Analytics",
      render: (item) => (
        <div className="text-xs text-gray-600">
          <div>{item.viewCount} views · {item.clickCount} clicks</div>
          <div>{item.currentRedemptions} redemptions</div>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (item) => (
        <span className="text-sm text-gray-500">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openAnalytics(item)}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
            title="Analytics"
          >
            <BarChart2 size={16} />
          </button>
          <button
            onClick={() => toggleFeature(item)}
            disabled={actionLoading === item.id}
            className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
              item.isFeatured
                ? "text-yellow-600 hover:bg-yellow-50"
                : "text-gray-400 hover:bg-gray-50 hover:text-yellow-600"
            }`}
            title={item.isFeatured ? "Unfeature" : "Feature"}
          >
            <Star size={16} fill={item.isFeatured ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => toggleActive(item)}
            disabled={actionLoading === item.id}
            className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
              item.isActive
                ? "text-orange-600 hover:bg-orange-50"
                : "text-emerald-600 hover:bg-emerald-50"
            }`}
            title={item.isActive ? "Disable" : "Enable"}
          >
            {item.isActive ? <Ban size={16} /> : <CheckCircle size={16} />}
          </button>
          <button
            onClick={() => openModerateDialog(item, "disable")}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-amber-600 transition hover:bg-amber-50 disabled:opacity-50"
            title="Moderate"
          >
            <ShieldAlert size={16} />
          </button>
          <button
            onClick={() => openModerateDialog(item, "remove")}
            disabled={actionLoading === item.id}
            className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            title="Remove"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vendor offers go live immediately on creation. View, search, feature, disable, remove, or moderate offers here.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">{card.label}</span>
              <div className={`h-2.5 w-2.5 rounded-full ${card.color}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setPage(1); }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search offers..."
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Search
          </button>
        </form>
      </div>

      <DataTable
        columns={columns}
        data={offers as (AdminOffer & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={(p) => fetchOffers(activeTab, p, search)}
        emptyMessage="No offers found"
        exportFilename="vendor-offers"
      />

      {moderateDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {moderateDialog.action === "remove" ? "Remove Offer" : "Moderate Offer"}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {moderateDialog.offerTitle}
                </p>
              </div>
            </div>
            <textarea
              value={moderateDialog.reason}
              onChange={(e) =>
                setModerateDialog((d) => ({ ...d, reason: e.target.value }))
              }
              placeholder="Moderation reason..."
              rows={4}
              className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModerateDialog((d) => ({ ...d, open: false }))}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={executeModerate}
                disabled={actionLoading === moderateDialog.offerId || !moderateDialog.reason.trim()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {actionLoading === moderateDialog.offerId ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {analyticsOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{analyticsOffer.title}</h3>
                <p className="text-sm text-gray-500">{analyticsOffer.vendor.businessName}</p>
              </div>
              <button onClick={() => { setAnalyticsOffer(null); setAnalyticsData(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <button key={p} onClick={() => { setAnalyticsPeriod(p); if (analyticsOffer) openAnalytics(analyticsOffer, p, analyticsGranularity); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${analyticsPeriod === p ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>{p}</button>
              ))}
              {(["daily", "weekly", "monthly"] as const).map((g) => (
                <button key={g} onClick={() => { setAnalyticsGranularity(g); if (analyticsOffer) openAnalytics(analyticsOffer, analyticsPeriod, g); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${analyticsGranularity === g ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>{g}</button>
              ))}
            </div>
            {analyticsLoading ? (
              <p className="text-gray-500">Loading analytics…</p>
            ) : analyticsData?.metrics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Views", value: analyticsData.metrics.views },
                    { label: "Clicks", value: analyticsData.metrics.clicks },
                    { label: "Redemptions", value: analyticsData.metrics.redemptions },
                    { label: "Conversion", value: `${analyticsData.metrics.conversionRate}%` },
                    { label: "Unique Customers", value: analyticsData.metrics.uniqueCustomers },
                    { label: "PalPoints Used", value: analyticsData.metrics.palPointsUsed },
                    { label: "Revenue", value: `₹${Math.round(analyticsData.metrics.revenue)}` },
                    { label: "Status", value: analyticsData.offer?.status },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{m.label}</p>
                      <p className="font-bold">{m.value}</p>
                    </div>
                  ))}
                </div>
                {(analyticsData.trend?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Trend</h4>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-gray-500"><th>Period</th><th>Redemptions</th><th>Points</th><th>Revenue</th></tr></thead>
                      <tbody>
                        {analyticsData.trend.map((t: any) => (
                          <tr key={t.date} className="border-b border-gray-50">
                            <td className="py-1">{t.date}</td>
                            <td>{t.count}</td>
                            <td>{t.points}</td>
                            <td>₹{Math.round(t.revenue || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500">No analytics data available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
