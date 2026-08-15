import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';

export type TravelPace = 'QUICK' | 'BALANCED' | 'RELAXED' | 'VERY_RELAXED';
export type TripStatus = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type TimeSlot = 'SUNRISE' | 'MORNING' | 'AFTERNOON' | 'EVENING' | 'SUNSET' | 'NIGHT';
export type TimePreference = 'MORNING_FOCUSED' | 'FULL_DAY' | 'EVENING_FRIENDLY';
export type AvoidOption = 'CROWDED' | 'LONG_TRAVEL' | 'EXPENSIVE_ENTRY' | 'NON_FAMILY_FRIENDLY';
export type GenerationSource = 'MANUAL' | 'AI_PROMPT' | 'HYBRID';
export type BudgetTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM';
export type Travelers = 'SOLO' | 'COUPLE' | 'FAMILY' | 'FRIENDS';

export interface TripPlan {
  id: string;
  title: string;
  description?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userId: string;
  days: number;
  travelers?: string | null;
  transportation: string[];
  budget?: string | null;
  accommodation?: string | null;
  interests: string[];
  coverImage?: string | null;
  totalDistance?: number | null;
  totalTravelTime?: number | null;
  estimatedBudget?: number | null;
  customBudgetAmount?: number | null;
  pace: TravelPace;
  timePreference?: TimePreference | null;
  avoid: AvoidOption[];
  generationSource: GenerationSource;
  aiPrompt?: string | null;
  aiPreferences?: Record<string, any> | null;
  generatedAt?: string | null;
  status?: TripStatus | null;
  isPublished: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  currentDayIndex?: number | null;
  currentStopIndex?: number | null;
  createdAt: string;
  updatedAt: string;
  tripDays: TripPlanDay[];
  /** Total itinerary stops. Present on list payloads that omit full stop rows. */
  stopsCount?: number;
  collaborators: TripCollaborator[];
  user: { id: string; name: string; avatar?: string | null; avatarStyle?: number };
}

export interface TripPlanDay {
  id: string;
  tripPlanId: string;
  dayNumber: number;
  date?: string | null;
  theme?: string | null;
  weather?: string | null;
  stops: TripPlanStop[];
  /** Prisma stop count. Used when `stops` is truncated (list cover thumbnail). */
  _count?: { stops?: number };
}

export interface TripPlanStop {
  id: string;
  tripPlanDayId: string;
  placeId: string;
  order: number;
  startTime?: string | null;
  endTime?: string | null;
  duration?: number | null;
  cost?: number | null;
  distanceFromPrev?: number | null;
  transportMode?: string | null;
  timeSlot?: TimeSlot | null;
  entryFee?: number | null;
  reason?: string | null;
  isPinned: boolean;
  notes?: string | null;
  visitedAt?: string | null;
  skippedAt?: string | null;
  checklists?: any;
  reminders?: any;
  photoAttachments: string[];
  voiceNotes: string[];
  place: {
    id: string;
    name: string;
    slug: string;
    description: string;
    latitude?: number | null;
    longitude?: number | null;
    category: string;
    tags: string[];
    images: string[];
    thumbnail?: string | null;
    city: string;
    state: string;
    rating?: number | null;
    reviewCount: number;
    openingHours?: any;
    ticketPrice?: any;
    bestTimeToVisit?: any;
    estimatedDurationMinutes?: number | null;
  };
}

export interface TripCollaborator {
  id: string;
  tripPlanId: string;
  userId: string;
  role: string;
  user: { id: string; name: string; avatar?: string | null; avatarStyle?: number };
}

export interface CreateTripInput {
  title: string;
  description?: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers?: Travelers;
  transportation?: string[];
  budget?: 'LOW' | 'MEDIUM' | 'LUXURY';
  accommodation?: 'HOTEL' | 'HOSTEL' | 'RESORT' | 'HOMESTAY';
  interests?: string[];
  coverImage?: string;
  pace?: TravelPace;
  timePreference?: TimePreference;
  avoid?: AvoidOption[];
}

export interface UpdateTripInput {
  title?: string;
  description?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  travelers?: Travelers;
  transportation?: string[];
  budget?: string;
  accommodation?: string;
  interests?: string[];
  coverImage?: string;
  status?: TripStatus;
  pace?: TravelPace;
  timePreference?: TimePreference;
  avoid?: AvoidOption[];
  isPublished?: boolean;
}

