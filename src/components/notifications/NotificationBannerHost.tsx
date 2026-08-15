import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import InAppNotificationBanner, {
  type InAppBannerPayload,
} from './InAppNotificationBanner';
import { trackNotificationEvent } from '../../services/notifications/notificationAnalytics';

type QueueItem = InAppBannerPayload & { durationMs?: number };

let enqueueExternal: ((item: QueueItem) => void) | null = null;

/** Imperative API for notificationService foreground display. */
export function showInAppNotificationBanner(item: Omit<QueueItem, 'id'> & { id?: string }): void {
  const payload: QueueItem = {
    id: item.id || `banner-${Date.now()}`,
    title: item.title,
    body: item.body,
    actions: item.actions,
    onPress: item.onPress,
    onDismiss: item.onDismiss,
    durationMs: item.durationMs ?? 5000,
  };
  if (enqueueExternal) {
    enqueueExternal(payload);
  }
}

export default function NotificationBannerHost({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dequeue = useCallback(() => {
    setCurrent(null);
    setQueue((prev) => prev.slice(1));
  }, []);

  const dismissCurrent = useCallback(() => {
    if (current) {
      trackNotificationEvent('dismissed', { id: current.id });
      current.onDismiss?.();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    dequeue();
  }, [current, dequeue]);

  const enqueue = useCallback((item: QueueItem) => {
    trackNotificationEvent('delivered', { channel: 'in_app_banner', id: item.id });
    setQueue((prev) => [...prev, item]);
  }, []);

  useEffect(() => {
    enqueueExternal = enqueue;
    return () => {
      enqueueExternal = null;
    };
  }, [enqueue]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setCurrent(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismissCurrent();
    }, next.durationMs ?? 5000);
  }, [queue, current, dismissCurrent]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {current ? (
        <InAppNotificationBanner
          visible
          id={current.id}
          title={current.title}
          body={current.body}
          actions={current.actions}
          onPress={() => {
            current.onPress?.();
            trackNotificationEvent('action_completed', { id: current.id });
            dismissCurrent();
          }}
          onDismiss={dismissCurrent}
        />
      ) : null}
    </View>
  );
}
