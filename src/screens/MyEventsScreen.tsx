/**
 * My events — the submitter's own Community Event submissions.
 *
 * Reads `GET /events?mine=true`, which the server scopes to the caller and
 * augments with moderation fields (`rejectionReason`, `approvedAt`) that a
 * public list row never carries. Rejection reasons are shown only here, never
 * on the public feed.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { eventsApi, type OwnedCommunityEvent } from '../services/api/events';
import { eventKeys } from '../features/events/queryKeys';
import { EVENT_COLORS } from '../features/events/EventCard';
import {
  eventImage,
  eventTypeIcon,
  eventTypeLabel,
  formatEventDateRange,
  formatEventLocation,
} from '../features/events/eventFormat';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type StatusVisual = { label: string; color: string; soft: string };

const STATUS_VISUAL: Record<string, StatusVisual> = {
  PENDING: { label: 'PENDING REVIEW', color: EVENT_COLORS.soon, soft: EVENT_COLORS.soonSoft },
  APPROVED: { label: 'LIVE', color: EVENT_COLORS.live, soft: EVENT_COLORS.liveSoft },
  REJECTED: { label: 'REJECTED', color: '#C94A4A', soft: '#FBEAEA' },
  CANCELLED: { label: 'CANCELLED', color: EVENT_COLORS.textSecondary, soft: '#F7F6F1' },
  EXPIRED: { label: 'EXPIRED', color: EVENT_COLORS.textSecondary, soft: '#F7F6F1' },
};

function statusVisual(status?: string): StatusVisual {
  return STATUS_VISUAL[status || ''] || STATUS_VISUAL.PENDING;
}

export default function MyEventsScreen() {
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: async () => {
      const res = await eventsApi.listMine();
      return res.data ?? [];
    },
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const events = query.data ?? [];

  const openEvent = useCallback(
    (event: OwnedCommunityEvent) => {
      navigation.navigate('EventDetail', { eventIdOrSlug: event.slug || event.id });
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (query.isLoading) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator color={EVENT_COLORS.accent} />
        </View>
      );
    }
    if (query.isError) {
      return (
        <View style={styles.stateBox}>
          <Icon name="cloud-offline-outline" size={32} color={EVENT_COLORS.textSecondary} />
          <Text style={styles.stateTitle}>Could not load your events</Text>
          <Pressable style={styles.retryBtn} onPress={() => void query.refetch()} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.stateBox}>
        <Icon name="calendar-outline" size={32} color={EVENT_COLORS.textSecondary} />
        <Text style={styles.stateTitle}>No events yet</Text>
        <Text style={styles.stateBody}>
          Submit a festival, fair or gathering and it will appear here while it waits for review.
        </Text>
        <Pressable
          style={styles.retryBtn}
          onPress={() => navigation.navigate('AddEvent')}
          accessibilityRole="button"
          testID="my-events-create"
        >
          <Text style={styles.retryText}>Add an event</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="my-events-back"
        >
          <Icon name="chevron-back" size={20} color="#1D2420" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            My events
          </Text>
          <Text style={styles.headerSubtitle}>Your submissions and their status</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('AddEvent')}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel="Add an event"
          testID="my-events-add"
        >
          <Icon name="add" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={EVENT_COLORS.accent}
            colors={[EVENT_COLORS.accent]}
          />
        }
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => {
          const visual = statusVisual(item.status);
          const image = eventImage(item);
          const when = formatEventDateRange(item.startDate, item.endDate);
          const where = formatEventLocation(item);
          return (
            <Pressable
              style={styles.card}
              onPress={() => openEvent(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${visual.label}`}
              testID={`my-event-${item.status?.toLowerCase()}`}
            >
              <View style={styles.cardMedia}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
                ) : (
                  <View style={styles.cardImagePlaceholder}>
                    <Icon name={eventTypeIcon(item.eventType)} size={22} color={EVENT_COLORS.accent} />
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: visual.soft }]}>
                    <Text style={[styles.statusText, { color: visual.color }]}>{visual.label}</Text>
                  </View>
                  <Text style={styles.typeText}>{eventTypeLabel(item.eventType)}</Text>
                </View>

                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                <View style={styles.metaRow}>
                  <Icon name="calendar-outline" size={13} color={EVENT_COLORS.textSecondary} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {when}
                  </Text>
                </View>
                {where ? (
                  <View style={styles.metaRow}>
                    <Icon name="location-outline" size={13} color={EVENT_COLORS.textSecondary} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {where}
                    </Text>
                  </View>
                ) : null}

                {item.status === 'REJECTED' && item.rejectionReason ? (
                  <View style={styles.reasonBox}>
                    <Icon name="information-circle-outline" size={14} color="#C94A4A" />
                    <Text style={styles.reasonText}>{item.rejectionReason}</Text>
                  </View>
                ) : null}

                {item.status === 'PENDING' ? (
                  <Text style={styles.pendingText}>
                    An admin is reviewing this event. It stays hidden until approved.
                  </Text>
                ) : null}
              </View>

              <Icon name="chevron-forward" size={17} color={EVENT_COLORS.textSecondary} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F6F1' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: EVENT_COLORS.border,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: EVENT_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: EVENT_COLORS.text },
  headerSubtitle: { fontSize: 12, color: EVENT_COLORS.textSecondary, marginTop: 1 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: EVENT_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 18, gap: 12, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: EVENT_COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    padding: 12,
  },
  cardMedia: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EVENT_COLORS.accentSoft,
  },
  cardBody: { flex: 1, gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  typeText: { fontSize: 11.5, color: EVENT_COLORS.textSecondary, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: EVENT_COLORS.text, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, color: EVENT_COLORS.textSecondary, flex: 1 },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FBEAEA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 8,
    marginTop: 4,
  },
  reasonText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 17 },
  pendingText: { fontSize: 12, color: EVENT_COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 56, gap: 8 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: EVENT_COLORS.text, marginTop: 6 },
  stateBody: { fontSize: 13, color: EVENT_COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: EVENT_COLORS.accent,
  },
  retryText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
});
