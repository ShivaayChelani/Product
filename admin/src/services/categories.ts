import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  level: number;
  status: "ACTIVE" | "INACTIVE" | "DRAFT";
  visibility: "PUBLIC" | "PRIVATE" | "INTERNAL";
  icon: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  healthScore: number;
  isFeatured: boolean;
  isSeasonal: boolean;
  childrenCount: number;
  linkedEntitiesCount: number;
}

export async function getCategories(params?: {
  page?: number;
  limit?: number;
  parentId?: string;
  search?: string;
}): Promise<PaginatedResponse<Category>> {
  // Derived taxonomy from place.category values (not a separate CMS table).
  const res = await client.get<PaginatedResponse<Category>>("/admin/system/categories", {
    params: { ...params, limit: params?.limit ?? 50 },
  });
  return res.data;
}

export async function getCategory(id: string): Promise<Category> {
  const res = await client.get<SingleResponse<Category>>(`/admin/system/categories/${id}`);
  return res.data.data;
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
  const res = await client.patch<SingleResponse<Category>>(`/admin/system/categories/${id}`, data);
  return res.data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await client.delete(`/admin/system/categories/${id}`);
}
