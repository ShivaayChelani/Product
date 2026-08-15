import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface RedemptionRow {
  id: string;
  receiptNumber: string | null;
  status: string;
  pointsSpent: number;
  discountValue: number;
  discountType: string;
  createdAt: string;
  verifiedAt: string | null;
  refundedAt: string | null;
  notes: string | null;
  offer: { title: string } | null;
  user: { id: string; name: string; email: string } | null;
  vendor: { id: string; businessName: string; vendorCode: string | null } | null;
  refundedBy: { id: string; name: string } | null;
}

export async function listRedemptions(params?: {
  page?: number;
  limit?: number;
  status?: string;
  receiptNumber?: string;
  vendorSearch?: string;
  userSearch?: string;
  vendorId?: string;
  userId?: string;
}): Promise<PaginatedResponse<RedemptionRow>> {
  const res = await client.get<PaginatedResponse<RedemptionRow>>("/redemptions/admin/all", { params });
  return res.data;
}

export async function refundRedemption(id: string, notes?: string): Promise<RedemptionRow> {
  const res = await client.post<SingleResponse<RedemptionRow>>(`/redemptions/${id}/refund`, { notes });
  return res.data.data;
}

export async function getFraudAlerts() {
  const res = await client.get<SingleResponse<{ auditLogs: unknown[]; notifications: unknown[] }>>(
    "/redemptions/admin/fraud-alerts",
  );
  return res.data.data;
}

export function exportRedemptionsUrl(params?: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v) qs.set(k, v);
  }
  const q = qs.toString();
  return `/api/proxy/redemptions/admin/export${q ? `?${q}` : ""}`;
}

export async function getOfferAnalytics(
  offerId: string,
  period: "7d" | "30d" | "90d" = "30d",
  granularity: "daily" | "weekly" | "monthly" = "daily",
) {
  const res = await client.get<SingleResponse<any>>(`/vendors/admin/offers/${offerId}/analytics`, {
    params: { period, granularity },
  });
  return res.data.data;
}
