/**
 * Home — Live Events hero card.
 *
 * Uses the same real event data layer as the rest of the events experience and
 * keeps the entry point focused on the existing Events and Map routes.
 */
import React, { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { CommunityEvent } from '../../services/api/events';
import { useFeaturedEvents } from './hooks';
import { eventImage, eventLifecycle, eventTypeIcon, eventTypeLabel, formatEventDateRange, formatEventLocation, formatEventTimeRange } from './eventFormat';
import { EVENT_COLORS } from './EventCard';

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
  onViewMap,
  edgePadding = 20,
  latitude,
  longitude,
}: Props) {
  const { events, isLoading, isError, refresh } = useFeaturedEvents(STRIP_LIMIT, {
    latitude,
    longitude,
  });

  const primaryEvent = events[0];

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

  if (!primaryEvent) {
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

  const image = eventImage(primaryEvent);
  const when = formatEventDateRange(primaryEvent.startDate, primaryEvent.endDate);
  const timeRange = formatEventTimeRange(primaryEvent.startTime, primaryEvent.endTime);
  const location = formatEventLocation(primaryEvent) || 'Location to be announced';
  const lifecycle = eventLifecycle(primaryEvent);

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
          accessibilityLabel="Explore live events"
        >
          <Text style={styles.viewAll}>Explore Events</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.featuredCard}
        onPress={() => openEvent(primaryEvent)}
        activeOpacity={0.95}
        accessibilityRole="button"
        accessibilityLabel={`Explore live event ${primaryEvent.title}`}
      >
        <Image
          source={{
            uri: image || 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80',
          }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
        <View style={styles.cardContent}>
          <View style={styles.cardMetaRow}>
            {lifecycle === 'LIVE' ? <View style={styles.livePill}><Text style={styles.livePillText}>LIVE</Text></View> : null}
            <View style={styles.typePill}>
              <Icon name={eventTypeIcon(primaryEvent.eventType)} size={11} color="#FFFFFF" />
              <Text style={styles.typePillText}>{eventTypeLabel(primaryEvent.eventType)}</Text>
            </View>
          </View>
          <Text style={styles.eventTitle} numberOfLines={2}>{primaryEvent.title}</Text>
          <Text style={styles.eventMeta}>{when}{timeRange ? ` • ${timeRange}` : ''}</Text>
          <Text style={styles.eventMeta}>{location}</Text>
          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={() => openEvent(primaryEvent)}
              activeOpacity={0.9}
              style={styles.primaryAction}
              accessibilityRole="button"
              accessibilityLabel="Explore live events"
            >
              <Text style={styles.primaryActionText}>Explore Events</Text>
              <Icon name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onViewMap}
              activeOpacity={0.85}
              style={styles.secondaryAction}
              accessibilityRole="button"
              accessibilityLabel="View events on map"
            >
              <Text style={styles.secondaryActionText}>View on Map</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 24 },
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
  featuredCard: {
    position: 'relative',
    height: 290,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#E2E0DB',
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 7,
  },
  image: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.42)',
  },
  cardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  livePill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  livePillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typePillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  eventTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', lineHeight: 30, marginBottom: 6 },
  eventMeta: { color: '#F2F1ED', fontSize: 13, marginBottom: 3 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111111',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  primaryActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  secondaryAction: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  secondaryActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
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