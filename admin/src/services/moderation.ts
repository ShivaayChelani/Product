import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface UnifiedIncident {
  id: string;
  contentType: "REEL" | "REVIEW" | "HIDDEN_GEM" | "PLACE" | "COMMENT" | "CREATOR_APP" | "VENDOR_APP" | "USER_REPORT";
  entityId: string;
  entityName: string;
  reporter: {
    id: string;
    name: string;
    avatar: string | null;
  };
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priority: "P1" | "P2" | "P3" | "P4";
  status: "PENDING" | "ASSIGNED" | "UNDER_REVIEW" | "NEEDS_INFO" | "APPROVED" | "REJECTED" | "ESCALATED" | "RESOLVED" | "APPEALED" | "CLOSED" | "ARCHIVED";
  assignedModerator?: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  slaBreached: boolean;
  resolutionNotes?: string;
}

export async function getIncidents(params?: {
  page?: number;
  limit?: number;
  status?: string;
  severity?: string;
  priority?: string;
  contentType?: string;
  search?: string;
}): Promise<PaginatedResponse<UnifiedIncident>> {
  const res = await client.get<PaginatedResponse<UnifiedIncident>>("/admin/moderation/incidents", {
    params: { ...params, limit: params?.limit ?? 15 },
  });
  return res.data;
}

export async function getIncident(id: string): Promise<UnifiedIncident> {
  const res = await client.get<SingleResponse<UnifiedIncident>>(`/admin/moderation/incidents/${id}`);
  return res.data.data;
}

export async function updateIncidentStatus(id: string, status: string, notes?: string): Promise<UnifiedIncident> {
  const res = await client.patch<SingleResponse<UnifiedIncident>>(`/admin/moderation/incidents/${id}/status`, { status, notes });
  return res.data.data;
}

export async function assignIncident(id: string, moderatorId: string): Promise<UnifiedIncident> {
  const res = await client.patch<SingleResponse<UnifiedIncident>>(`/admin/moderation/incidents/${id}/assign`, { moderatorId });
  return res.data.data;
}
