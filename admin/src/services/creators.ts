import client from "./client";
import type { SingleResponse } from "@/types";

export type CreatorStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "SUSPENDED"
  | "PAUSED"
  | "RETIRED";

export interface CreatorApplication {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  bio: string | null;
  avatar: string | null;
  travelCategories: string[];
  instagramUrl: string | null;
  youtubeUrl: string | null;
  facebookUrl?: string | null;
  governmentIdUrl?: string | null;
  portfolioLinks?: string[];
  sampleReelUrl: string | null;
  applicationReason: string | null;
  status: CreatorStatus;
  rejectionReason?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export async function getCreatorApplications(status?: CreatorApplication["status"]): Promise<CreatorApplication[]> {
  const res = await client.get<SingleResponse<CreatorApplication[]>>("/social/admin/creators", {
    params: status ? { status } : undefined,
  });
  return res.data.data;
}

export async function verifyCreator(
  id: string,
  status: CreatorStatus,
  reason?: string
): Promise<CreatorApplication> {
  const res = await client.patch<SingleResponse<CreatorApplication>>(
    `/social/admin/creators/${id}/verify`,
    { status, rejectionReason: reason }
  );
  return res.data.data;
}
