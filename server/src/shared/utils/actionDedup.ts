import { getRedisClient } from '../../config/redis';

const memory = new Map<string, number>();
const MAX_MEMORY_KEYS = 20_000;

export const REEL_VIEW_DEDUP_MS = 30 * 60 * 1000;
export const REEL_SHARE_DEDUP_MS = 2 * 60 * 1000;
export const PLACE_STAT_DEDUP_MS = 15 * 60 * 1000;

function pruneMemory(now: number) {
  if (memory.size < MAX_MEMORY_KEYS) return;
  for (const [key, expiresAt] of memory) {
    if (expiresAt <= now) memory.delete(key);
  }
  if (memory.size >= MAX_MEMORY_KEYS) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
}

function claimMemory(key: string, ttlMs: number): boolean {
  const now = Date.now();
  const expiresAt = memory.get(key);
  if (expiresAt && expiresAt > now) return false;
  memory.set(key, now + ttlMs);
  pruneMemory(now);
  return true;
}

/** Returns true if this is the first claim within ttl (action should proceed). */
export async function claimActionSlot(key: string, ttlMs: number): Promise<boolean> {
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  const redis = getRedisClient();
  if (redis) {
    try {
      const ok = await redis.set(`dedup:${key}`, '1', 'EX', ttlSec, 'NX');
      return ok === 'OK';
    } catch {
      // Fall through to process memory if Redis is unavailable.
    }
  }
  return claimMemory(key, ttlMs);
}

export function resetActionDedupForTests(): void {
  memory.clear();
}
