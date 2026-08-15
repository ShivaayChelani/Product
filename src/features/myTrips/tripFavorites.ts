import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@palsafar/trip_favorites';

export async function loadTripFavoriteIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function toggleTripFavorite(tripId: string): Promise<string[]> {
  const current = await loadTripFavoriteIds();
  const next = current.includes(tripId)
    ? current.filter(id => id !== tripId)
    : [...current, tripId];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
