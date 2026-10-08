/** Community Event card shared by the Events feed and Home's event strip. */
import React, { memo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { CommunityEvent } from '../../services/api/events';
import {
  eventImage,
  eventLifecycle,
  eventTypeIcon,
  eventTypeLabel,
  formatEventDateRange,
  formatEventLocation,
  formatEventTimeRange,
} from './eventFormat';
import { palette } from '../../config/theme';

export const EVENT_COLORS = {
  accent: palette.primary,
  accentSoft: '#F0EFEB',
  accentBorder: palette.border,
  live: '#111111',
  liveSoft: '#111111',
  soon: '#6B6B6B',
  soonSoft: '#F0EFEB',
  text: palette.text,
  textSecondary: palette.textSecondary,
  textBody: palette.text,
  border: palette.border,
  card: palette.surface,
} as const;

export type EventCardLayout = 'feed' | 'strip';

type Props = {
  event: CommunityEvent;
  onPress: (event: CommunityEvent) => void;
  layout?: EventCardLayout;
  /** Only for the Home strip: shows the event's position in the list. */
  style?: StyleProp<ViewStyle>;
};

function EventCardComponent({ event, onPress, layout = 'feed', style }: Props) {
  const image = eventImage(event);
  const when = formatEventDateRange(event.startDate, event.endDate);
  const timeRange = formatEventTimeRange(event.startTime, event.endTime);
  const location = formatEventLocation(event) || 'Location to be announced';
  const lifecycle = eventLifecycle(event);
  const isStrip = layout === 'strip';

  return (
    <TouchableOpacity
      style={[isStrip ? styles.strip : styles.card, style]}
      onPress={() => onPress(event)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${when}`}
    >
      {isStrip ? (
        <>
          <View style={styles.stripMedia}>
            {image ? (
              <Image source={{ uri: image }} style={styles.stripImage} resizeMode="cover" />
            ) : (
              <View style={styles.stripImagePlaceholder}>
                <Icon name={eventTypeIcon(event.eventType)} size={22} color={EVENT_COLORS.accent} />
              </View>
            )}
            <EventBadges lifecycle={lifecycle} isFeatured={event.isFeatured} compact />
          </View>
          <Text style={styles.stripTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.stripMeta} numberOfLines={1}>
            {when}
          </Text>
          <Text style={styles.stripLocation} numberOfLines={1}>
            {location}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.media}>
            {image ? (
              <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon name={eventTypeIcon(event.eventType)} size={26} color={EVENT_COLORS.accent} />
              </View>
            )}
            <EventBadges lifecycle={lifecycle} isFeatured={event.isFeatured} />
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {event.title}
            </Text>

            <View style={styles.metaRow}>
              <Icon name="calendar-outline" size={13} color={EVENT_COLORS.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {timeRange ? `${when} · ${timeRange}` : when}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Icon name="location-outline" size={13} color={EVENT_COLORS.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {location}
              </Text>
            </View>

            <View style={styles.footer}>
              <View style={styles.typeChip}>
                <Icon name={eventTypeIcon(event.eventType)} size={12} color={EVENT_COLORS.accent} />
                <Text style={styles.typeChipText}>{eventTypeLabel(event.eventType)}</Text>
              </View>
              <Text style={styles.cityText} numberOfLines={1}>
                {event.city || event.state || 'India'}
              </Text>
            </View>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

function EventBadges({
  lifecycle,
  isFeatured,
  compact,
}: {
  lifecycle: 'LIVE' | 'UPCOMING' | 'ENDED';
  isFeatured: boolean;
  compact?: boolean;
}) {
  if (lifecycle === 'ENDED' && !isFeatured) return null;
  return (
    <View style={styles.badgeStack}>
      {lifecycle === 'LIVE' ? (
        <View style={[styles.badge, styles.badgeLive]}>
          <Text style={[styles.badgeText, styles.badgeTextLive]}>LIVE</Text>
        </View>
      ) : null}
      {isFeatured ? (
        <View style={[styles.badge, styles.badgeFeatured]}>
          <Icon name="star" size={compact ? 9 : 11} color={EVENT_COLORS.soon} />
          <Text style={[styles.badgeText, { color: EVENT_COLORS.soon }]}>Featured</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: EVENT_COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  media: { width: '100%', height: 168, backgroundColor: EVENT_COLORS.accentSoft },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeStack: { position: 'absolute', top: 10, left: 10, gap: 6, alignItems: 'flex-start' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: EVENT_COLORS.accentBorder,
  },
  badgeLive: { backgroundColor: '#111111', borderColor: '#111111' },
  badgeFeatured: { backgroundColor: '#F0EFEB', borderColor: EVENT_COLORS.border },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: EVENT_COLORS.accent, letterSpacing: 0.2 },
  badgeTextLive: { color: '#FFFFFF' },
  body: { padding: 14, gap: 6 },
  title: { fontSize: 16, fontWeight: '700', color: EVENT_COLORS.text, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12.5, color: EVENT_COLORS.textSecondary, flexShrink: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: EVENT_COLORS.accentSoft,
  },
  typeChipText: { fontSize: 11, fontWeight: '700', color: EVENT_COLORS.accent },
  cityText: { fontSize: 11.5, color: EVENT_COLORS.textSecondary, flexShrink: 1 },

  strip: { width: 168 },
  stripMedia: {
    width: '100%',
    height: 108,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: EVENT_COLORS.accentSoft,
  },
  stripImage: { width: '100%', height: '100%' },
  stripImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: EVENT_COLORS.text,
    marginTop: 8,
    lineHeight: 18,
  },
  stripMeta: { fontSize: 11.5, color: EVENT_COLORS.accent, fontWeight: '600', marginTop: 3 },
  stripLocation: { fontSize: 11, color: EVENT_COLORS.textSecondary, marginTop: 1 },
});

export const EventCard = memo(EventCardComponent);