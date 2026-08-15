import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AiGenerateInput, AiGenerateResult } from '../../services/api/trips';

const CACHE_KEY = '@palsafar/ai_plan_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 16;

interface CacheEntry {
  result: AiGenerateResult;
  expiresAt: number;
}

function stableKey(input: AiGenerateInput): string {
  return JSON.stringify({
    destination: (input.destination || '').trim().toLowerCase(),
    days: input.days,
    pace: input.pace,
    travelers: input.travelers,
    budget: input.budget,
    interests: [...(input.interests || [])].sort(),
    avoid: [...(input.avoid || [])].sort(),
    transportation: [...(input.transportation || [])].sort(),
    prompt: (input.prompt || '').trim(),
    refresh: !!input.refresh,
    variationSeed: input.variationSeed ?? 0,
    regenerateDayNumber: input.regenerateDayNumber ?? null,
  });
}

async function readCache(): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeCache(map: Record<string, CacheEntry>): Promise<void> {
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => (map[a].expiresAt || 0) - (map[b].expiresAt || 0));
    for (const k of sorted.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
  }
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

export async function getCachedAiPlan(input: AiGenerateInput): Promise<AiGenerateResult | null> {
  const key = stableKey(input);
  const map = await readCache();
  const entry = map[key];
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.result;
}

export async function setCachedAiPlan(input: AiGenerateInput, result: AiGenerateResult): Promise<void> {
  const key = stableKey(input);
  const map = await readCache();
  map[key] = { result, expiresAt: Date.now() + CACHE_TTL_MS };
  await writeCache(map);
}
