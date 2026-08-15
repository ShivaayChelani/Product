import { apiClient } from './client';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  pointsRequired: number;
  totalWinnerSlots: number;
  remainingWinnerSlots: number;
  maxClaimsPerUser: number;
  startDate: string;
  endDate: string;
  status: string;
  termsAndConditions?: string;
  createdAt: string;
}

function unwrapCampaignList(payload: unknown): Campaign[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as Campaign[];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as Campaign[];
  if (Array.isArray(obj.items)) return obj.items as Campaign[];
  if (Array.isArray(obj.campaigns)) return obj.campaigns as Campaign[];
  return [];
}

export const getCampaigns = async (params: { status?: string; page?: number; limit?: number } = {}) => {
  const urlParams = new URLSearchParams();
  if (params.status) urlParams.set('status', params.status);
  if (params.page) urlParams.set('page', String(params.page));
  if (params.limit) urlParams.set('limit', String(params.limit));
  const qs = urlParams.toString();
  const res = await apiClient.get<Campaign[] | { data?: Campaign[]; items?: Campaign[] }>(
    `/campaigns${qs ? `?${qs}` : ''}`,
  );
  // apiClient returns { success, data, pagination? }; data may be the array or a nested page object
  return unwrapCampaignList(res?.data ?? res);
};

export const getCampaignById = async (id: string) => {
  const res = await apiClient.get<Campaign>(`/campaigns/${id}`);
  return (res as any)?.data ?? res;
};

export const claimReward = async (campaignId: string, notes?: string) => {
  const res = await apiClient.post(`/campaigns/${campaignId}/claim`, { notes });
  return (res as any)?.data ?? res;
};

export const getUserClaims = async () => {
  const res = await apiClient.get('/campaigns/user/claims');
  return (res as any)?.data ?? res;
};

export const getAdminClaims = async (params: { status?: string; page?: number; limit?: number } = {}) => {
  const urlParams = new URLSearchParams();
  if (params.status) urlParams.set('status', params.status);
  if (params.page) urlParams.set('page', String(params.page));
  if (params.limit) urlParams.set('limit', String(params.limit));
  const qs = urlParams.toString();
  const res = await apiClient.get<any>(`/campaigns/admin/claims${qs ? `?${qs}` : ''}`);
  return (res as any)?.data ?? res;
};

export const updateClaimStatus = async (claimId: string, status: string) => {
  const res = await apiClient.patch<any>(`/campaigns/admin/claims/${claimId}/status`, { status });
  return (res as any)?.data ?? res;
};
