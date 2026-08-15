import client from "./client";

export async function getGrowthDashboard(params?: {
  from?: string;
  to?: string;
}) {
  const res = await client.get("/analytics/growth/dashboard", { params });
  return res.data.data;
}
