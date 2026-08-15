import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface AdminCollaboration {
  id: string;
  campaignTitle: string;
  businessName: string;
  budgetFormatted?: string;
  budgetPaise: number;
  status: string;
  deliverablesSummary?: string;
  vendor?: { id: string; businessName: string };
  creator?: { id: string; username: string; fullName?: string };
  createdAt: string;
}

export interface AdminCollaborationAnalytics {
  total: number;
  active: number;
  completed: number;
  totalBudgetPaise: number;
}

export async function listCollaborations(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<AdminCollaboration>> {
  const res = await client.get<PaginatedResponse<AdminCollaboration>>("/admin/collaborations", {
    params: { ...params, limit: params?.limit ?? 20 },
  });
  return res.data;
}

export async function getAnalyticsSummary(): Promise<AdminCollaborationAnalytics> {
  const res = await client.get<SingleResponse<AdminCollaborationAnalytics>>("/admin/collaborations/analytics/summary");
  return res.data.data;
}

export async function suspendCollaboration(id: string, reason: string, disputeNotes?: string) {
  const res = await client.post<SingleResponse<AdminCollaboration>>(`/admin/collaborations/${id}/suspend`, {
    reason,
    disputeNotes,
  });
  return res.data.data;
}

export async function resolveCollaboration(id: string, disputeNotes: string, status?: string) {
  const res = await client.post<SingleResponse<AdminCollaboration>>(`/admin/collaborations/${id}/resolve`, {
    disputeNotes,
    status,
  });
  return res.data.data;
}
