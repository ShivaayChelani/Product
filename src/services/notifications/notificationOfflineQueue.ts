import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { notificationsApi } from '../api/notifications';
import { trackNotificationEvent } from './notificationAnalytics';

const QUEUE_KEY = 'ps_notif_offline_queue_v1';

type QueueItem =
  | { op: 'mark_read'; ids: string[]; at: number }
  | { op: 'mark_all_read'; at: number };

let flushing = false;

async function readQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueMarkRead(notificationIds: string[]): Promise<void> {
  const queue = await readQueue();
  queue.push({ op: 'mark_read', ids: notificationIds, at: Date.now() });
  await writeQueue(queue);
  void flushOfflineQueue();
}

export async function enqueueMarkAllRead(): Promise<void> {
  const queue = await readQueue();
  queue.push({ op: 'mark_all_read', at: Date.now() });
  await writeQueue(queue);
  void flushOfflineQueue();
}

export async function flushOfflineQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return;

    const queue = await readQueue();
    if (!queue.length) return;

    const remaining: QueueItem[] = [];
    for (const item of queue) {
      try {
        if (item.op === 'mark_read') {
          await notificationsApi.markRead(item.ids);
        } else {
          await notificationsApi.markAllRead();
        }
        trackNotificationEvent('retry', { op: item.op, success: true });
      } catch {
        remaining.push(item);
        trackNotificationEvent('retry', { op: item.op, success: false });
      }
    }
    await writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

let netUnsub: (() => void) | null = null;

export function startOfflineQueueListener(): () => void {
  if (netUnsub) return netUnsub;
  netUnsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void flushOfflineQueue();
    }
  });
  return () => {
    netUnsub?.();
    netUnsub = null;
  };
}
