import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface AdminReel {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  likes: number;
  views: number;
  shares: number;
  saves: number;
  featured: boolean;
  status?: string;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    avatar: string | null;
    fullName?: string | null;
  };
  place?: {
    id: string;
    name: string;
    city?: string | null;
  } | null;
  _count?: {
    likesList?: number;
    comments?: number;
  };
}

export interface AdminReelReport {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null };
  reel: { id: string; title: string | null; videoUrl?: string | null };
}

function normalizeReel(raw: AdminReel): AdminReel {
  return {
    ...raw,
    likes: raw.likes ?? raw._count?.likesList ?? 0,
    creator: {
      ...raw.creator,
      username: raw.creator?.username || raw.creator?.fullName || "creator",
    },
  };
}

/** Admin queue — includes pending/hidden/rejected, not only the public feed. */
export async function getReels(params?: {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
}): Promise<PaginatedResponse<AdminReel>> {
  const res = await client.get<PaginatedResponse<AdminReel>>("/social/admin/reels", {
    params: {
      page: params?.page,
      limit: params?.limit ?? 15,
      q: params?.q || params?.category || undefined,
    },
  });
  return {
    ...res.data,
    data: (res.data.data || []).map(normalizeReel),
  };
}

export async function deleteReel(id: string): Promise<void> {
  await client.delete(`/social/admin/reels/${id}`);
}

export async function toggleFeatureReel(id: string, featured: boolean): Promise<AdminReel> {
  const res = await client.patch<SingleResponse<AdminReel>>(`/social/admin/reels/${id}/feature`, { featured });
  return normalizeReel(res.data.data);
}

export async function getReelReports(params?: {
  status?: string;
}): Promise<{ data: AdminReelReport[] }> {
  const res = await client.get<{ success?: boolean; data: AdminReelReport[] } | AdminReelReport[]>(
    "/social/admin/reel-reports",
    { params },
  );
  const body = res.data as { data?: AdminReelReport[] } | AdminReelReport[];
  if (Array.isArray(body)) return { data: body };
  return { data: body.data || [] };
}
