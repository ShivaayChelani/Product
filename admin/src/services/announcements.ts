import client from "./client";

export type AnnouncementSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
export type AnnouncementAudience = "ALL" | "USER" | "VENDOR" | "CONTENT_CREATOR";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
}

export async function listAnnouncements(params?: { page?: number; limit?: number; isActive?: string; audience?: string }) {
  const res = await client.get("/admin/announcements", { params });
  return res.data as { data: Announcement[]; pagination: any };
}

export async function createAnnouncement(data: AnnouncementInput): Promise<Announcement> {
  const res = await client.post("/admin/announcements", data);
  return res.data.data;
}

export async function updateAnnouncement(id: string, data: Partial<AnnouncementInput>): Promise<Announcement> {
  const res = await client.patch(`/admin/announcements/${id}`, data);
  return res.data.data;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await client.delete(`/admin/announcements/${id}`);
}
