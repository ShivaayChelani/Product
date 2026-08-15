import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface AdminReview {
  id: string;
  rating: number;
  content: string;
  entityType: "PLACE" | "VENDOR" | "ACTIVITY" | "HOTEL" | "RESTAURANT";
  entityId: string;
  entityName: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  createdAt: string;
  reviewer: {
    id: string;
    name: string;
    avatar: string | null;
  };
  reportsCount: number;
}

export type ReviewModerationStatus = AdminReview["status"];

export async function getReviews(params?: { 
  page?: number; 
  limit?: number; 
  status?: ReviewModerationStatus | string;
  entityType?: string;
  search?: string;
}): Promise<PaginatedResponse<AdminReview>> {
  const res = await client.get<PaginatedResponse<AdminReview>>("/admin/reviews", {
    params: { ...params, limit: params?.limit ?? 15 },
  });
  return res.data;
}

export async function getReview(id: string): Promise<AdminReview> {
  const res = await client.get<SingleResponse<AdminReview>>(`/admin/reviews/${id}`);
  return res.data.data;
}

export async function updateReviewStatus(
  id: string,
  status: ReviewModerationStatus,
): Promise<AdminReview> {
  const res = await client.patch<SingleResponse<AdminReview>>(`/admin/reviews/${id}/status`, { status });
  return res.data.data;
}
