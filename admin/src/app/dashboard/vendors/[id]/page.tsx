"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Store, ArrowLeft, RefreshCw, MapPin, Phone, Mail, FileText, Receipt,
} from "lucide-react";
import { getVendorDetail, resetVendorCode } from "@/services/vendors";
import { useNotification } from "@/components/Notification";
import StatusBadge from "@/components/StatusBadge";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function VendorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { notify } = useNotification();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await getVendorDetail(id);
      setData(detail);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResetCode = async () => {
    try {
      await resetVendorCode(id);
      notify("success", "Vendor code reset");
      setConfirmReset(false);
      load();
    } catch {
      notify("error", "Failed to reset vendor code");
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading vendor...</div>;
  }

  if (!data?.vendor) {
    return (
      <div className="p-8">
        <p className="text-red-600">Vendor not found.</p>
        <Link href="/dashboard/vendors" className="text-indigo-600 text-sm mt-2 inline-block">← Back to vendors</Link>
      </div>
    );
  }

  const v = data.vendor;
  const stats = data.stats || {};

  const redemptionColumns: Column<any>[] = [
    { key: "receiptNumber", header: "Receipt", render: (r) => <span className="font-mono text-xs">{r.receiptNumber || "—"}</span> },
    { key: "offer", header: "Offer", render: (r) => r.offer?.title || "Points transfer" },
    { key: "user", header: "User", render: (r) => r.user?.name || "—" },
    { key: "pointsSpent", header: "Points" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "createdAt",
      header: "Date",
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/vendors" className="rounded-lg p-2 hover:bg-gray-100">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{v.businessName}</h1>
            <p className="text-sm text-gray-500">{v.businessType.replace(/_/g, " ")} · {v.city}, {v.state}</p>
          </div>
        </div>
        <button
          onClick={() => setConfirmReset(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          <RefreshCw size={16} /> Reset Vendor Code
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: "Vendor Code", value: v.vendorCode || "—" },
          { label: "Customers", value: stats.uniqueCustomers ?? 0 },
          { label: "Active Offers", value: stats.activeOffers ?? 0 },
          { label: "Paused Offers", value: stats.pausedOffers ?? 0 },
          { label: "Total Redemptions", value: stats.totalRedemptions ?? 0 },
          { label: "Today Redemptions", value: stats.todayRedemptions ?? 0 },
          { label: "Total Revenue", value: `₹${Math.round(stats.totalRevenue ?? 0)}` },
          { label: "PalPoints Used", value: stats.totalPalPointsUsed ?? 0 },
          { label: "Listing", value: data.listing?.mapListing || (data.listing?.visible ? "Active" : "Hidden") },
          { label: "Offers used", value: data.listing?.offersLimit != null && data.listing.offersLimit < 0 ? "Unlimited" : `${data.listing?.offersUsed ?? stats.activeOffers ?? 0}${data.listing?.offersLimit != null ? ` / ${data.listing.offersLimit}` : ""}` },
          { label: "Reels used", value: data.listing?.reelsLimit != null && data.listing.reelsLimit < 0 ? "Unlimited" : `${data.listing?.reelsUsedThisMonth ?? 0}${data.listing?.reelsLimit != null ? ` / ${data.listing.reelsLimit}` : ""}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Store size={18} /> Business Info</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Status</span><div className="mt-1"><StatusBadge status={v.status} /></div></div>
            <div><span className="text-gray-500">Phone</span><p className="mt-1 flex items-center gap-1"><Phone size={14} />{v.phone}</p></div>
            <div className="col-span-2"><span className="text-gray-500">Address</span><p className="mt-1 flex items-center gap-1"><MapPin size={14} />{v.address}</p></div>
            <div><span className="text-gray-500">Owner</span><p className="mt-1 flex items-center gap-1"><Mail size={14} />{v.user?.email}</p></div>
            <div><span className="text-gray-500">GST</span><p className="mt-1">{v.gstNumber || "—"}</p></div>
          </div>
          {v.description && <p className="mt-4 text-sm text-gray-600">{v.description}</p>}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><FileText size={18} /> Subscription & KYC</h2>
          <div className="mb-4 text-sm">
            <span className="text-gray-500">Subscription</span>
            <p className="mt-1 font-medium">
              {data.subscription?.plan?.name || data.subscription?.status || v.subscriptionStatus || "None"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Listing {data.listing?.status || "SUBSCRIPTION_REQUIRED"} · {data.listing?.visible ? "public" : "hidden"}
            </p>
            {data.subscription?.currentPeriodEnd && (
              <p className="text-xs text-gray-500 mt-1">
                {new Date(data.subscription.currentPeriodEnd) > new Date() ? "Expires" : "Expired"} {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Documents</h3>
          {(v.documents || []).length === 0 && (v.vendorDocuments || []).length === 0 ? (
            <p className="text-sm text-gray-400">No documents uploaded</p>
          ) : (
            <ul className="space-y-2">
              {(v.documents || []).map((url: string, i: number) => (
                <li key={url}><a href={url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline">Document {i + 1}</a></li>
              ))}
              {(v.vendorDocuments || []).map((d: any) => (
                <li key={d.id}><a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline">{d.type} — {d.status}</a></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {data.analytics?.overview && (
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Analytics (30 days)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Views</p><p className="text-xl font-bold">{data.analytics.overview.totalViews}</p></div>
            <div><p className="text-gray-500">Clicks</p><p className="text-xl font-bold">{data.analytics.overview.totalClicks}</p></div>
            <div><p className="text-gray-500">Redemptions</p><p className="text-xl font-bold">{data.analytics.overview.verifiedRedemptions}</p></div>
            <div><p className="text-gray-500">Revenue Impact</p><p className="text-xl font-bold">₹{Math.round(data.analytics.overview.revenueImpact || 0)}</p></div>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Offers ({v.offers?.length || 0})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Title</th><th>Status</th><th>Redemptions</th><th>Views</th><th>Clicks</th></tr></thead>
            <tbody>
              {(v.offers || []).map((o: any) => (
                <tr key={o.id} className="border-b border-gray-50">
                  <td className="py-2 font-medium">{o.title}</td>
                  <td><StatusBadge status={o.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                  <td>{o.currentRedemptions ?? 0}</td>
                  <td>{o.viewCount ?? 0}</td>
                  <td>{o.clickCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Receipt size={18} /> Redemptions</h2>
        <DataTable
          columns={redemptionColumns}
          data={data.redemptions || []}
          emptyMessage="No redemptions yet"
        />
      </div>

      {(data.vendor?.vendorReviews?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Reviews</h2>
          <ul className="space-y-3">
            {(data.vendor.vendorReviews || []).map((r: any) => (
              <li key={r.id} className="border-b border-gray-50 pb-3 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{r.user?.name || "User"}</span>
                  <span className="text-xs text-amber-600">★ {r.rating}</span>
                </div>
                {r.comment && <p className="text-sm text-gray-600 mt-1">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data.auditLogs?.length ?? 0) > 0 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Activity / Audit Log</h2>
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {(data.auditLogs || []).map((log: any) => (
              <li key={log.id} className="text-sm border-b border-gray-50 py-2">
                <span className="font-medium">{log.action}</span>
                <span className="text-gray-500"> · {log.actor?.name || "System"}</span>
                <span className="text-gray-400 text-xs block">{new Date(log.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset Vendor Code"
        message="Generate a new vendor code? The old code will stop working immediately."
        variant="primary"
        onConfirm={handleResetCode}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
