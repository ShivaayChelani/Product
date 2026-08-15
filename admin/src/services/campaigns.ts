import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED" | "SHIPPED" | "DELIVERED";

export type Campaign = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  pointsRequired: number;
  totalWinnerSlots: number;
  remainingWinnerSlots: number;
  maxClaimsPerUser: number;
  startDate: string;
  endDate: string;
  termsAndConditions?: string | null;
  status: CampaignStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type CampaignClaim = {
  id: string;
  campaignId: string;
  userId: string;
  status: ClaimStatus;
  notes?: string | null;
  redemptionId?: string | null;
  claimedAt?: string;
  createdAt: string;
  updatedAt?: string;
  user?: { id: string; name?: string | null; email?: string | null };
  campaign?: { id: string; name?: string };
};

export type CampaignListParams = {
  page?: number;
  limit?: number;
  status?: CampaignStatus | string;
  search?: string;
};

export type CampaignClaimListParams = {
  page?: number;
  limit?: number;
  campaignId?: string;
  status?: ClaimStatus | string;
};

export type CreateCampaignInput = {
  name: string;
  description: string;
  imageUrl?: string | null;
  pointsRequired: number;
  totalWinnerSlots?: number;
  maxClaimsPerUser?: number;
  startDate: string;
  endDate: string;
  termsAndConditions?: string | null;
  status?: CampaignStatus;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput> & {
  remainingWinnerSlots?: number;
};

export type CampaignFormState = {
  name: string;
  description: string;
  imageUrl: string;
  pointsRequired: number | string;
  totalWinnerSlots: number | string;
  remainingWinnerSlots: number | string;
  maxClaimsPerUser: number | string;
  startDate: string;
  endDate: string;
  termsAndConditions: string;
};

export type ValidationIssue = {
  field?: string;
  message?: string;
};

export function formatCampaignApiError(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const response = (err as { response?: { data?: { message?: string; errors?: ValidationIssue[] } } }).response;
  const issues = response?.data?.errors;
  if (Array.isArray(issues) && issues.length) {
    return issues
      .map((e) => (e?.field && e?.message ? `${e.field}: ${e.message}` : e?.message))
      .filter(Boolean)
      .join("; ") || fallback;
  }
  return response?.data?.message || (err instanceof Error ? err.message : fallback);
}

export const getCampaigns = async (params: CampaignListParams = {}) => {
  const res = await client.get<PaginatedResponse<Campaign>>("/campaigns", { params });
  return res.data;
};

export const getCampaignById = async (id: string) => {
  const res = await client.get<SingleResponse<Campaign>>(`/campaigns/${id}`);
  return res.data;
};

export const createCampaign = async (data: CreateCampaignInput) => {
  const res = await client.post<SingleResponse<Campaign>>("/campaigns", data);
  return res.data;
};

export const updateCampaign = async (id: string, data: UpdateCampaignInput) => {
  const res = await client.patch<SingleResponse<Campaign>>(`/campaigns/${id}`, data);
  return res.data;
};

export const deleteCampaign = async (id: string) => {
  const res = await client.delete<SingleResponse<{ message?: string }>>(`/campaigns/${id}`);
  return res.data;
};

export const getClaims = async (params: CampaignClaimListParams = {}) => {
  const res = await client.get<PaginatedResponse<CampaignClaim>>("/campaigns/admin/claims", { params });
  return res.data;
};

export const updateClaimStatus = async (id: string, status: ClaimStatus | string) => {
  const res = await client.patch<SingleResponse<CampaignClaim>>(`/campaigns/admin/claims/${id}/status`, { status });
  return res.data;
};
