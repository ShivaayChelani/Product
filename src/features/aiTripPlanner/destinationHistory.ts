import AsyncStorage from '@react-native-async-storage/async-storage';
import { DESTINATION_HISTORY_KEY } from './constants';

const MAX = 8;

export async function loadDestinationHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DESTINATION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function pushDestinationHistory(label: string): Promise<string[]> {
  const trimmed = label.trim();
  if (!trimmed) return loadDestinationHistory();
  const current = await loadDestinationHistory();
  const next = [trimmed, ...current.filter(x => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX);
  await AsyncStorage.setItem(DESTINATION_HISTORY_KEY, JSON.stringify(next));
  return next;
}
