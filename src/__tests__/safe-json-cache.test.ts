import { parseJsonArray, parseJsonObject, parseJsonSafe, parseJsonStringArray } from '../utils/safeJson';
import { readNotificationListCache, writeNotificationListCache } from '../features/notifications/services/notificationListCache';
import { loadSavedOfferIds } from '../utils/savedOffers';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
    },
  };
});

describe('safe JSON cache parsing', () => {
  it('returns fallback for malformed JSON and wrong shapes', () => {
    expect(parseJsonSafe('{', { ok: true })).toEqual({ ok: true });
    expect(parseJsonObject('[]')).toBeNull();
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonArray('{"a":1}')).toBeNull();
    expect(parseJsonStringArray('["a",1,"b"]')).toEqual(['a', 'b']);
    expect(parseJsonStringArray('{not-json')).toEqual([]);
  });

  it('ignores a notification cache with a missing notifications array', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(
      'ps_notifications_feed_cache_v1',
      JSON.stringify({ savedAt: Date.now(), unreadCount: 3 }),
    );
    await expect(readNotificationListCache()).resolves.toBeNull();
  });

  it('ignores malformed saved-offer cache instead of crashing', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('PALSAFAR_SAVED_OFFERS', '{not-json');
    await expect(loadSavedOfferIds()).resolves.toEqual([]);
  });

  it('keeps a valid notification cache', async () => {
    await writeNotificationListCache({
      savedAt: Date.now(),
      unreadCount: 1,
      notifications: [{ id: 'n1', read: false } as any],
    });
    const cached = await readNotificationListCache();
    expect(cached?.unreadCount).toBe(1);
    expect(cached?.notifications).toHaveLength(1);
  });
});
