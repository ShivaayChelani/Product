import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';
import {
  getMessaging,
  getToken,
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp as subscribeNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  hasPermission,
  registerDeviceForRemoteMessages,
  AuthorizationStatus,
  type Messaging,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { APP_BUILD, APP_VERSION } from '../config/monitoringConfig';
import { notificationsApi } from './api';
import { showInAppNotificationBanner } from '../components/notifications/NotificationBannerHost';
import {
  flushPendingNotificationRoute,
  navigateFromRemoteMessage,
} from './notifications/notificationNavigation';
import { trackNotificationEvent } from './notifications/notificationAnalytics';
import {
  clearBadge,
  setUnreadBadgeCount,
} from './notifications/notificationBadgeStore';
import {
  enqueueMarkAllRead,
  enqueueMarkRead,
  flushOfflineQueue,
  startOfflineQueueListener,
} from './notifications/notificationOfflineQueue';
import { normalizeNotificationData } from './notifications/notificationPayload';
import { navigateFromInAppNotification } from './notifications/notificationNavigation';
import { invalidateNotificationFeed } from './notifications/notificationFeedEvents';

let messagingInstance: Messaging | null | undefined;
let lastRegisteredToken: string | null = null;
let refreshUnsubscribe: (() => void) | null = null;
let handlersInitialized = false;
let foregroundUnsub: (() => void) | null = null;
let openedUnsub: (() => void) | null = null;
let offlineUnsub: (() => void) | null = null;

function messagingOrNull(): Messaging | null {
  if (messagingInstance !== undefined) return messagingInstance;
  try {
    if (typeof getMessaging !== 'function') {
      messagingInstance = null;
      return null;
    }
    messagingInstance = getMessaging();
  } catch {
    messagingInstance = null;
  }
  return messagingInstance;
}

async function requestAndroidPostNotifications(): Promise<'granted' | 'denied' | 'blocked'> {
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return 'granted';
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}

async function syncTokenToServer(token: string, retries = 3): Promise<void> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < retries) {
    try {
      await notificationsApi.registerToken({
        token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
        appVersion: APP_VERSION,
        buildNumber: APP_BUILD,
      });
      lastRegisteredToken = token;
      trackNotificationEvent('sent', { kind: 'token_register', platform: Platform.OS });
      return;
    } catch (err) {
      lastError = err;
      attempt += 1;
      trackNotificationEvent('retry', { kind: 'token_register', attempt });
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  trackNotificationEvent('failure', { kind: 'token_register' });
}

function handleForegroundMessage(remoteMessage: RemoteMessage) {
  const payload = normalizeNotificationData(
    remoteMessage.data as Record<string, unknown>,
    remoteMessage.notification,
  );
  const title = String(remoteMessage.notification?.title || payload.title || 'PalSafar');
  const body = String(remoteMessage.notification?.body || payload.body || '');

  showInAppNotificationBanner({
    title,
    body,
    actions: [
      {
        label: 'Open',
        onPress: () => navigateFromRemoteMessage(remoteMessage, 'push_foreground'),
      },
    ],
    onPress: () => navigateFromRemoteMessage(remoteMessage, 'push_foreground'),
  });

  void refreshUnreadBadgeCount();
  invalidateNotificationFeed();
}

function handleNotificationOpen(remoteMessage: RemoteMessage, source: 'push_background' | 'push_quit') {
  navigateFromRemoteMessage(remoteMessage, source);
  void refreshUnreadBadgeCount();
}

export async function refreshUnreadBadgeCount(): Promise<number> {
  try {
    const res = await notificationsApi.list(1, 1);
    const count = res?.unreadCount ?? 0;
    setUnreadBadgeCount(count);
    return count;
  } catch {
    return 0;
  }
}

export const notificationService = {
  async getNotifications(page = 1, limit = 20) {
    try {
      const res = await notificationsApi.list(page, limit);
      const list = res.notifications || (res as any).data?.notifications || [];
      if (typeof res.unreadCount === 'number') {
        setUnreadBadgeCount(res.unreadCount);
      }
      return list;
    } catch (err) {
      return [];
    }
  },

  async markAsRead(notificationId: string): Promise<void> {
    const { getUnreadBadgeCount, setUnreadBadgeCount } = require('./notifications/notificationBadgeStore');
    const current = getUnreadBadgeCount();
    if (current > 0) setUnreadBadgeCount(current - 1);
    
    try {
      await notificationsApi.markRead([notificationId]);
    } catch {
      await enqueueMarkRead([notificationId]);
    } finally {
      void refreshUnreadBadgeCount();
    }
  },

  async markAllAsRead(): Promise<void> {
    const { setUnreadBadgeCount } = require('./notifications/notificationBadgeStore');
    setUnreadBadgeCount(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      await enqueueMarkAllRead();
    } finally {
      void refreshUnreadBadgeCount();
    }
  },

  async requestPermission(offerSettingsOnBlocked = false): Promise<boolean> {
    const messaging = messagingOrNull();
    if (!messaging) return false;

    if (Platform.OS === 'android') {
      const androidStatus = await requestAndroidPostNotifications();
      if (androidStatus === 'blocked') {
        if (offerSettingsOnBlocked) {
          Alert.alert(
            'Notifications blocked',
            'Enable notifications in system settings to receive trip and reward alerts.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
        return false;
      }
      if (androidStatus === 'denied') {
        return false;
      }
    }

    if (typeof requestPermission !== 'function') return false;
    const authStatus = await requestPermission(messaging);
    return (
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL
    );
  },

  async retryPermissionFlow(): Promise<boolean> {
    const granted = await this.isPermissionGranted();
    if (granted) return true;
    return this.requestPermission(true);
  },

  async getFCMToken(): Promise<string | null> {
    const messaging = messagingOrNull();
    if (!messaging) return null;
    try {
      if (typeof registerDeviceForRemoteMessages === 'function') {
        await registerDeviceForRemoteMessages(messaging);
      }
      if (typeof getToken !== 'function') return null;
      const token = await getToken(messaging);
      return token || null;
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/valid API key|api.?key/i.test(msg)) {
        return null;
      }
      return null;
    }
  },

  /**
   * Register / refresh device token — call after login, signup, and session restore.
   * Re-syncs when token, platform, or app version changes.
   */
  async registerDeviceToken(options?: { force?: boolean }): Promise<void> {
    const messaging = messagingOrNull();
    if (!messaging) return;

    const granted = await this.isPermissionGranted();
    if (!granted) {
      const ok = await this.requestPermission();
      if (!ok) return;
    }

    const token = await this.getFCMToken();
    if (!token) return;

    if (!options?.force && token === lastRegisteredToken) {
      // Still ping server so updatedAt / ownership stays fresh after restoreSession.
      await syncTokenToServer(token);
      return;
    }

    await syncTokenToServer(token);

    if (!refreshUnsubscribe && typeof onTokenRefresh === 'function') {
      refreshUnsubscribe = onTokenRefresh(messaging, async (newToken) => {
        if (!newToken || newToken === lastRegisteredToken) return;
        await syncTokenToServer(newToken);
      });
    }
  },

  /** Alias for cold-start session restore path. */
  async syncDeviceAfterSessionRestore(): Promise<void> {
    await this.registerDeviceToken({ force: true });
    await refreshUnreadBadgeCount();
    void flushOfflineQueue();
  },

  async unregisterDeviceToken(): Promise<void> {
    const token = lastRegisteredToken || (await this.getFCMToken());
    if (!token) return;
    try {
      await notificationsApi.unregisterToken(token);
    } catch (err) {
    } finally {
      lastRegisteredToken = null;
      clearBadge();
      if (refreshUnsubscribe) {
        refreshUnsubscribe();
        refreshUnsubscribe = null;
      }
    }
  },

  async isPermissionGranted(): Promise<boolean> {
    const messaging = messagingOrNull();
    if (!messaging) return false;

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const has = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (!has) return false;
    }

    if (typeof hasPermission !== 'function') return false;
    const status = await hasPermission(messaging);
    return (
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL
    );
  },

  async openSystemSettings(): Promise<void> {
    await Linking.openSettings();
  },

  /** Single bootstrap — call once from AppInitializer. */
  async initHandlers(): Promise<() => void> {
    if (handlersInitialized) {
      return () => {};
    }
    handlersInitialized = true;

    offlineUnsub = startOfflineQueueListener();
    void flushOfflineQueue();

    const messaging = messagingOrNull();
    if (!messaging) {
      return () => {
        offlineUnsub?.();
        offlineUnsub = null;
        handlersInitialized = false;
      };
    }

    if (typeof onMessage === 'function') {
      foregroundUnsub = onMessage(messaging, handleForegroundMessage);
    }

    if (typeof subscribeNotificationOpenedApp === 'function') {
      openedUnsub = subscribeNotificationOpenedApp(messaging, (msg) =>
        handleNotificationOpen(msg, 'push_background'),
      );
    }

    try {
      const initial = await getInitialNotification(messaging);
      if (initial) {
        handleNotificationOpen(initial, 'push_quit');
      }
    } catch {
      /* no initial notification */
    }

    flushPendingNotificationRoute();

    return () => {
      foregroundUnsub?.();
      openedUnsub?.();
      offlineUnsub?.();
      foregroundUnsub = null;
      openedUnsub = null;
      offlineUnsub = null;
      handlersInitialized = false;
    };
  },

  navigateFromInAppNotification,

  refreshUnreadBadgeCount,

  /** Dev QA — simulate foreground banner without Firebase Console. */
  showLocalTestBanner(title: string, body: string, data?: Record<string, string>) {
    const fakeMessage = {
      data: data || { type: 'system', screen: 'Notifications' },
      notification: { title, body },
    } as RemoteMessage;
    showInAppNotificationBanner({
      title,
      body,
      actions: [
        {
          label: 'Open',
          onPress: () => navigateFromRemoteMessage(fakeMessage, 'push_foreground'),
        },
      ],
      onPress: () => navigateFromRemoteMessage(fakeMessage, 'push_foreground'),
    });
  },
};
