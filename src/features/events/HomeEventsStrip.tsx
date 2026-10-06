/**
 * Home — Community Events strip.
 *
 * Curated ("featured") events from `GET /api/v1/events/featured`, with a clear
 * entry point into the full Events feed. The section owns its own query so a
 * failing or empty feed degrades to a single retryable line instead of taking
 * Home's own loading state down with it.
 */
import React, { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { CommunityEvent } from '../../services/api/events';
import { useFeaturedEvents } from './hooks';
import { EventCard, EVENT_COLORS } from './EventCard';

const STRIP_LIMIT = 6;

type Props = {
  onOpenEvent: (eventIdOrSlug: string) => void;
  onViewAll: () => void;
  /** Home renders this inside its own ScrollView, so no internal scroll. */
  edgePadding?: number;
};

function HomeEventsStripComponent({ onOpenEvent, onViewAll, edgePadding = 20 }: Props) {
  const { events, isLoading, isError, refresh } = useFeaturedEvents(STRIP_LIMIT);

  const openEvent = useCallback(
    (event: CommunityEvent) => onOpenEvent(event.slug || event.id),
    [onOpenEvent],
  );

  const onRetry = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.section}>
      <View style={[styles.header, { paddingHorizontal: edgePadding }]}>
        <View style={styles.titleRow}>
          <Icon name="sparkles-outline" size={17} color={EVENT_COLORS.accent} />
          <Text style={styles.title}>Events near you</Text>
        </View>
        <TouchableOpacity
          onPress={onViewAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="View all events"
        >
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={EVENT_COLORS.accent} />
          <Text style={styles.statusText}>Loading events…</Text>
        </View>
      ) : isError ? (
        <View style={[styles.statusRow, { paddingHorizontal: edgePadding }]}>
          <Text style={styles.statusText}>Could not load events.</Text>
          <TouchableOpacity onPress={onRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={[styles.statusRow, { paddingHorizontal: edgePadding }]}>
          <Text style={styles.statusText}>No upcoming events right now.</Text>
          <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.retryText}>Browse events</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.strip, { paddingHorizontal: edgePadding }]}
        >
          {events.map(event => (
            <EventCard key={event.id} event={event} layout="strip" onPress={openEvent} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 17, fontWeight: '700', color: EVENT_COLORS.text },
  viewAll: { fontSize: 13, fontWeight: '600', color: EVENT_COLORS.accent },
  strip: { gap: 12, paddingRight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  statusText: { fontSize: 13, color: EVENT_COLORS.textSecondary },
  retryText: { fontSize: 13, fontWeight: '700', color: EVENT_COLORS.accent },
});

export const HomeEventsStrip = memo(HomeEventsStripComponent);