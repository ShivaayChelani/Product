import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InAppNotification } from '../../../services/api/notifications';
import { isPlainObject, parseJsonSafe } from '../../../utils/safeJson';

const CACHE_KEY = 'ps_notifications_feed_cache_v1';

export type CachedNotificationFeed = {
  savedAt: number;
  notifications: InAppNotification[];
  unreadCount: number;
};

function isCachedFeed(value: unknown): value is CachedNotificationFeed {
  if (!isPlainObject(value)) return false;
  if (!Array.isArray(value.notifications)) return false;
  if (typeof value.unreadCount !== 'number' || !Number.isFinite(value.unreadCount)) return false;
  if (typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) return false;
  return true;
}

export async function readNotificationListCache(): Promise<CachedNotificationFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return parseJsonSafe(raw, null, isCachedFeed);
  } catch {
    return null;
  }
}

export async function writeNotificationListCache(payload: CachedNotificationFeed): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* optional */
  }
}

export async function patchNotificationInCache(
  id: string,
  patch: Partial<InAppNotification>,
): Promise<void> {
  const cache = await readNotificationListCache();
  if (!cache) return;
  cache.notifications = cache.notifications.map(n => (n.id === id ? { ...n, ...patch } : n));
  if (patch.read === true) {
    cache.unreadCount = Math.max(0, cache.unreadCount - 1);
  }
  await writeNotificationListCache(cache);
}

export async function removeNotificationsFromCache(ids: string[]): Promise<void> {
  const cache = await readNotificationListCache();
  if (!cache) return;
  const set = new Set(ids);
  const removedUnread = cache.notifications.filter(n => set.has(n.id) && !n.read).length;
  cache.notifications = cache.notifications.filter(n => !set.has(n.id));
  cache.unreadCount = Math.max(0, cache.unreadCount - removedUnread);
  await writeNotificationListCache(cache);
}
