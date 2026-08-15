import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InAppNotification } from '../../../services/api/notifications';

const CACHE_KEY = 'ps_notifications_feed_cache_v1';

export type CachedNotificationFeed = {
  savedAt: number;
  notifications: InAppNotification[];
  unreadCount: number;
};

export async function readNotificationListCache(): Promise<CachedNotificationFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedNotificationFeed;
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