export interface AddStopInput {
  placeId: string;
  order?: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  cost?: number;
  entryFee?: number;
  distanceFromPrev?: number;
  transportMode?: string;
  timeSlot?: TimeSlot;
  notes?: string;
  reason?: string;
  isPinned?: boolean;
}

export interface UpdateStopInput {
  order?: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  cost?: number;
  entryFee?: number;
  distanceFromPrev?: number;
  transportMode?: string;
  timeSlot?: TimeSlot;
  notes?: string;
  reason?: string;
  isPinned?: boolean;
  checklists?: { id: string; text: string; done?: boolean }[];
  reminders?: { id: string; text: string; time?: string }[];
  photoAttachments?: string[];
  voiceNotes?: string[];
}

export interface GenerateItineraryInput {
  pace?: 'relaxed' | 'moderate' | 'fast';
  startLocation?: { latitude: number; longitude: number };
}

export interface OptimizeRouteInput {
  strategy?: 'shortest' | 'fastest' | 'scenic' | 'budget' | 'family' | 'food' | 'instagram' | 'heritage' | 'nature';
  startLocation?: { latitude: number; longitude: number };
}

export interface AiGenerateInput {
  tripId?: string;
  destination: string;
  days: number;
  pace?: TravelPace;
  travelers?: Travelers;
  budget?: BudgetTier;
  customBudgetAmount?: number;
  interests?: string[];
  timePreference?: TimePreference;
  avoid?: AvoidOption[];
  prompt?: string;
  manualPlaceIds?: string[];
  fillWithAi?: boolean;
  startDate?: string;
  transportation?: string[];
  regenerateDayNumber?: number;
  refresh?: boolean;
  variationSeed?: number;
}

export interface NearbyDestinationSuggestion {
  city: string;
  state: string;
  placeCount: number;
  distanceKm: number | null;
}

export interface AiGenerateDayInfo {
  dayNumber: number;
  theme: string;
  foodStops: Array<{ placeId: string; name: string; distanceKm: number }>;
  nearbyVendors: Array<{ vendorId: string; businessName: string; distanceKm: number }>;
}

export interface AiGenerateResult {
  trip: TripPlan;
  dayInfo?: AiGenerateDayInfo[];
  warnings?: string[];
  note?: string;
  nearbyDestinations?: NearbyDestinationSuggestion[];
}

export interface QuickAddResult {
  tripId: string;
  stopId: string;
  alreadyExists: boolean;
}

export interface TripProgressResponse {
  tripId: string;
  title: string;
  status: string;
  currentDayIndex: number;
  currentStopIndex: number;
  totalDays: number;
  totalStops: number;
  visitedCount: number;
  skippedCount: number;
  remainingCount: number;
  completionPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  currentDay: { dayNumber: number; theme: string | null } | null;
  currentStop: TripPlanStop | null;
  nextStop: TripPlanStop | null;
  tripDays: TripPlanDay[];
}

export interface AddCollaboratorInput {
  userId: string;
  role?: 'VIEWER' | 'EDITOR' | 'OWNER';
}

export function buildQueryString(params?: Record<string, any>): string {
  if (!params) return '';
  const clean: Record<string, string> = {};
  Object.entries(params).forEach(([key, val]) => {
    if (
      val !== undefined &&
      val !== null &&
      val !== '' &&
      val !== 'undefined' &&
      val !== 'null'
    ) {
      clean[key] = String(val);
    }
  });
  const str = new URLSearchParams(clean).toString();
  return str ? `?${str}` : '';
}

