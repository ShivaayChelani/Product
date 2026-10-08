import client from "./client";
import type { PaginatedResponse } from "@/types";

export type EventStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
export type EventLifecycle = "LIVE" | "UPCOMING" | "ENDED";
export type EventType =
  | "FESTIVAL" | "RELIGIOUS" | "CULTURAL" | "FAIR_MELA" | "CONCERT"
  | "EXHIBITION" | "SPORTS" | "FOOD" | "COMMUNITY" | "LOCAL" | "OTHER";
export type EventReportStatus = "PENDING" | "REVIEWED" | "RESOLVED" | "DISMISSED";

export interface AdminEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  eventType: EventType;
  status: EventStatus;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
  address: string | null;
  city: string;
  state: string;
  coverImage: string | null;
  images: string[];
  isFeatured: boolean;
  placeId: string | null;
  placeName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  reportCount: number;
  createdBy: { id: string; name: string; avatar: string | null } | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  approvedById: string | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  publishedAt: string | null;
}

export interface AdminEventReport {
  id: string;
  eventId: string;
  userId: string;
  reason: string;
  details: string | null;
  status: EventReportStatus;
  resolutionNote: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  event: {
    id: string;
    title: string;
    status: EventStatus;
    city: string;
    state: string;
    startDate: string;
    endDate: string;
    coverImage: string | null;
  } | null;
  user: { id: string; name: string; avatar: string | null } | null;
  reviewedBy: { id: string; name: string } | null;
}

export interface EventDuplicateCandidate {
  id: string;
  title: string;
  status: EventStatus;
  distanceMeters: number;
  titleSimilarity: number;
}

export type AdminEventList = PaginatedResponse<AdminEvent> & {
  meta: {
    statusCounts: Record<EventStatus, number>;
    lifecycleCounts: Record<EventLifecycle, number>;
  };
};

export async function getAdminEvents(params: {
  page?: number;
  limit?: number;
  status?: EventStatus;
  lifecycle?: EventLifecycle;
  q?: string;
  city?: string;
}): Promise<AdminEventList> {
  const res = await client.get<AdminEventList>("/admin/events", { params });
  return res.data;
}

export async function getEventReports(params: {
  status?: EventReportStatus;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedResponse<AdminEventReport>> {
  const res = await client.get<PaginatedResponse<AdminEventReport>>("/admin/events/reports", { params });
  return res.data;
}

export async function approveEvent(id: string, force = false): Promise<AdminEvent> {
  const res = await client.patch<{ data: AdminEvent }>(`/admin/events/${id}/approve`, { force });
  return res.data.data;
}

export async function rejectEvent(id: string, reason: string): Promise<AdminEvent> {
  const res = await client.patch<{ data: AdminEvent }>(`/admin/events/${id}/reject`, { reason });
  return res.data.data;
}

export async function deleteAdminEvent(id: string): Promise<void> {
  await client.delete(`/admin/events/${id}`);
}

export async function getEventDuplicates(id: string): Promise<{
  candidates: EventDuplicateCandidate[];
  unavailable: "no-valid-coordinates" | null;
}> {
  const res = await client.get<{ data: { candidates: EventDuplicateCandidate[]; unavailable: "no-valid-coordinates" | null } }>(
    `/admin/events/${id}/duplicates`,
  );
  return res.data.data;
}

export async function resolveEventReport(id: string, resolutionNote?: string): Promise<AdminEventReport> {
  const res = await client.patch<{ data: AdminEventReport }>(
    `/admin/events/reports/${id}/resolve`,
    { resolutionNote },
  );
  return res.data.data;
}
