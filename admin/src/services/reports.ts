import client from "./client";

export async function generateReport(params: {
  type: string;
  format?: string;
  from?: string;
  to?: string;
  city?: string;
  category?: string;
}) {
  const res = await client.get("/reports/generate", {
    params,
    responseType: params.format === "csv" ? "blob" : "json",
  });
  if (params.format === "csv") return res.data;
  // JSON envelope is { success, data: { metrics, summary, rows }, message }.
  return res.data?.data ?? res.data;
}
