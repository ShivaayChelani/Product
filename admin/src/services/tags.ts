import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface Tag {
  id: string;
  name: string;
  slug: string;
  type: "DESTINATION" | "ACTIVITY" | "SEASON" | "CUISINE" | "ADVENTURE" | "WILDLIFE" | "CULTURE" | "HERITAGE" | "FAMILY" | "LUXURY" | "BUDGET" | "PHOTOGRAPHY" | "ACCESSIBILITY" | "SAFETY" | "FESTIVAL" | "HIDDEN_GEM" | "AI_GENERATED" | "CUSTOM";
  status: "ACTIVE" | "INACTIVE" | "PENDING_REVIEW";
  color: string | null;
  icon: string | null;
  popularityScore: number;
  usageCount: number;
  healthScore: number;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export async function getTags(params?: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
}): Promise<PaginatedResponse<Tag>> {
  const res = await client.get<PaginatedResponse<Tag>>("/admin/system/tags", {
    params: { ...params, limit: params?.limit ?? 15 },
  });
  return res.data;
}

export async function getTag(id: string): Promise<Tag> {
  const res = await client.get<SingleResponse<Tag>>(`/admin/system/tags/${id}`);
  return res.data.data;
}

export async function updateTag(id: string, data: Partial<Tag>): Promise<Tag> {
  const res = await client.patch<SingleResponse<Tag>>(`/admin/system/tags/${id}`, data);
  return res.data.data;
}

export async function deleteTag(id: string): Promise<void> {
  await client.delete(`/admin/system/tags/${id}`);
}
