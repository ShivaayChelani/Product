import client from "./client";
import type { SingleResponse } from "@/types";

export async function getAnalyticsDashboard() {
  const res = await client.get<SingleResponse<unknown>>("/analytics/dashboard");
  return res.data.data;
}

export async function getUsersAnalyticsSeries() {
  const res = await client.get<SingleResponse<{ date: string; count: number }[]>>("/analytics/users");
  return res.data.data;
}

export async function getPlacesAnalytics(params?: { page?: number; limit?: number }) {
  const res = await client.get<SingleResponse<unknown>>("/analytics/places", { params });
  return res.data.data;
}

export async function exportAnalyticsReport(
  type: "users" | "vendors" | "places" | "revenue" | "engagement",
  format: "csv" | "json" = "csv",
  params?: { from?: string; to?: string },
) {
  const res = await client.get("/reports/generate", {
    params: { type, format, ...params },
    responseType: format === "csv" ? "blob" : "json",
  });
  return res.data;
}
