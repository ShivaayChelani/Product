export const HOME_SEARCH_PLACEHOLDERS = [
  'Search places, stays, restaurants...',
  'Search hotels and homestays...',
  'Search hidden gems nearby...',
  'Search cafes and food...',
];

export type HomeCategoryMode =
  | 'gps_nearby'
  | 'city_vendors'
  | 'city_places'
  | 'city_offers'
  | 'universal';

export interface HomeCategoryDef {
  id: string;
  name: string;
  query: string;
  icon: 'navigate-outline' | 'bed-outline' | 'restaurant-outline' | 'walk-outline' | 'business-outline' | 'calendar-outline' | 'pricetag-outline' | 'grid-outline';
  mode: HomeCategoryMode;
  vendorType?: 'hotel' | 'restaurant';
  placeCategories?: string[];
  placeTags?: string[];
  nameKeywords?: string[];
}

const HOME_CATEGORY_ALIASES: Record<string, string> = {
  hotels: 'stay',
  hotel: 'stay',
  temples: 'temples',
  temple: 'temples',
};

export const HOME_CATEGORIES: HomeCategoryDef[] = [
  { id: 'nearby', name: 'Nearby', query: 'Nearby', icon: 'navigate-outline', mode: 'gps_nearby' },
  { id: 'stay', name: 'Stay', query: 'Stay', icon: 'bed-outline', mode: 'city_vendors', vendorType: 'hotel' },
  { id: 'food', name: 'Food', query: 'Food', icon: 'restaurant-outline', mode: 'city_vendors', vendorType: 'restaurant' },
  {
    id: 'temples',
    name: 'Temples',
    query: 'Temples',
    icon: 'business-outline',
    mode: 'city_places',
    placeCategories: ['temple', 'church', 'mosque', 'gurudwara', 'gurdwara', 'spiritual', 'religious'],
    placeTags: ['temple', 'spiritual'],
  },
  {
    id: 'adventure',
    name: 'Adventure',
    query: 'Adventure',
    icon: 'walk-outline',
    mode: 'city_places',
    placeCategories: ['adventure', 'trek', 'trekking', 'camping', 'viewpoint', 'wildlife', 'national_park', 'beach'],
    placeTags: ['adventure', 'trek', 'trekking', 'camping'],
  },
  {
    id: 'heritage',
    name: 'Heritage',
    query: 'Heritage',
    icon: 'business-outline',
    mode: 'city_places',
    placeCategories: ['heritage', 'fort', 'monument', 'temple', 'palace', 'museum', 'history', 'cultural', 'church', 'mosque', 'gurudwara'],
    placeTags: ['heritage', 'fort', 'monument', 'history'],
  },
  {
    id: 'events',
    name: 'Events',
    query: 'Events',
    icon: 'calendar-outline',
    mode: 'city_places',
    placeCategories: ['cultural', 'event', 'festival'],
    placeTags: ['event', 'festival', 'fair', 'exhibition'],
    nameKeywords: ['event', 'festival', 'fair', 'mela'],
  },
  { id: 'offers', name: 'Offers', query: 'Offers', icon: 'pricetag-outline', mode: 'city_offers' },
];

export function getHomeCategoryById(id: string): HomeCategoryDef | undefined {
  const resolved = HOME_CATEGORY_ALIASES[id.trim().toLowerCase()] || id.trim().toLowerCase();
  return HOME_CATEGORIES.find(c => c.id === resolved);
}

export function getHomeCategoryForQuery(query: string): HomeCategoryDef | undefined {
  const q = query.trim().toLowerCase();
  const aliased = HOME_CATEGORY_ALIASES[q];
  if (aliased) return HOME_CATEGORIES.find(c => c.id === aliased);
  return HOME_CATEGORIES.find(
    c => c.query.toLowerCase() === q || c.name.toLowerCase() === q || c.id === q,
  );
}

export function placeMatchesHomeCategory(
  place: { category?: string | null; tags?: string[] | null; name?: string | null },
  category: HomeCategoryDef,
): boolean {
  const cat = (place.category || '').toLowerCase();
  const tags = (place.tags || []).map(t => t.toLowerCase());
  const name = (place.name || '').toLowerCase();

  if (category.placeCategories?.some(c => cat === c.toLowerCase() || cat.includes(c.toLowerCase()))) {
    return true;
  }
  if (category.placeTags?.some(t => tags.some(tag => tag.includes(t.toLowerCase())))) {
    return true;
  }
  if (category.nameKeywords?.some(kw => name.includes(kw.toLowerCase()))) {
    return true;
  }
  return false;
}
