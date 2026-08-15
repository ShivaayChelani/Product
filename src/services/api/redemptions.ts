import { apiClient } from './client';

export interface ServerRedemption {
  id: string;
  userId: string;
  vendorId: string;
  offerId: string;
  pointsSpent: number;
  discountValue: number;
  discountType: 'FLAT' | 'PERCENTAGE' | 'FREEBIE';
  receiptNumber: string | null;
  status: 'PENDING' | 'VERIFIED' | 'CANCELLED';
  verifiedAt: string | null;
  verifiedById: string | null;
  refundedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  vendorName?: string;
  offerTitle?: string;
  vendorCode?: string;
  offer?: { title: string; discountType: string; discountValue: number };
  vendor?: { id: string; businessName: string; vendorCode?: string };
}

export const redemptionsApi = {
  async redeemOffer(offerId: string, vendorCode: string) {
    return apiClient.post<ServerRedemption>('/redemptions/redeem', { offerId, vendorCode });
  },

  async mine(page = 1, limit = 20) {
    return apiClient.get<ServerRedemption[]>(`/redemptions/mine?page=${page}&limit=${limit}`);
  },

  async vendorRedemptions(page = 1, limit = 20) {
    return apiClient.get<ServerRedemption[]>(`/redemptions/vendor?page=${page}&limit=${limit}`);
  },

  async pay(vendorCode: string, points: number) {
    return apiClient.post<{
      id: string;
      pointsSpent: number;
      receiptNumber: string;
      vendorName: string;
      vendorCode?: string;
      offerTitle: string;
      rupeeValue: string;
      status: string;
    }>('/redemptions/pay', { vendorCode, points });
  },

  async adminRefund(id: string, notes?: string) {
    return apiClient.post(`/redemptions/${id}/refund`, { notes });
  },

  async adminListAll(query?: { status?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const qs = params.toString();
    return apiClient.get<ServerRedemption[]>(`/redemptions/admin/all${qs ? `?${qs}` : ''}`);
  },
};
