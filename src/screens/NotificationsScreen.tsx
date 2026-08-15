import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useBottomSafePadding } from '../design/responsive';
import { NotificationTheme as T, SERIF, SANS_SEMI } from '../features/notifications/theme';
import { NotificationsHeader } from '../features/notifications/components/NotificationsHeader';
import { NotificationFilterTabs } from '../features/notifications/components/NotificationFilterTabs';
import { NotificationSearchBar } from '../features/notifications/components/NotificationSearchBar';
import { NotificationCard } from '../features/notifications/components/NotificationCard';
import { NotificationEmptyState } from '../features/notifications/components/NotificationEmptyState';
import { NotificationListSkeleton } from '../features/notifications/components/NotificationListSkeleton';
import type { NotificationFilterTab } from '../features/notifications/notificationCategories';
import { useNotificationsFeed } from '../features/notifications/hooks/useNotificationsFeed';
import { buildNotificationListRows, type NotificationListRow } from '../features/notifications/utils/buildNotificationListRows';
import { navigateFromInAppNotification } from '../services/notifications/notificationNavigation';
import type { InAppNotification } from '../services/api/notifications';
import { subscribeNotificationFeedInvalidation } from '../services/notifications/notificationFeedEvents';
import { useNotificationSelectionStore } from '../features/notifications/store/notificationSelectionStore';
import { useUserContext } from '../context/UserContext';
import { enqueueMarkAllRead } from '../services/notifications/notificationOfflineQueue';

export default function NotificationsScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const bottomPad = useBottomSafePadding(24);
  const { isAuthenticated } = useUserContext();
  const [tab, setTab] = useState<NotificationFilterTab>('All');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);

  const {
    query,
    notifications,
    hydrateFromCache,
    markRead,
    markAllRead,
    deleteNotifications,
  } = useNotificationsFeed(tab, debouncedSearch, isAuthenticated);

  const selectionMode = useNotificationSelectionStore(s => s.enabled);
  const selectedIds = useNotificationSelectionStore(s => s.selectedIds);
  const toggleSelectionMode = useNotificationSelectionStore(s => s.toggleSelectionMode);
  const toggleId = useNotificationSelectionStore(s => s.toggleId);
  const clearSelection = useNotificationSelectionStore(s => s.clear);

  useEffect(() => {
    void hydrateFromCache();
  }, [hydrateFromCache]);

  useEffect(() => {
    const unsub = subscribeNotificationFeedInvalidation(() => {
      void query.refetch();
    });
    return unsub;
  }, [query]);

  const rows = useMemo(
    () => buildNotificationListRows(notifications, tab, debouncedSearch),
    [notifications, tab, debouncedSearch],
  );

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate(undefined, {
      onError: () => {
        void enqueueMarkAllRead();
      },
    });
  }, [markAllRead]);

  const openNotification = useCallback(
    async (n: InAppNotification) => {
      if (selectionMode) {
        toggleId(n.id);
        return;
      }
      if (!n.read) {
        markRead.mutate([n.id]);
      }
      navigateFromInAppNotification(n);
    },
    [markRead, selectionMode, toggleId],
  );

  const handleMarkRead = useCallback(
    (id: string) => {
      markRead.mutate([id]);
    },
    [markRead],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteNotifications.mutate([id]);
    },
    [deleteNotifications],
  );

  const handleExplore = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Map' });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item, index }: { item: NotificationListRow; index: number }) => {
      if (item.kind === 'header') {
        return (
          <Text style={styles.sectionTitle}>{item.title}</Text>
        );
      }
      const n = item.notification;
      return (
        <NotificationCard
          notification={n}
          index={index}
          selected={selectedIds.has(n.id)}
          selectionMode={selectionMode}
          onPress={() => void openNotification(n)}
          onLongPress={() => {
            if (!selectionMode) toggleSelectionMode(true);
            toggleId(n.id);
          }}
          onMarkRead={() => handleMarkRead(n.id)}
          onDelete={() => handleDelete(n.id)}
        />
      );
    },
    [
      handleDelete,
      handleMarkRead,
      openNotification,
      selectedIds,
      selectionMode,
      toggleId,
      toggleSelectionMode,
    ],
  );

  const loading = query.isLoading && !query.data;
  const error = query.isError && !notifications.length;
  const empty = !loading && !error && rows.length === 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={T.bg} />
      <NotificationsHeader
        onBack={onBack}
        topInset={insets.top}
        onMarkAllRead={handleMarkAllRead}
        markingAll={markAllRead.isPending}
      />
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedIds.size} selected</Text>
          <TouchableOpacity
            onPress={() => {
              const ids = Array.from(selectedIds);
              if (ids.length) markRead.mutate(ids);
              clearSelection();
            }}
          >
            <Text style={styles.selectionAction}>Mark read</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const ids = Array.from(selectedIds);
              if (ids.length) deleteNotifications.mutate(ids);
              clearSelection();
            }}
          >
            <Text style={[styles.selectionAction, styles.selectionDanger]}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearSelection}>
            <Text style={styles.selectionAction}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <NotificationFilterTabs active={tab} onChange={setTab} />

      {loading ? (
        <NotificationListSkeleton />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Could not load notifications.</Text>
          <TouchableOpacity onPress={() => query.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : empty ? (
        <NotificationEmptyState onExplore={handleExplore} />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          estimatedItemSize={88}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={T.primary}
            />
          }
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={T.primary} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FCF9F4',
  },
  list: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: 'serif',
    fontWeight: '700',
    fontSize: 16,
    color: '#202020',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  errorWrap: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontFamily: SANS_SEMI,
    color: T.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: T.primary,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    color: '#FFF',
    fontFamily: SANS_SEMI,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  selectionText: {
    flex: 1,
    fontFamily: SANS_SEMI,
    color: T.primary,
  },
  selectionAction: {
    fontFamily: SANS_SEMI,
    fontSize: 13,
    color: T.secondary,
  },
  selectionDanger: {
    color: '#DC4C4C',
  },
});
