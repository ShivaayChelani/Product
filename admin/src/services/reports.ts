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
  return res.data;
}
