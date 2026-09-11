import { apiClient } from './client';

export interface TreasureHunt {
  id: string;
  city: string;
  title: string;
  description: string | null;
  rewardCoins: number;
  status: string;
  /** present on /active/current-location */
  riddleCount?: number;
  /** id + sequence only (clues are hidden until the riddle becomes active) */
  riddles?: RiddleMeta[];
  myProgress?: HuntProgressInfo | null;
}

export interface RiddleMeta {
  id: string;
  sequence: number;
  rewardCoins: number;
}

export interface Riddle {
  id: string;
  huntId: string;
  sequence: number;
  clueEnglish: string;
  clueHindi: string;
  rewardCoins: number;
}

export interface HuntProgressInfo {
  currentRiddleId: string | null;
  isCompleted: boolean;
  coinsEarned: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface NextRiddle {
  id: string;
  sequence: number;
}

export interface SubmitAnswerResult {
  correct: boolean;
  rewardCoins: number;
  huntCompleteReward: number;
  nextRiddle: NextRiddle | null;
  huntCompleted: boolean;
}

export interface HuntProgress {
  id: string;
  huntId: string;
  currentRiddleId: string | null;
  isCompleted: boolean;
  coinsEarned: number;
  hunt: {
    city: string;
    title: string;
    rewardCoins: number;
    _count: { riddles: number };
  };
}

export const riddlesApi = {
  /** Get the active hunt in the user's current GPS city */
  async getActiveForCurrentLocation(lat: number, lng: number) {
    return apiClient.get<{ city: string; hunt: TreasureHunt | null }>(`/riddles/active/current-location?lat=${lat}&lng=${lng}`);
  },

  /** Get hunt details (city-gated on the backend). Requires GPS coords. */
  async getHuntDetails(huntId: string, lat: number, lng: number) {
    return apiClient.get<TreasureHunt>(`/riddles/hunt/${huntId}?lat=${lat}&lng=${lng}`);
  },

  /** Get a single riddle (city-gated on the backend). Requires GPS coords. */
  async getRiddle(huntId: string, riddleId: string, lat: number, lng: number) {
    return apiClient.get<Riddle>(`/riddles/hunt/${huntId}/riddle/${riddleId}?lat=${lat}&lng=${lng}`);
  },

  /** Submit answer (city-gated on the backend). language: 'en' | 'hi' */
  async submitAnswer(huntId: string, riddleId: string, answer: string, language: 'en' | 'hi', lat: number, lng: number) {
    return apiClient.post<SubmitAnswerResult>(
      `/riddles/hunt/${huntId}/riddle/${riddleId}/answer?lat=${lat}&lng=${lng}`,
      { answer, language }
    );
  },

  /** Get my progress across all hunts */
  async getMyHuntProgress() {
    return apiClient.get<HuntProgress[]>('/riddles/my-progress');
  },
};