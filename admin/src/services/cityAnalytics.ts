import client from "./client";

export async function getCityAnalyticsDashboard(params?: {
  state?: string;
  city?: string;
  from?: string;
  to?: string;
}) {
  const res = await client.get("/analytics/cities/dashboard", { params });
  return res.data.data;
}
