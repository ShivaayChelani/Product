import client from "./client";
import type { SingleResponse } from "@/types";

export interface SearchAnalytics {
  totalSearches: number;
  failedSearches: number;
  failedKeywords: Array<{ keyword: string; count: number }>;
  popularKeywords: Array<{ keyword: string; count: number }>;
}

export async function getSearchAnalytics(): Promise<SearchAnalytics> {
  const res = await client.get<SingleResponse<SearchAnalytics>>("/search/admin/analytics");
  return res.data.data;
}

export async function adminGlobalSearch(q: string) {
  const res = await client.get<{ data: import("./search").AdminGlobalSearchResult }>("/search/admin/global", {
    params: { q },
  });
  return res.data?.data ?? { places: [], users: [], vendors: [] };
}
