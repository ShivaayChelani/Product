import client from "./client";
import type { PaginatedResponse } from "@/types";

export interface NotificationCampaign {
  id: string;
  name: string;
  channels: ("PUSH" | "EMAIL" | "SMS" | "WHATSAPP")[];
  audienceSegment: "ALL_USERS" | "ALL_VENDORS" | "ALL_CREATORS" | "CUSTOM";
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "COMPLETED" | "FAILED";
  deliveredCount: number;
  failedCount: number;
  openRate: number;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getCampaigns(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<NotificationCampaign>> {
  const res = await client.get<PaginatedResponse<NotificationCampaign>>("/admin/communication/notifications/campaigns", {
    params: { ...params, limit: params?.limit ?? 15 },
  });
  return res.data;
}
