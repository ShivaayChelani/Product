import { TouristSpot, City } from '../types';
import { haversineDistance } from './location';

function buildCities(places: TouristSpot[]): City[] {
  const map = new Map<string, City>();
  for (const spot of places) {
    const key = `${spot.city}|${spot.state}`;
    if (!map.has(key)) {
      map.set(key, {
        id: spot.city.toLowerCase().replace(/\s+/g, '-'),
        name: spot.city,
        state: spot.state,
        latitude: spot.latitude,
        longitude: spot.longitude,
        description: `Explore ${spot.city}, ${spot.state}`,
        spotCount: 0,
      });
    }
    map.get(key)!.spotCount++;
  }
  return Array.from(map.values());
}

export function findNearestCity(places: TouristSpot[], latitude: number, longitude: number): City | null {
  const cities = buildCities(places);
  if (cities.length === 0) return null;

  let nearestCity = cities[0];
  let minDistance = haversineDistance(latitude, longitude, cities[0].latitude, cities[0].longitude);

  for (const city of cities) {
    const distance = haversineDistance(latitude, longitude, city.latitude, city.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  }

  return nearestCity;
}

export function getSpotById(places: TouristSpot[], id: string): TouristSpot | undefined {
  return places.find(s => s.id === id);
}

export function getNearbySpots(
  places: TouristSpot[],
  position: { latitude: number; longitude: number },
  radiusKm: number = 50,
): (TouristSpot & { distance: number })[] {
  return places
    .map(s => ({
      ...s,
      distance: haversineDistance(position.latitude, position.longitude, s.latitude, s.longitude),
    }))
    .filter(s => s.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

export const CATEGORY_FILTERS = [
  { key: 'all', label: 'All', icon: '🔍' },
  { key: 'must_visit', label: 'Must Visit', icon: '⭐' },
  { key: 'hidden_gems', label: 'Hidden Gems', icon: '💎' },
  { key: 'nature', label: 'Nature', icon: '🌿' },
  { key: 'waterfall', label: 'Waterfalls', icon: '💧' },
  { key: 'temple', label: 'Temples', icon: '🛕' },
  { key: 'fort', label: 'Forts', icon: '🏰' },
  { key: 'palace', label: 'Palaces', icon: '👑' },
  { key: 'heritage', label: 'Heritage', icon: '🏛️' },
  { key: 'adventure', label: 'Adventure', icon: '🎯' },
  { key: 'lake', label: 'Lakes', icon: '🌊' },
  { key: 'wildlife', label: 'Wildlife', icon: '🐅' },
  { key: 'spiritual', label: 'Spiritual', icon: '🕉️' },
  { key: 'cultural', label: 'Cultural', icon: '🎨' },
  { key: 'garden', label: 'Gardens', icon: '🌺' },
  { key: 'ghat', label: 'Ghats', icon: '🪜' },
];

export const CATEGORY_EMOJI: Record<string, string> = {
  nature: '🌿', waterfall: '💧', river: '🌊', viewpoint: '🌄',
  temple: '🛕', fort: '🏰', palace: '👑', museum: '🏛️',
  garden: '🌺', park: '🌳', wildlife: '🐅', heritage: '🏛️',
  spiritual: '🕉️', adventure: '🎯', photography: '📸',
  cultural: '🎨', lake: '🌊', history: '📜', ghat: '🕉️',
  church: '⛪', mosque: '🕌',
};

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] || '📍';
}
