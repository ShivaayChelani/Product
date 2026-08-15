import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TouristSpot } from '../types';

const SEARCHED_KEY = '@palsafar_passport_searched_places';

export type PassportPlace = Pick<
  TouristSpot,
  'id' | 'name' | 'city' | 'state' | 'category' | 'isHiddenGem'
> & {
  source: 'search' | 'itinerary';
  slug?: string;
};

let searchedMemory: Record<string, PassportPlace> = {};
let searchedLoaded = false;

function normalizePlace(
  input: Partial<TouristSpot> & { id: string; name?: string },
  source: PassportPlace['source'],
): PassportPlace | null {
  if (!input?.id) return null;
  return {
    id: String(input.id),
    name: input.name || 'Place',
    city: (input.city || '').trim() || 'Unknown',
    state: (input.state || '').trim() || 'Unknown',
    category: input.category || 'general',
    isHiddenGem: !!(input.isHiddenGem || input.category?.toLowerCase() === 'hidden_gem'),
    source,
    slug: (input as any).slug || undefined,
  };
}

export async function loadSearchedPassportPlaces(): Promise<PassportPlace[]> {
  if (!searchedLoaded) {
    try {
      const raw = await AsyncStorage.getItem(SEARCHED_KEY);
      if (raw) searchedMemory = JSON.parse(raw) || {};
    } catch {
      // keep memory
    }
    searchedLoaded = true;
  }
  return Object.values(searchedMemory);
}

export async function recordSearchedPlace(
  input: Partial<TouristSpot> & { id: string; name?: string },
): Promise<void> {
  const place = normalizePlace(input, 'search');
  if (!place) return;
  await loadSearchedPassportPlaces();
  searchedMemory = {
    ...searchedMemory,
    [place.id]: { ...searchedMemory[place.id], ...place, source: 'search' },
  };
  try {
    await AsyncStorage.setItem(SEARCHED_KEY, JSON.stringify(searchedMemory));
  } catch {
    // ignore persist failures
  }
}

export function mergePassportPlaces(places: PassportPlace[]): PassportPlace[] {
  const map = new Map<string, PassportPlace>();
  for (const p of places) {
    if (!p?.id) continue;
    const prev = map.get(p.id);
    if (!prev) {
      map.set(p.id, p);
      continue;
    }
    // Prefer richer metadata; keep itinerary source if either is itinerary
    map.set(p.id, {
      ...prev,
      ...p,
      name: p.name || prev.name,
      city: p.city !== 'Unknown' ? p.city : prev.city,
      state: p.state !== 'Unknown' ? p.state : prev.state,
      source: prev.source === 'itinerary' || p.source === 'itinerary' ? 'itinerary' : 'search',
      isHiddenGem: prev.isHiddenGem || p.isHiddenGem,
    });
  }
  return Array.from(map.values());
}