export const tripsApi = {
  async list(params?: { status?: string; page?: number; limit?: number }) {
    const query = buildQueryString(params);
    const res = await apiClient.get<TripPlan[]>(`${API_CONFIG.endpoints.trips.list}${query}`);
    return res;
  },

  async getById(id: string) {
    const res = await apiClient.get<TripPlan>(API_CONFIG.endpoints.trips.byId(id));
    return res.data;
  },

  async create(data: CreateTripInput) {
    const res = await apiClient.post<TripPlan>(API_CONFIG.endpoints.trips.create, data);
    return res.data;
  },

  async update(id: string, data: UpdateTripInput) {
    const cleanData: Record<string, any> = {};
    Object.entries(data).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== 'undefined') {
        cleanData[key] = val;
      }
    });
    const res = await apiClient.patch<TripPlan>(API_CONFIG.endpoints.trips.update(id), cleanData);
    return res.data;
  },

  async delete(id: string) {
    return apiClient.delete(API_CONFIG.endpoints.trips.delete(id));
  },

  async duplicate(id: string) {
    const res = await apiClient.post<TripPlan>(API_CONFIG.endpoints.trips.duplicate(id));
    return res.data;
  },

  async addStop(tripPlanDayId: string, data: AddStopInput) {
    const res = await apiClient.post<TripPlanStop>(API_CONFIG.endpoints.trips.addStop(tripPlanDayId), data);
    return res.data;
  },

  async updateStop(stopId: string, data: UpdateStopInput) {
    const res = await apiClient.patch<TripPlanStop>(API_CONFIG.endpoints.trips.updateStop(stopId), data);
    return res.data;
  },

  async deleteStop(stopId: string) {
    return apiClient.delete(API_CONFIG.endpoints.trips.deleteStop(stopId));
  },

  async reorderStops(tripPlanDayId: string, stopIds: string[]) {
    return apiClient.patch(API_CONFIG.endpoints.trips.reorderStops(tripPlanDayId), { stopIds });
  },

  async generateItinerary(id: string, data: GenerateItineraryInput) {
    const res = await apiClient.post<TripPlan>(API_CONFIG.endpoints.trips.generateItinerary(id), data);
    return res.data;
  },

  async optimizeRoute(id: string, data: OptimizeRouteInput) {
    const res = await apiClient.post<TripPlan>(API_CONFIG.endpoints.trips.optimizeRoute(id), data);
    return res.data;
  },

  async aiGenerate(data: AiGenerateInput) {
    const res = await apiClient.post<AiGenerateResult>(API_CONFIG.endpoints.trips.aiGenerate, data);
    return res.data;
  },

  async replaceStop(stopId: string, placeId: string) {
    const res = await apiClient.post<TripPlanStop>(API_CONFIG.endpoints.trips.replaceStop(stopId), { placeId });
    return res.data;
  },

  async regenerateDay(tripId: string, dayNumber: number, base: Omit<AiGenerateInput, 'tripId' | 'regenerateDayNumber'>) {
    return this.aiGenerate({ ...base, tripId, regenerateDayNumber: dayNumber, fillWithAi: true });
  },

  async toggleStopPin(stopId: string, isPinned: boolean) {
    return this.updateStop(stopId, { isPinned });
  },

  async quickAdd(placeId: string, tripId?: string) {
    const res = await apiClient.post<QuickAddResult>(API_CONFIG.endpoints.trips.quickAdd, { placeId, tripId });
    return res.data;
  },

  async addCollaborator(id: string, data: AddCollaboratorInput) {
    const res = await apiClient.post<TripCollaborator>(API_CONFIG.endpoints.trips.addCollaborator(id), data);
    return res.data;
  },

  async removeCollaborator(id: string, userId: string) {
    return apiClient.delete(API_CONFIG.endpoints.trips.removeCollaborator(id, userId));
  },

  async updateCollaboratorRole(id: string, userId: string, role: string) {
    return apiClient.patch(API_CONFIG.endpoints.trips.updateCollaboratorRole(id, userId), { role });
  },

  // Active trip management
  async startTrip(id: string) {
    const res = await apiClient.post<TripPlan>(API_CONFIG.endpoints.trips.start(id));
    return res.data;
  },

  async completeTrip(id: string) {
    const res = await apiClient.post<TripPlan>(API_CONFIG.endpoints.trips.complete(id));
    return res.data;
  },

  async getProgress(id: string) {
    const res = await apiClient.get<TripProgressResponse>(API_CONFIG.endpoints.trips.progress(id));
    return res.data;
  },

  async getHistory(params?: { page?: number; limit?: number }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const res = await apiClient.get<TripPlan[]>(`${API_CONFIG.endpoints.trips.history}${query}`);
    return res;
  },

  async visitStop(
    stopId: string,
    gps: { latitude: number; longitude: number; accuracy?: number; timestamp?: number },
  ) {
    const res = await apiClient.post<{
      stop: TripPlanStop;
      alreadyVerified?: boolean;
      distanceMeters?: number;
      checkpointReward?: { points: number; awarded: boolean } | null;
      completionBonus?: { points: number; awarded: boolean } | null;
    }>(API_CONFIG.endpoints.trips.visitStop(stopId), gps);
    return res.data;
  },

  async skipStop(stopId: string) {
    const res = await apiClient.post<TripPlanStop>(API_CONFIG.endpoints.trips.skipStop(stopId));
    return res.data;
  },
};
