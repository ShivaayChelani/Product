import client from "./client";

export async function getRevenueDashboard(params?: {
  from?: string;
  to?: string;
  city?: string;
  category?: string;
}) {
  const res = await client.get("/analytics/revenue/dashboard", { params });
  return res.data.data;
}

export async function exportRevenueCSV(params?: {
  from?: string;
  to?: string;
  type?: string;
}) {
  const res = await client.get("/analytics/revenue/export/csv", {
    params,
    responseType: "blob",
  });
  return res.data;
}
