import client from "./client";
import type { PaginatedResponse } from "@/types";

export interface MediaAsset {
  id: string;
  type: "PLACE_IMAGE" | "USER_PLACE_IMAGE" | "REEL";
  url: string;
  thumbnail?: string | null;
  title: string;
  entityType: string;
  entityId: string;
  entityName: string;
  status: string;
  createdAt: string;
}

export async function getMediaAssets(params?: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
}): Promise<PaginatedResponse<MediaAsset>> {
  const res = await client.get<PaginatedResponse<MediaAsset>>("/admin/media", {
    params: { ...params, limit: params?.limit ?? 24 },
  });
  return res.data;
}

export async function deleteMediaAsset(type: string, id: string): Promise<void> {
  await client.delete(`/admin/media/${type}/${id}`);
}
