import type { InAppNotification } from '../../../services/api/notifications';
import { matchesNotificationTab, type NotificationFilterTab } from '../notificationCategories';
import { matchesSearchQuery, notificationDateSection, type DateSection } from '../utils/notificationPresentation';

export type NotificationListRow =
  | { kind: 'header'; id: string; title: DateSection }
  | { kind: 'item'; id: string; notification: InAppNotification };

export function buildNotificationListRows(
  notifications: InAppNotification[],
  tab: NotificationFilterTab,
  search: string,
): NotificationListRow[] {
  const filtered = notifications.filter(
    n => matchesNotificationTab(n, tab) && matchesSearchQuery(n, search),
  );

  const sections: DateSection[] = ['Today', 'Yesterday', 'Earlier'];
  const buckets: Record<DateSection, InAppNotification[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };

  for (const n of filtered) {
    buckets[notificationDateSection(n.createdAt)].push(n);
  }

  const rows: NotificationListRow[] = [];
  for (const section of sections) {
    const items = buckets[section];
    if (!items.length) continue;
    rows.push({ kind: 'header', id: `header-${section}`, title: section });
    for (const notification of items) {
      rows.push({ kind: 'item', id: notification.id, notification });
    }
  }
  return rows;
}
