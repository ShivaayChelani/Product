import { apiClient } from './client';

export interface TripPlanStop {
  placeId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  order: number;
  distanceFromPrev?: number;
  description: string;
}

export interface TripPlanDay {
  day: number;
  theme: string;
  stops: TripPlanStop[];
}

export interface TripPlanResult {
  title: string;
  days: TripPlanDay[];
  totalPlaces: number;
  totalDistance: number;
  note: string;
}

export const aiApi = {
  async planTrip(params: {
    prompt?: string;
    location?: string;
    days?: number;
    interests?: string;
    pace?: string;
    lat?: number;
    lng?: number;
  }) {
    let path = '/ai/trip-planner';
    const queryParts: string[] = [];
    if (params.prompt) queryParts.push(`prompt=${encodeURIComponent(params.prompt)}`);
    if (params.location) queryParts.push(`location=${encodeURIComponent(params.location)}`);
    if (params.days) queryParts.push(`days=${params.days}`);
    if (params.interests) queryParts.push(`interests=${encodeURIComponent(params.interests)}`);
    if (params.pace) queryParts.push(`pace=${encodeURIComponent(params.pace)}`);
    if (params.lat) queryParts.push(`lat=${params.lat}`);
    if (params.lng) queryParts.push(`lng=${params.lng}`);

    if (queryParts.length > 0) {
      path += `?${queryParts.join('&')}`;
    }
    return apiClient.get<TripPlanResult>(path);
  },
};
