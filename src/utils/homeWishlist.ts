import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'PALSAFAR_HOME_WISHLIST';

export async function loadWishlistIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveWishlistIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // non-blocking
  }
}

export async function toggleWishlistId(id: string): Promise<string[]> {
  const current = await loadWishlistIds();
  const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
  await saveWishlistIds(next);
  return next;
}
