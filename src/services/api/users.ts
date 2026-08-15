import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  permission: string;
  role?: string;
  roles?: string[];
  createdAt: string;
  updatedAt: string;
}

export const usersApi = {
  async list(page = 1, limit = 20) {
    return apiClient.get<UserResponse[]>(
      `${API_CONFIG.endpoints.users.list}?page=${page}&limit=${limit}`,
    );
  },

  async getById(id: string) {
    const res = await apiClient.get<UserResponse>(
      API_CONFIG.endpoints.users.byId(id),
    );
    return res.data!;
  },

  async updateRole(id: string, permission: 'USER' | 'ADMIN' | 'VENDOR' | 'CONTENT_CREATOR') {
    const res = await apiClient.patch<UserResponse>(
      API_CONFIG.endpoints.users.role(id),
      { permission },
    );
    return res.data!;
  },
};
