/**
 * Home — compact live events strip.
 *
 * The first card is intentionally not a tall hero feature; Home keeps a dense
 * horizontal carousel that matches the nearby places pattern and leaves room for
 * the surrounding content.
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
import type { CommunityEvent } from '../../services/api/events';
import { useFeaturedEvents } from './hooks';
import { EventCard, EVENT_COLORS, EVENT_STRIP_CARD_GAP, EVENT_STRIP_CARD_WIDTH } from './EventCard';

const STRIP_LIMIT = 6;

type Props = {
  onOpenEvent: (eventIdOrSlug: string) => void;
  onViewAll: () => void;
  onViewMap?: () => void;
  edgePadding?: number;
  /** Current GPS fix; lets the strip fall back to radius search when there is
   *  no curated event so "Events Near You" stays true to its name. */
  latitude?: number | null;
  longitude?: number | null;
};

function HomeEventsStripComponent({
  onOpenEvent,
  onViewAll,
  onViewMap: _onViewMap,
  edgePadding = 20,
  latitude,
  longitude,
}: Props) {
  const { events, isLoading, isError, refresh } = useFeaturedEvents(STRIP_LIMIT, {
    latitude,
    longitude,
  });

  const openEvent = useCallback(
    (event: CommunityEvent) => onOpenEvent(event.slug || event.id),
    [onOpenEvent],
  );
  const onRetry = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (isLoading) {
    return (
      <View style={[styles.section, { paddingHorizontal: edgePadding }]}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={EVENT_COLORS.accent} />
          <Text style={styles.statusText}>Loading live events…</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.section, { paddingHorizontal: edgePadding }]}>
        <View style={styles.emptyNotification}>
          <Text style={styles.statusText}>Could not load live events.</Text>
          <TouchableOpacity onPress={onRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!events.length) {
    return (
      <View style={[styles.section, { paddingHorizontal: edgePadding }]}>
        <View style={styles.emptyNotification}>
          <Text style={styles.emptyTitle}>No upcoming events near you</Text>
          <TouchableOpacity onPress={onViewAll} style={styles.emptyButton} accessibilityRole="button" accessibilityLabel="Browse events">
            <Text style={styles.emptyButtonText}>Browse Events</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.section, { paddingHorizontal: edgePadding }]}>
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
          <Text style={styles.title}>Events Near You</Text>
        </View>
        <TouchableOpacity
          onPress={onViewAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Explore events"
        >
          <Text style={styles.viewAll}>Explore Events</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={EVENT_STRIP_CARD_WIDTH + EVENT_STRIP_CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.stripScrollContent}
        accessibilityLabel="Events near you"
      >
        {events.map((event) => (
          <EventCard
            key={event.id || event.slug}
            event={event}
            onPress={openEvent}
            layout="strip"
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 24 },
  stripScrollContent: { gap: EVENT_STRIP_CARD_GAP, paddingBottom: 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#111111',
  },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 17, fontWeight: '700', color: EVENT_COLORS.text },
  viewAll: { fontSize: 13, fontWeight: '700', color: EVENT_COLORS.accent },
  loadingState: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  statusText: { color: EVENT_COLORS.textSecondary, fontSize: 13 },
  retryText: { color: EVENT_COLORS.accent, fontSize: 13, fontWeight: '700' },
  emptyNotification: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E0DB',
    padding: 18,
    alignItems: 'flex-start',
    gap: 12,
  },
  emptyTitle: { color: EVENT_COLORS.text, fontSize: 18, fontWeight: '700' },
  emptyButton: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyButtonText: { color: '#FFFFFF', fontWeight: '700' },
});

export const HomeEventsStrip = memo(HomeEventsStripComponent);