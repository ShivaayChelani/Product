import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'PALSAFAR_SAVED_OFFERS';

export async function loadSavedOfferIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function toggleSavedOfferId(id: string): Promise<string[]> {
  const current = await loadSavedOfferIds();
  const next = current.includes(id) ? current.filter(x => x !== id) : [id, ...current];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* non-blocking */
  }
  return next;
}
