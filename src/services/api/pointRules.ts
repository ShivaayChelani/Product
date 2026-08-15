import { apiClient } from './client';

export interface PointRule {
  id: string;
  key: string;
  label: string;
  description: string | null;
  points: number;
  xpAmount: number;
  category: string;
  isActive: boolean;
  cooldownSec: number | null;
  maxDaily: number | null;
}

export const pointRulesApi = {
  async list() {
    return apiClient.get<PointRule[]>('/point-rules');
  },

  async getByKey(key: string) {
    return apiClient.get<PointRule>(`/point-rules/${key}`);
  },

  async create(data: Partial<PointRule>) {
    return apiClient.post<PointRule>('/point-rules', data);
  },

  async update(id: string, data: Partial<PointRule>) {
    return apiClient.patch<PointRule>(`/point-rules/${id}`, data);
  },

  async delete(id: string) {
    return apiClient.delete(`/point-rules/${id}`);
  },
};
