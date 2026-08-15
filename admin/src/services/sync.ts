import client from "./client";
import type { SyncStats, SyncItem, PaginatedResponse, SingleResponse } from "@/types";

export async function getSyncStatus(): Promise<SyncStats> {
  const res = await client.get<SingleResponse<SyncStats>>("/sync/admin/stats");
  return res.data.data;
}

export async function getSyncItems(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PaginatedResponse<SyncItem>> {
  const res = await client.get<PaginatedResponse<SyncItem>>("/sync/admin/all", {
    params,
  });
  return res.data;
}
