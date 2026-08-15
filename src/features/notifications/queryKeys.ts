import type { NotificationFilterTab } from './notificationCategories';

export const notificationKeys = {
  all: ['notifications'] as const,
  feed: (tab: NotificationFilterTab, search: string) =>
    [...notificationKeys.all, 'feed', tab, search.trim().toLowerCase()] as const,
};
