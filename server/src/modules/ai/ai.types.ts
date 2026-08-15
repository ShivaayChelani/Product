export interface PlaceScore {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  category: string;
  images: string[];
  tags: string[];
  score: number;
  signals: {
    categoryMatch: number;
    tagSimilarity: number;
    textSimilarity: number;
    distanceScore: number;
    popularityScore: number;
  };
  distance?: number;
}

export interface TripPlanDay {
  day: number;
  theme: string;
  stops: TripStop[];
}

export interface TripStop {
  placeId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  images: string[];
  timeSlot: 'morning' | 'afternoon' | 'evening';
  order: number;
  distanceFromPrev?: number;
  description: string;
}

export interface TripPlanResult {
  title: string;
  days: TripPlanDay[];
  totalPlaces: number;
  totalDistance: number;
  note: string;
}

export interface DiscoveryResult {
  query: string;
  parsed: {
    sentiment: string;
    category: string | null;
    location: string | null;
    tags: string[];
  };
  places: any[];
  note: string;
}

export interface UserPreferenceVector {
  categories: Record<string, number>;
  tags: Record<string, number>;
  totalInteractions: number;
  topCategory: string | null;
  topTags: string[];
}
