import crypto from 'crypto';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 32;

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export type PlannerCacheInput = Record<string, unknown>;

function stableHash(input: PlannerCacheInput): string {
  const normalized = JSON.stringify(input, Object.keys(input).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function getCachedPlan(input: PlannerCacheInput): unknown | null {
  const key = stableHash(input);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCachedPlan(input: PlannerCacheInput, result: unknown): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(stableHash(input), { result, expiresAt: Date.now() + TTL_MS });
}

export function clearPlannerCache(): void {
  cache.clear();
}

export function buildPlannerCacheKey(input: {
  destination: string;
  days: number;
  pace?: string;
  travelers?: string;
  budget?: string;
  customBudgetAmount?: number;
  interests?: string[];
  timePreference?: string;
  avoid?: string[];
  prompt?: string;
  manualPlaceIds?: string[];
  fillWithAi?: boolean;
  startDate?: string;
  transportation?: string[];
  regenerateDayNumber?: number;
  tripId?: string;
  refresh?: boolean;
  variationSeed?: number;
}): PlannerCacheInput {
  return {
    destination: (input.destination || '').trim().toLowerCase(),
    days: input.days,
    pace: input.pace ?? 'BALANCED',
    travelers: input.travelers ?? 'SOLO',
    budget: input.budget ?? 'MEDIUM',
    customBudgetAmount: input.customBudgetAmount ?? null,
    interests: [...(input.interests || [])].sort(),
    timePreference: input.timePreference ?? null,
    avoid: [...(input.avoid || [])].sort(),
    prompt: (input.prompt || '').trim(),
    manualPlaceIds: [...(input.manualPlaceIds || [])].sort(),
    fillWithAi: !!input.fillWithAi,
    startDate: input.startDate ?? null,
    transportation: [...(input.transportation || [])].sort(),
    regenerateDayNumber: input.regenerateDayNumber ?? null,
    tripId: input.tripId ?? null,
    refresh: !!input.refresh,
    variationSeed: input.variationSeed ?? 0,
  };
}
