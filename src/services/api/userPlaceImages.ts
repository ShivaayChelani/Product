import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';

export interface ContributionStatus {
  needsImage: boolean;
  remainingPaidSlots: number;
  hasPendingSubmission: boolean;
  pendingSubmissionId: string | null;
}

export interface UserPlaceImage {
  id: string;
  placeId: string;
  userId: string;
  url: string;
  status: 'pending' | 'approved' | 'rejected';
  pointsAwarded: boolean;
  points?: number;
  createdAt: string;
  reviewedAt: string | null;
}

export const userPlaceImagesApi = {
  async contribute(placeId: string, url: string) {
    const res = await apiClient.post<UserPlaceImage>(
      `/places/${placeId}/contribute-image`,
      { url },
    );
    return res.data;
  },

  async getContributionStatus(placeId: string) {
    const res = await apiClient.get<ContributionStatus>(
      `/places/${placeId}/contribution-status`,
    );
    return res.data;
  },
};
