import client from "./client";
import type { Place, PlaceFormData, PaginatedResponse, SingleResponse } from "@/types";
import type { ParsedPlaceRow } from "@/lib/placeImport";

export type CityPlaceCluster = {
  city: string;
  state: string;
  placeCount: number;
  totalInCity: number;
  places: Place[];
};

export async function getPlaces(params?: {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  search?: string;
  state?: string;
  city?: string;
  touristOnly?: boolean;
  verified?: string;
  featured?: string;
  sort?: string;
  sortDir?: "asc" | "desc";
}): Promise<PaginatedResponse<Place>> {
  const res = await client.get<PaginatedResponse<Place>>("/admin/places", {
    params: {
      ...params,
      touristOnly: params?.touristOnly !== false ? "true" : "false",
    },
  });
  return res.data;
}

export async function getCityClusters(params?: {
  page?: number;
  limit?: number;
  status?: string;
  state?: string;
  search?: string;
  touristOnly?: boolean;
  placesPerCity?: number;
}): Promise<PaginatedResponse<CityPlaceCluster>> {
  const res = await client.get<PaginatedResponse<CityPlaceCluster>>("/admin/places/city-clusters", {
    params: {
      ...params,
      touristOnly: params?.touristOnly !== false ? "true" : "false",
    },
  });
  return res.data;
}

export async function getPlace(id: string): Promise<Place> {
  const res = await client.get<SingleResponse<Place>>(`/places/${id}`);
  return res.data.data;
}

export async function createPlace(data: Record<string, unknown> | PlaceFormData): Promise<Place> {
  const res = await client.post<SingleResponse<Place>>("/places", data);
  return res.data.data;
}

export async function updatePlace(
  id: string,
  data: Partial<PlaceFormData> | Record<string, unknown>
): Promise<Place> {
  const res = await client.patch<SingleResponse<Place>>(`/admin/places/${id}`, data);
  return res.data.data;
}

export async function approvePlace(id: string): Promise<Place> {
  const res = await client.patch<SingleResponse<Place>>(`/places/${id}/status`, {
    status: "APPROVED",
  });
  return res.data.data;
}

export async function rejectPlace(id: string): Promise<Place> {
  const res = await client.patch<SingleResponse<Place>>(`/places/${id}/status`, {
    status: "REJECTED",
  });
  return res.data.data;
}

export async function deletePlace(id: string): Promise<void> {
  await client.delete(`/admin/places/${id}`);
}

export async function deleteAllPlaces(): Promise<{ deletedCount: number }> {
  const res = await client.delete<{ data: { deletedCount: number } }>("/admin/places");
  return res.data.data;
}

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await client.post<SingleResponse<{ url: string }>>(
    "/upload/single",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data.data.url;
}

export async function importPlaces(
  places: ParsedPlaceRow[],
  options?: { overwrite?: boolean; source?: string; status?: string }
): Promise<{
  total: number;
  created: number;
  skipped: number;
  errors: number;
  skippedReasons: { name: string; reason: string }[];
  errorDetails: { name: string; error: string }[];
}> {
  const res = await client.post("/admin/places/import", {
    places,
    overwrite: options?.overwrite ?? false,
    source: options?.source ?? "ADMIN",
    status: options?.status ?? "APPROVED",
  });
  return res.data.data;
}

export async function getClusters(params: {
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
  zoom: number;
}): Promise<any> {
  const res = await client.get("/places/clusters", { params });
  return res.data;
}

export async function getPlaceReviews(
  placeId: string,
  params?: { page?: number; limit?: number },
): Promise<{ data: unknown[]; pagination?: { total: number } }> {
  const res = await client.get(`/places/${placeId}/reviews`, { params: { limit: 10, ...params } });
  return res.data;
}

export async function getPlaceNearbyVendors(placeId: string): Promise<{ data: unknown[] }> {
  const res = await client.get(`/places/${placeId}/nearby-vendors`);
  return res.data;
}

export async function fetchAllPlaces(
  baseParams: Parameters<typeof getPlaces>[0],
  maxPages = 20,
): Promise<Place[]> {
  const all: Place[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= maxPages) {
    const res = await getPlaces({ ...baseParams, page, limit: 100 });
    all.push(...res.data);
    hasNext = res.pagination.hasNext;
    page++;
  }
  return all;
}
