import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { notificationsApi } from '../../../services/api/notifications';
import type { InAppNotification } from '../../../services/api/notifications';
import { setUnreadBadgeCount } from '../../../services/notifications/notificationBadgeStore';
import { notificationKeys } from '../queryKeys';
import type { NotificationFilterTab } from '../notificationCategories';
import { buildServerCategoryParam } from '../notificationCategories';
import {
  readNotificationListCache,
  writeNotificationListCache,
  removeNotificationsFromCache,
  patchNotificationInCache,
} from '../services/notificationListCache';
import { DEV_FLAGS } from '../../../config/devFlags';

const PAGE_SIZE = 25;

function listParamsForTab(tab: NotificationFilterTab, search: string) {
  if (tab === 'Unread') {
    return { unread: true, q: search || undefined };
  }
  const category = buildServerCategoryParam(tab);
  return { category, q: search || undefined };
}

export function useNotificationsFeed(tab: NotificationFilterTab, search: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = notificationKeys.feed(tab, search);

  const query = useInfiniteQuery({
    queryKey,
    enabled: enabled && DEV_FLAGS.USE_SERVER_API,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await notificationsApi.list(pageParam, PAGE_SIZE, listParamsForTab(tab, search));
      if (typeof res.unreadCount === 'number') {
        setUnreadBadgeCount(res.unreadCount);
      }
      if (pageParam === 1) {
        await writeNotificationListCache({
          savedAt: Date.now(),
          notifications: res.notifications,
          unreadCount: res.unreadCount,
        });
      }
      return res;
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      if (lastPage.pagination?.hasNext) return lastPageParam + 1;
      const count = lastPage.notifications?.length ?? 0;
      return count >= PAGE_SIZE ? lastPageParam + 1 : undefined;
    },
    staleTime: 10_000,
  });

  const notifications = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const map = new Map<string, InAppNotification>();
    for (const page of pages) {
      for (const n of page.notifications || []) {
        map.set(n.id, n);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [query.data?.pages]);

  const hydrateFromCache = useCallback(async () => {
    const cache = await readNotificationListCache();
    if (!cache?.notifications?.length) return;
    queryClient.setQueryData(queryKey, {
      pages: [{ notifications: cache.notifications, unreadCount: cache.unreadCount }],
      pageParams: [1],
    });
    setUnreadBadgeCount(cache.unreadCount);
  }, [queryClient, queryKey]);

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onSuccess: async (_data, ids) => {
      for (const id of ids) {
        await patchNotificationInCache(id, { read: true });
      }
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            notifications: (p.notifications || []).map((n: InAppNotification) =>
              ids.includes(n.id) ? { ...n, read: true } : n,
            ),
            unreadCount: Math.max(0, (p.unreadCount ?? 0) - ids.filter(id => {
              const row = (p.notifications || []).find((n: InAppNotification) => n.id === id);
              return row && !row.read;
            }).length),
          })),
        };
      });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: async () => {
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            notifications: (p.notifications || []).map((n: InAppNotification) => ({ ...n, read: true })),
            unreadCount: 0,
          })),
        };
      });
      setUnreadBadgeCount(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 1) {
        await notificationsApi.deleteNotification(ids[0]!);
        return ids;
      }
      await notificationsApi.deleteNotifications(ids);
      return ids;
    },
    onSuccess: async ids => {
      await removeNotificationsFromCache(ids);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.pages) return old;
        const set = new Set(ids);
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            notifications: (p.notifications || []).filter((n: InAppNotification) => !set.has(n.id)),
          })),
        };
      });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    query,
    notifications,
    hydrateFromCache,
    markRead: markReadMutation,
    markAllRead: markAllReadMutation,
    deleteNotifications: deleteMutation,
  };
}
