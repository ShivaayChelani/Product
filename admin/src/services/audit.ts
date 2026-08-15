import client from "./client";
import type { AuditLog, PaginatedResponse } from "@/types";

export async function getAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  search?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: string;
}): Promise<PaginatedResponse<AuditLog>> {
  const res = await client.get<PaginatedResponse<AuditLog>>("/audit-logs", {
    params,
  });
  return res.data;
}

export async function getAuditActions(): Promise<string[]> {
  const res = await client.get("/audit-logs/actions");
  return res.data.data;
}

export async function getAuditEntityTypes(): Promise<string[]> {
  const res = await client.get("/audit-logs/entity-types");
  return res.data.data;
}

export async function exportAuditLogsCSV(params?: {
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}): Promise<Blob> {
  const res = await client.get("/audit-logs/export/csv", {
    params,
    responseType: "blob",
  });
  return res.data;
}
