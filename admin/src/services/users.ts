import client from "./client";
import type { AppRole, User, PaginatedResponse, SingleResponse } from "@/types";

export async function getUsers(params?: {
  page?: number;
  limit?: number;
  permission?: string;
  search?: string;
  pendingApproval?: boolean;
}): Promise<PaginatedResponse<User>> {
  const res = await client.get<PaginatedResponse<User>>("/users", { params });
  return res.data;
}

export async function getUser(id: string): Promise<User> {
  const res = await client.get<SingleResponse<User>>(`/users/${id}`);
  return res.data.data;
}

export async function updateUserRole(
  id: string,
  permission: AppRole,
  confirmSwitch?: boolean
): Promise<User> {
  const res = await client.patch<SingleResponse<User>>(`/users/${id}/role`, {
    permission,
    ...(confirmSwitch !== undefined ? { confirmSwitch } : {}),
  });
  return res.data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await client.delete(`/users/${id}`);
}


