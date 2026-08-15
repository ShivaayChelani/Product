import AsyncStorage from '@react-native-async-storage/async-storage';
import { placesApi } from './api';
import { redemptionsApi } from './api/redemptions';

const SYNC_QUEUE_KEY = 'PALSAFAR_SYNC_QUEUE';
/** Legacy DataContext queue — migrated once into SYNC_QUEUE_KEY then cleared. */
const LEGACY_QUEUE_KEY = '@palsasafar_offline_queue';

export type SyncActionType = 'CHECK_IN' | 'SAVE_PLACE' | 'UNSAVE_PLACE' | 'VERIFY_REDEMPTION';

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: any;
  /** Stable key for idempotent enqueue (type + business id). */
  dedupeKey: string;
  timestamp: number;
}

function dedupeKeyFor(type: SyncActionType, payload: any): string {
  if (type === 'VERIFY_REDEMPTION') {
    const code = String(payload?.code || payload?.token || '').trim().toUpperCase();
    return `VERIFY_REDEMPTION:${code}`;
  }
  const placeId = String(payload?.placeId || payload?.spotId || '');
  return `${type}:${placeId}`;
}

class SyncService {
  private queue: SyncAction[] = [];
  private isSyncing = false;
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try { l(); } catch { /* ignore */ }
    });
  }

  async init() {
    try {
      const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.queue = Array.isArray(parsed)
          ? parsed.map((a: any) => ({
              ...a,
              dedupeKey: a.dedupeKey || dedupeKeyFor(a.type, a.payload || {}),
            }))
          : [];
      }
      await this.migrateLegacyQueue();
    } catch (err) {
    }
  }

  /** One-time merge of DataContext offline queue into the canonical queue. */
  private async migrateLegacyQueue() {
    try {
      const legacyRaw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
      if (!legacyRaw) return;
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        for (const item of legacy) {
          if (item?.action === 'checkin' && item.spotId) {
            await this.queueAction('CHECK_IN', { placeId: item.spotId, spotId: item.spotId });
          } else if (item?.action === 'save' && item.spotId) {
            await this.queueAction('SAVE_PLACE', { placeId: item.spotId, spotId: item.spotId });
          }
        }
      }
      await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
    } catch (err) {
    }
  }

  pendingCount() {
    return this.queue.length;
  }

  getQueue(): SyncAction[] {
    return [...this.queue];
  }

  /**
   * Enqueue with idempotency: same dedupeKey replaces/keeps a single pending action.
   */
  async queueAction(type: SyncActionType, payload: any) {
    const dedupeKey = dedupeKeyFor(type, payload);
    if (!dedupeKey.endsWith(':') && dedupeKey.split(':')[1] === '') {
      return;
    }
    if (type === 'VERIFY_REDEMPTION' && dedupeKey === 'VERIFY_REDEMPTION:') {
      return;
    }

    const existingIdx = this.queue.findIndex((a) => a.dedupeKey === dedupeKey);
    const action: SyncAction = {
      id: existingIdx >= 0 ? this.queue[existingIdx].id : Math.random().toString(36).substring(2, 9),
      type,
      payload,
      dedupeKey,
      timestamp: Date.now(),
    };
    if (existingIdx >= 0) {
      this.queue[existingIdx] = action;
    } else {
      this.queue.push(action);
    }
    await this.saveQueue();
    this.notify();
    this.sync();
  }

  async sync() {
    if (this.isSyncing || this.queue.length === 0) return;
    this.isSyncing = true;

    const remainingQueue: SyncAction[] = [];
    const seen = new Set<string>();

    for (const action of this.queue) {
      if (seen.has(action.dedupeKey)) continue;
      seen.add(action.dedupeKey);

      try {
        if (action.type === 'CHECK_IN') {
          await placesApi.checkIn(action.payload.placeId || action.payload.spotId);
        } else if (action.type === 'SAVE_PLACE') {
          await placesApi.save(action.payload.placeId || action.payload.spotId);
        } else if (action.type === 'UNSAVE_PLACE') {
          await placesApi.unsave(action.payload.placeId || action.payload.spotId);
        } else if (action.type === 'VERIFY_REDEMPTION') {
          // Legacy offline action — vendor-code redemption is instant; drop queued verify actions.
          continue;
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        const status = err?.status;
        // Permanent client/server rejection (already used, invalid) — drop, do not retry.
        if (status === 400 || status === 404 || status === 409 || status === 422) {
          continue;
        }
        if (msg.includes('Network request failed') || msg.includes('timeout') || status === 0) {
          remainingQueue.push(action);
        }
      }
    }

    this.queue = remainingQueue;
    await this.saveQueue();
    this.isSyncing = false;
    this.notify();
  }

  private async saveQueue() {
    try {
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (err) {
    }
  }
}

export const syncService = new SyncService();
