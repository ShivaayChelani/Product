import client from "./client";

// ─── Riddle types ─────────────────────────────────────────────────────────────

export interface Riddle {
  id: string;
  title: string;
  clue: string;
  hintImage: string | null;
  correctPlaceName: string;
  correctLat: number | null;
  correctLng: number | null;
  city: string;
  rewardPoints: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  _count: { submissions: number };
}

export interface RiddleSubmission {
  id: string;
  riddleId: string;
  userId: string;
  photoUrl: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminComment: string | null;
  pointsAwarded: number;
  reviewedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null; avatarStyle: number };
  riddle: { id: string; title: string; city: string; correctPlaceName?: string };
}

// ─── Riddle CRUD (admin) ──────────────────────────────────────────────────────

export async function getRiddles(params?: {
  page?: number;
  limit?: number;
  isActive?: string;
  city?: string;
  search?: string;
}) {
  const res = await client.get("/admin/riddles", { params });
  return res.data;
}

export async function getRiddle(id: string) {
  const res = await client.get(`/admin/riddles/${id}`);
  return res.data.data;
}

export async function createRiddle(data: {
  title: string;
  clue: string;
  hintImage?: string;
  correctPlaceName: string;
  correctLat?: number;
  correctLng?: number;
  city: string;
  rewardPoints?: number;
  startsAt: string;
  endsAt?: string;
}) {
  const res = await client.post("/admin/riddles", data);
  return res.data.data;
}

export async function updateRiddle(
  id: string,
  data: Partial<{
    title: string;
    clue: string;
    hintImage: string | null;
    correctPlaceName: string;
    correctLat: number;
    correctLng: number;
    city: string;
    rewardPoints: number;
    isActive: boolean;
    startsAt: string;
    endsAt: string | null;
  }>
) {
  const res = await client.patch(`/admin/riddles/${id}`, data);
  return res.data.data;
}

export async function deleteRiddle(id: string) {
  await client.delete(`/admin/riddles/${id}`);
}

// ─── Submission Review ────────────────────────────────────────────────────────

export async function getRiddleSubmissions(
  riddleId: string,
  params?: { page?: number; limit?: number; status?: string }
) {
  const res = await client.get(`/admin/riddles/${riddleId}/submissions`, { params });
  return res.data;
}

export async function getAllPendingSubmissions(params?: { page?: number; limit?: number }) {
  const res = await client.get("/admin/riddles/submissions/pending", { params });
  return res.data;
}

export async function approveSubmission(submissionId: string) {
  const res = await client.post(`/admin/riddles/submissions/${submissionId}/approve`);
  return res.data.data;
}

export async function rejectSubmission(submissionId: string, adminComment: string) {
  const res = await client.post(`/admin/riddles/submissions/${submissionId}/reject`, {
    adminComment,
  });
  return res.data.data;
}
