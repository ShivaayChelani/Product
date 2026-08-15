import { Platform } from 'react-native';

type Listener = (count: number) => void;

let unreadCount = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l(unreadCount));
  applyNativeBadge(unreadCount);
}

/** Best-effort OS app-icon badge (iOS reads APNs badge; Android varies by launcher). */
function applyNativeBadge(count: number) {
  if (Platform.OS !== 'ios') return;
  try {
    // PushNotificationIOS is optional; fail silently if unavailable.
    const PushNotificationIOS = require('@react-native-community/push-notification-ios')?.default;
    if (PushNotificationIOS?.setApplicationIconBadgeNumber) {
      PushNotificationIOS.setApplicationIconBadgeNumber(count);
    }
  } catch {
    /* optional native module */
  }
}

export function getUnreadBadgeCount(): number {
  return unreadCount;
}

export function setUnreadBadgeCount(count: number): void {
  const next = Math.max(0, Math.floor(count));
  if (next === unreadCount) return;
  unreadCount = next;
  notify();
}

export function subscribeUnreadBadge(listener: Listener): () => void {
  listeners.add(listener);
  listener(unreadCount);
  return () => listeners.delete(listener);
}

export function clearBadge(): void {
  setUnreadBadgeCount(0);
}
