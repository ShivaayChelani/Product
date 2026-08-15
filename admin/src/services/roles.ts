import client from "./client";
import type { SingleResponse } from "@/types";
import type { AdminRole } from "@/components/PermissionWrapper";

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  permissions: unknown[];
  createdAt: string;
  updatedAt: string;
  users?: Array<{ id: string; name: string; email: string; createdAt: string }>;
}

export async function getRoles(): Promise<Role[]> {
  const res = await client.get<SingleResponse<Role[]>>("/admin/roles");
  return res.data.data || [];
}

export async function getRole(id: string): Promise<Role> {
  const res = await client.get<SingleResponse<Role>>(`/admin/roles/${id}`);
  return res.data.data;
}

export type { AdminRole };
