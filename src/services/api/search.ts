import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';
import type { PlaceResponse } from './places';

export interface SearchQuery {
  q?: string;
  category?: string;
  tags?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  sort?: 'relevance' | 'popularity' | 'newest' | 'distance';
  page?: number;
  limit?: number;
}

export const searchApi = {
  async search(query: SearchQuery) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v));
    });
    return apiClient.get<PlaceResponse[]>(
      `${API_CONFIG.endpoints.places.search}?${params.toString()}`,
    );
  },

  async getTrending() {
    const res = await apiClient.get<PlaceResponse[]>(
      API_CONFIG.endpoints.places.trending,
    );
    return res.data;
  },

  async getHiddenGems() {
    const res = await apiClient.get<PlaceResponse[]>(
      API_CONFIG.endpoints.places.hiddenGems,
    );
    return res.data;
  },

  async getRecommendations(placeId: string) {
    const res = await apiClient.get<PlaceResponse[]>(
      API_CONFIG.endpoints.places.recommendations(placeId),
    );
    return res.data;
  },
};
