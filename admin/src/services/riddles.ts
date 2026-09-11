import client from "./client";

export interface TreasureHunt {
  id: string;
  city: string;
  title: string;
  description: string | null;
  rewardCoins: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { riddles: number };
}

export interface Riddle {
  id: string;
  huntId: string;
  city: string;
  sequence: number;
  clueEnglish: string;
  answerEnglish: string;
  clueHindi: string;
  answerHindi: string;
  status: string;
  rewardCoins: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportLog {
  id: string;
  fileName: string;
  uploadedById: string;
  totalRows: number;
  validRows: number;
  failedRows: number;
  cities: string[];
  status: string;
  errorMessage: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string; email: string };
}

export interface CityRow {
  city: string;
  riddleCount: number;
  huntId: string | null;
  title: string | null;
  status: string;
  lastUpdatedAt: string | null;
}

export async function getHunts(params?: {
  page?: number;
  limit?: number;
  city?: string;
}) {
  const res = await client.get("/admin/riddles/hunts", { params });
  return res.data;
}

export async function getRiddles(params?: {
  page?: number;
  limit?: number;
  city?: string;
  search?: string;
}) {
  const res = await client.get("/admin/riddles/riddles", { params });
  return res.data;
}

export async function deleteHunt(id: string) {
  await client.delete(`/admin/riddles/hunts/${id}`);
}

export async function getTreasureOverview() {
  const res = await client.get("/admin/riddles/overview");
  return res.data.data || res.data;
}

export async function getCitiesList(): Promise<CityRow[]> {
  const res = await client.get("/admin/riddles/cities");
  return res.data.data || res.data;
}

export async function getImportHistory(params?: {
  page?: number;
  limit?: number;
}) {
  const res = await client.get("/admin/riddles/import-history", { params });
  return res.data;
}