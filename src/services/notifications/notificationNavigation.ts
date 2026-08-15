import type { RemoteMessage } from '@react-native-firebase/messaging';
import { navigationRef, navigateRoot } from '../../navigation/navigationRef';
import type { RootStackParamList } from '../../navigation/types';
import type { InAppNotification } from '../api/notifications';
import {
  normalizeNotificationData,
  resolveNotificationRoute,
  type NormalizedNotificationPayload,
  type NotificationRouteTarget,
} from './notificationPayload';
import { trackNotificationEvent } from './notificationAnalytics';

let pendingRoute: NotificationRouteTarget | null = null;
let lastNavigationKey = '';
let lastNavigationAt = 0;

const DEDUPE_MS = 2500;

function navigationKey(target: NotificationRouteTarget, source: string): string {
  return `${source}:${String(target.screen)}:${JSON.stringify(target.params ?? {})}`;
}

function shouldSkipDuplicate(key: string): boolean {
  const now = Date.now();
  if (key === lastNavigationKey && now - lastNavigationAt < DEDUPE_MS) {
    return true;
  }
  lastNavigationKey = key;
  lastNavigationAt = now;
  return false;
}

export function setPendingNotificationRoute(target: NotificationRouteTarget): void {
  pendingRoute = target;
}

export function flushPendingNotificationRoute(): boolean {
  if (!pendingRoute) return false;
  if (!navigationRef.isReady()) return false;
  const target = pendingRoute;
  pendingRoute = null;
  return performNavigation(target, 'cold_start');
}

export function performNavigation(
  target: NotificationRouteTarget,
  source: 'push_foreground' | 'push_background' | 'push_quit' | 'in_app' | 'cold_start',
): boolean {
  const key = navigationKey(target, source);
  if (shouldSkipDuplicate(key)) {
    return false;
  }

  if (!navigationRef.isReady()) {
    setPendingNotificationRoute(target);
    return false;
  }

  try {
    navigateRoot(target.screen, target.params as RootStackParamList[typeof target.screen]);
    trackNotificationEvent('opened', { screen: String(target.screen), source });
    trackNotificationEvent('screen_viewed', { screen: String(target.screen), source });
    return true;
  } catch (err) {
    trackNotificationEvent('failure', { source, reason: 'navigation_error' });
    return false;
  }
}

export function navigateFromRemoteMessage(
  remoteMessage: RemoteMessage,
  source: 'push_foreground' | 'push_background' | 'push_quit',
): boolean {
  const payload = normalizeNotificationData(
    remoteMessage.data as Record<string, unknown>,
    remoteMessage.notification,
  );
  return navigateFromPayload(payload, source);
}

export function navigateFromInAppNotification(
  notification: InAppNotification,
  source: 'in_app' = 'in_app',
): boolean {
  const payload = normalizeNotificationData(
    {
      ...(notification.data || {}),
      type: notification.type,
      notificationId: notification.id,
    },
    { title: notification.title, body: notification.body },
  );
  return navigateFromPayload(payload, source);
}

export function navigateFromPayload(
  payload: NormalizedNotificationPayload,
  source: 'push_foreground' | 'push_background' | 'push_quit' | 'in_app' | 'cold_start',
): boolean {
  const target = resolveNotificationRoute(payload);
  if (!target) {
    trackNotificationEvent('failure', { source, reason: 'no_route', type: payload.type });
    return false;
  }
  trackNotificationEvent('delivered', { type: payload.type, screen: String(target.screen), source });
  return performNavigation(target, source === 'in_app' ? 'in_app' : source);
}
