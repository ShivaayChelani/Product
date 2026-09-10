import { apiClient } from './client';

export interface Riddle {
  id: string;
  title: string;
  clue: string;
  hintImage: string | null;
  city: string;
  rewardPoints: number;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  hasHint: boolean;
}

export type RiddleSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface MyRiddleSubmission {
  id: string;
  status: RiddleSubmissionStatus;
  photoUrl: string;
  adminComment: string | null;
  pointsAwarded: number;
  createdAt: string;
  reviewedAt: string | null;
  riddle: {
    id: string;
    title: string;
    clue: string;
    city: string;
    rewardPoints: number;
  };
}

export const riddlesApi = {
  /** Get all active riddles for the given current location */
  async getActiveForCurrentLocation(lat: number, lng: number) {
    return apiClient.get<{ city: string; riddles: Riddle[] }>(`/riddles/active/current-location?lat=${lat}&lng=${lng}`);
  },

  /** Get riddle detail ensuring current city matches */
  async getById(riddleId: string, lat: number, lng: number) {
    return apiClient.get<Riddle>(`/riddles/${riddleId}?lat=${lat}&lng=${lng}`);
  },

  /** Get the visual hint for a riddle (server verifies city). */
  async getHint(riddleId: string, userLat: number, userLng: number) {
    return apiClient.post<{ hintImage: string | null }>(`/riddles/${riddleId}/hint`, { userLat, userLng });
  },

  /** Validate if user is close enough to submit */
  async validateCheckIn(riddleId: string, userLat: number, userLng: number) {
    return apiClient.post<{ allowed: boolean; distanceMeters: number }>(`/riddles/${riddleId}/validate-checkin`, { userLat, userLng });
  },

  /** Get my submission status for a specific riddle */
  async getMySubmission(riddleId: string) {
    return apiClient.get<{
      id: string;
      status: RiddleSubmissionStatus;
      photoUrl: string;
      adminComment: string | null;
      pointsAwarded: number;
      createdAt: string;
      reviewedAt: string | null;
    } | null>(`/riddles/${riddleId}/my-submission`);
  },

  /** Get all my submissions across riddles */
  async getMySubmissions() {
    return apiClient.get<MyRiddleSubmission[]>('/riddles/my-submissions');
  },

  /** Submit a photo answer for a riddle (server validates GPS again) */
  async submit(riddleId: string, photoUrl: string, userLat: number, userLng: number) {
    return apiClient.post<{ id: string; status: string }>(`/riddles/${riddleId}/submit`, { photoUrl, userLat, userLng });
  },
};
