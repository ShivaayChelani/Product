import { addMonitoringBreadcrumb } from '../monitoring';

export type NotificationAnalyticsEvent =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'screen_viewed'
  | 'action_completed'
  | 'dismissed'
  | 'failure'
  | 'retry';

export function trackNotificationEvent(
  event: NotificationAnalyticsEvent,
  data?: Record<string, unknown>,
): void {
  addMonitoringBreadcrumb(
    'notification',
    event,
    {
      event,
      ...data,
    },
    event === 'failure' ? 'warning' : 'info',
  );
}
