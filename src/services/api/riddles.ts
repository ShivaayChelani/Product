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
    correctPlaceName: string;
  };
}

export const riddlesApi = {
  /** Get all active riddles for the given city */
  async getActiveForCity(city: string) {
    return apiClient.get<Riddle[]>(`/riddles/active?city=${encodeURIComponent(city)}`);
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

  /** Submit a photo answer for a riddle */
  async submit(riddleId: string, photoUrl: string) {
    return apiClient.post<{ id: string; status: string }>(`/riddles/${riddleId}/submit`, { photoUrl });
  },
};
