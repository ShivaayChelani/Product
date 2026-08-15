import client from "./client";

export type PlanAudience = "USER_PREMIUM" | "CREATOR" | "VENDOR";
export type PlanPeriod = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY" | "LIFETIME";
export type PlanStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface PlanPrice {
  id?: string;
  period: PlanPeriod;
  amountPaise: number;
  currency: string;
  isActive?: boolean;
}

export interface SubscriptionPlan {
  id: string;
  audience: PlanAudience;
  name: string;
  slug: string;
  description: string | null;
  badge: string | null;
  color: string | null;
  status: PlanStatus;
  sortOrder: number;
  features: Record<string, unknown>;
  trialDays: number;
  gracePeriodDays: number;
  googleProductIdMonthly?: string | null;
  googleProductIdYearly?: string | null;
  appleProductIdMonthly?: string | null;
  appleProductIdYearly?: string | null;
  razorpayPlanIdMonthly?: string | null;
  razorpayPlanIdYearly?: string | null;
  prices: PlanPrice[];
  limits?: Array<{ limitKey: string; limitValue: number; displayLabel?: string | null }>;
  limitSummary?: Array<{ key: string; value: number; label: string; unlimited: boolean }>;
}

export type GrantDurationMonths = 1 | 3 | 6 | 12;

export interface GrantContextVendor {
  userId: string;
  name: string;
  email: string;
  businessName: string | null;
  vendorStatus: string | null;
  subscriptionStatus: string;
}

export interface GrantContextCurrentSubscription {
  id: string;
  planId: string;
  planName: string;
  planSlug: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  provider: string;
}

export const monetizationApi = {
  listPlans(params?: { audience?: PlanAudience; status?: PlanStatus; includeInactive?: boolean }) {
    return client.get<{ success: boolean; data: SubscriptionPlan[] }>("/monetization/admin/plans", { params });
  },
  createPlan(body: Partial<SubscriptionPlan> & { prices: PlanPrice[] }) {
    return client.post<{ success: boolean; data: SubscriptionPlan }>("/monetization/admin/plans", body);
  },
  updatePlan(id: string, body: Record<string, unknown>) {
    return client.patch<{ success: boolean; data: SubscriptionPlan }>(`/monetization/admin/plans/${id}`, body);
  },
  setStatus(id: string, status: PlanStatus) {
    return client.patch<{ success: boolean; data: SubscriptionPlan }>(`/monetization/admin/plans/${id}/status`, { status });
  },
  duplicate(id: string) {
    return client.post<{ success: boolean; data: SubscriptionPlan }>(`/monetization/admin/plans/${id}/duplicate`);
  },
  remove(id: string) {
    return client.delete(`/monetization/admin/plans/${id}`);
  },
  getAds() {
    return client.get("/monetization/admin/ads");
  },
  updateAds(body: Record<string, unknown>) {
    return client.patch("/monetization/admin/ads", body);
  },
  listCoupons(q?: string) {
    return client.get("/monetization/admin/coupons", { params: { q } });
  },
  createCoupon(body: Record<string, unknown>) {
    return client.post("/monetization/admin/coupons", body);
  },
  deleteCoupon(id: string) {
    return client.delete(`/monetization/admin/coupons/${id}`);
  },
  listTransactions(page = 1, limit = 20) {
    return client.get("/monetization/admin/transactions", { params: { page, limit } });
  },
  invoicePdfUrl(invoiceOrTxId: string) {
    return `/api/proxy/monetization/admin/invoices/${invoiceOrTxId}/pdf`;
  },
  adminGrant(body: {
    userId: string;
    planId: string;
    durationMonths: GrantDurationMonths;
    reason?: string;
    confirmReplace?: boolean;
  }) {
    return client.post("/monetization/admin/grant", body);
  },
  getGrantContext(userId: string) {
    return client.get<{
      success: boolean;
      data: {
        vendor: GrantContextVendor;
        currentSubscription: GrantContextCurrentSubscription | null;
        plans: SubscriptionPlan[];
      };
    }>("/monetization/admin/grant-context", { params: { userId } });
  },
  sortPlans(orderedIds: string[]) {
    return client.post("/monetization/admin/plans/sort", { orderedIds });
  },
  getPlan(id: string) {
    return client.get(`/monetization/plans/${id}`);
  },
  listRefunds(page = 1) {
    return client.get("/monetization/admin/refunds", { params: { page } });
  },
  revenue() {
    return client.get("/monetization/admin/revenue");
  },
  listDocuments(page = 1) {
    return client.get("/monetization/admin/documents", { params: { page } });
  },
  reviewDocument(id: string, status: string, rejectionReason?: string) {
    return client.patch(`/monetization/admin/documents/${id}`, { status, rejectionReason });
  },
  getPalPointsPartnerConfig() {
    return client.get("/monetization/admin/pal-points-partner/config");
  },
  updatePalPointsPartnerConfig(body: Record<string, unknown>) {
    return client.patch("/monetization/admin/pal-points-partner/config", body);
  },
  enablePalPointsPartnerVendor(vendorId: string, enabled: boolean) {
    return client.patch(`/monetization/admin/pal-points-partner/vendors/${vendorId}`, { enabled });
  },
  listSubscriptionAudit(page = 1) {
    return client.get("/monetization/admin/subscription-audit", { params: { page } });
  },
};
