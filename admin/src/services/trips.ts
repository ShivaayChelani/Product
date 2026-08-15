import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export interface Trip {
  id: string;
  title: string;
  description?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  userId: string;
  days: number;
  travelers?: string;
  transportation: string[];
  budget?: string;
  accommodation?: string;
  interests: string[];
  coverImage?: string;
  status: string;
  totalDistance?: number;
  totalTravelTime?: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string; avatar?: string };
  _count: { tripDays: number; collaborators: number };
  stopsCount: number;
}

export interface TripsStats {
  totalTrips: number;
  activeTrips: number;
  completedToday: number;
  totalStops: number;
}

export async function getAdminTrips(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<Trip>> {
  const res = await client.get<PaginatedResponse<Trip>>("/admin/trips/all", { params });
  return res.data;
}

export async function getTripsStats(): Promise<TripsStats> {
  const res = await client.get<SingleResponse<TripsStats>>("/admin/trips/stats");
  return res.data.data;
}

export async function getAdminTripById(id: string): Promise<Trip & {
  tripDays?: Array<{
    id: string;
    dayNumber: number;
    date?: string;
    stops: Array<{
      id: string;
      order: number;
      status?: string;
      place?: { id: string; name: string; city?: string; state?: string; thumbnail?: string; images?: string[] };
    }>;
  }>;
  collaborators?: Array<{ id: string; role: string; user: { id: string; name: string; avatar?: string } }>;
  description?: string;
}> {
  const res = await client.get<SingleResponse<Trip>>(`/admin/trips/${id}`);
  return res.data.data;
}

export async function deleteTrip(id: string): Promise<void> {
  await client.delete(`/admin/trips/${id}`);
}
