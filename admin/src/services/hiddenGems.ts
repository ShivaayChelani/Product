import client from "./client";
import type { PaginatedResponse } from "@/types";

export interface HiddenGemSubmission {
  id: string;
  userId: string;
  userName: string;
  placeName: string;
  category: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  imageUri: string | null;
  description: string;
  status: string;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  bestTimeToVisit?: string | { from: string; to: string; label?: string } | null;
}

export async function getHiddenGems(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<HiddenGemSubmission>> {
  const res = await client.get<PaginatedResponse<HiddenGemSubmission>>("/hidden-gems", { params });
  return res.data;
}

export async function approveHiddenGem(id: string, points?: number, force?: boolean): Promise<void> {
  await client.patch(`/admin/hidden-gems/${id}/approve`, { points, force });
}

export async function rejectHiddenGem(id: string, reason?: string): Promise<void> {
  await client.patch(`/admin/hidden-gems/${id}/reject`, { reason });
}

export async function unpublishHiddenGem(id: string, reason?: string): Promise<void> {
  await client.patch(`/admin/hidden-gems/${id}/unpublish`, { reason });
}

export interface HiddenGemDuplicateCandidate {
  placeId: string;
  name: string;
  slug: string;
  state: string;
  district: string;
  distanceM: number;
  nameScore: number;
  reason: string;
  place: {
    id: string;
    name: string;
    slug: string;
    state: string;
    district: string;
    category: string;
    status: string;
    images: string[];
    description: string | null;
  };
}

export async function getHiddenGemDuplicates(id: string): Promise<HiddenGemDuplicateCandidate[]> {
  const res = await client.get<{ data: HiddenGemDuplicateCandidate[] }>(`/admin/hidden-gems/${id}/duplicates`);
  return res.data.data;
}

export async function mergeHiddenGemContribution(
  id: string,
  payload: {
    targetPlaceId: string;
    updateDescription?: boolean;
    appendDescription?: boolean;
    description?: string;
    points?: number;
    reason?: string;
  },
): Promise<void> {
  await client.post(`/admin/hidden-gems/${id}/merge`, payload);
}
