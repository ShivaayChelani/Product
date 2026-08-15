import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';
import { HiddenGemCategory } from '../../types';

export interface HiddenGemSubmission {
  id: string;
  userId: string;
  userName: string;
  placeName: string;
  category: HiddenGemCategory;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  imageUri?: string;
  description: string;
  bestTimeToVisit: { from: string; to: string; label?: string } | null;
  estimatedCost: string;
  safetyTip: string;
  worthVisitingReason: string;
  locationMethod: 'gps' | 'map_pick' | 'manual';
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  submittedAt: number;
  pointsReward: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface CreateHiddenGemInput {
  placeName: string;
  category: HiddenGemCategory;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  imageUri?: string;
  images?: string[];
  description: string;
  bestTimeToVisit?: { from: string; to: string; label?: string };
  estimatedCost?: string;
  safetyTip?: string;
  worthVisitingReason: string;
  locationMethod: 'gps' | 'map_pick' | 'manual';
}

export interface HiddenGemListQuery {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface ApproveHiddenGemInput {
  points?: number;
}

export interface RejectHiddenGemInput {
  reason?: string;
}

export const hiddenGemsApi = {
  async list(query?: HiddenGemListQuery) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const qs = params.toString();
    return apiClient.get<HiddenGemSubmission[]>(
      `${API_CONFIG.endpoints.hiddenGems.list}${qs ? `?${qs}` : ''}`,
    );
  },

  async getById(id: string) {
    return apiClient.get<HiddenGemSubmission>(
      API_CONFIG.endpoints.hiddenGems.byId(id),
    );
  },

  async create(input: CreateHiddenGemInput) {
    const ok = await apiClient.ensureAuth();
    if (!ok || !apiClient.getToken()) {
      const err = new Error('Authentication required. Please sign in to submit a hidden gem.') as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    const res = await apiClient.post<HiddenGemSubmission>(
      API_CONFIG.endpoints.hiddenGems.list,
      input,
    );
    return res.data;
  },

  async approve(id: string, input: ApproveHiddenGemInput) {
    const res = await apiClient.patch<HiddenGemSubmission>(
      API_CONFIG.endpoints.hiddenGems.approve(id),
      input,
    );
    return res.data;
  },

  async reject(id: string, input: RejectHiddenGemInput) {
    const res = await apiClient.patch<HiddenGemSubmission>(
      API_CONFIG.endpoints.hiddenGems.reject(id),
      input,
    );
    return res.data;
  },
};