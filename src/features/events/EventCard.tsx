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
  formatEventAddress,
  formatEventDateRange,
  formatEventFullSchedule,
  formatEventLocation,
  formatEventTimeRange,
} from './eventFormat';
import { palette } from '../../config/theme';
import { sizedImageSource } from '../../utils/imageUrl';

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

/** Home strip card width; keep in sync with HomeEventsStrip snap interval. */
export const EVENT_STRIP_CARD_WIDTH = 272;
export const EVENT_STRIP_CARD_GAP = 12;

type Props = {
  event: CommunityEvent;
  onPress: (event: CommunityEvent) => void;
  layout?: EventCardLayout;
  style?: StyleProp<ViewStyle>;
};

function EventCardComponent({ event, onPress, layout = 'feed', style }: Props) {
  const image = eventImage(event);
  const imageUri = image || undefined;
  const [imageFailed, setImageFailed] = React.useState(false);
  const when = formatEventDateRange(event.startDate, event.endDate);
  const timeRange = formatEventTimeRange(event.startTime, event.endTime);
  const schedule = formatEventFullSchedule(event);
  const scheduleSub = timeRange ? `${when} · ${timeRange}` : when;
  const location = formatEventLocation(event) || 'Location to be announced';
  const address = formatEventAddress(event);
  const locationTitle = address || location;
  const locationSub = location && location !== locationTitle ? location : null;
  const teaser = (event.shortDescription || '').trim();
  const lifecycle = eventLifecycle(event);
  const isStrip = layout === 'strip';

  if (isStrip) {
    return (
      <TouchableOpacity
        style={[styles.strip, style]}
        onPress={() => onPress(event)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={event.title}
      >
        <View style={styles.stripMedia}>
          {imageUri && !imageFailed ? (
            <Image
              source={sizedImageSource(imageUri, EVENT_STRIP_CARD_WIDTH * 2, 336)}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name="image-outline" size={22} color={EVENT_COLORS.accent} />
            </View>
          )}
          <View style={styles.stripNameScrim}>
            <Text style={styles.stripName} numberOfLines={2}>
              {event.title}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[isStrip ? styles.strip : styles.card, style]}
      onPress={() => onPress(event)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${when}`}
    >
      <View style={isStrip ? styles.stripMedia : styles.media}>
        {imageUri && !imageFailed ? (
          <Image
            source={sizedImageSource(imageUri, 800, 376)}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Icon name={eventTypeIcon(event.eventType)} size={isStrip ? 22 : 26} color={EVENT_COLORS.accent} />
          </View>
        )}
        <EventBadges
          lifecycle={lifecycle}
          eventType={event.eventType}
          isFeatured={event.isFeatured}
          compact={isStrip}
        />
      </View>

      <View style={isStrip ? styles.stripBody : styles.body}>
        <Text style={isStrip ? styles.stripTitle : styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {teaser ? (
          <Text style={isStrip ? styles.stripTeaser : styles.teaser} numberOfLines={isStrip ? 2 : 3}>
            {teaser}
          </Text>
        ) : null}

        <EventFactRow
          icon="calendar-outline"
          title={schedule}
          subtitle={scheduleSub !== schedule ? scheduleSub : null}
          compact={isStrip}
        />
        <EventFactRow
          icon="location-outline"
          title={locationTitle}
          subtitle={locationSub}
          compact={isStrip}
        />
      </View>
    </TouchableOpacity>
  );
}

function EventBadges({
  lifecycle,
  eventType,
  isFeatured,
  compact,
}: {
  lifecycle: 'LIVE' | 'UPCOMING' | 'ENDED';
  eventType: CommunityEvent['eventType'];
  isFeatured: boolean;
  compact?: boolean;
}) {
  const label = lifecycle === 'LIVE' ? 'LIVE' : lifecycle === 'ENDED' ? 'ENDED' : 'UPCOMING';
  return (
    <View style={styles.badgeStack}>
      <View style={[styles.badge, lifecycle === 'LIVE' ? styles.badgeLive : styles.badgeDark]}>
        <Text style={styles.badgeTextOnDark}>{label}</Text>
      </View>
      <View style={styles.badgeDark}>
        <Icon name={eventTypeIcon(eventType)} size={compact ? 10 : 11} color="#FFFFFF" />
        <Text style={styles.badgeTextOnDark}>{eventTypeLabel(eventType)}</Text>
      </View>
      {isFeatured ? (
        <View style={styles.badgeDark}>
          <Icon name="star" size={compact ? 9 : 11} color="#FFFFFF" />
          <Text style={styles.badgeTextOnDark}>Featured</Text>
        </View>
      ) : null}
    </View>
  );
}

function EventFactRow({
  icon,
  title,
  subtitle,
  compact,
}: {
  icon: string;
  title: string;
  subtitle?: string | null;
  compact?: boolean;
}) {
  return (
    <View style={[styles.factRow, compact && styles.factRowCompact]}>
      <View style={[styles.factIcon, compact && styles.factIconCompact]}>
        <Icon name={icon} size={compact ? 14 : 16} color={EVENT_COLORS.accent} />
      </View>
      <View style={styles.factText}>
        <Text style={[styles.factTitle, compact && styles.factTitleCompact]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.factSub, compact && styles.factSubCompact]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
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
  media: { width: '100%', height: 188, backgroundColor: EVENT_COLORS.accentSoft },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeStack: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeLive: { backgroundColor: '#111111' },
  badgeDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  badgeTextOnDark: { fontSize: 10.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  body: { padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: EVENT_COLORS.text, lineHeight: 26 },
  teaser: { fontSize: 13.5, color: EVENT_COLORS.textSecondary, lineHeight: 19, marginTop: -2 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: EVENT_COLORS.accentSoft,
    borderWidth: 1,
    borderColor: EVENT_COLORS.accentBorder,
  },
  factRowCompact: { padding: 8, gap: 8, borderRadius: 12 },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  factIconCompact: { width: 28, height: 28, borderRadius: 8 },
  factText: { flex: 1, minWidth: 0 },
  factTitle: { fontSize: 13.5, fontWeight: '700', color: EVENT_COLORS.text },
  factTitleCompact: { fontSize: 12, fontWeight: '700' },
  factSub: { fontSize: 12, color: EVENT_COLORS.textSecondary, marginTop: 2 },
  factSubCompact: { fontSize: 11, marginTop: 1 },

  strip: {
    width: EVENT_STRIP_CARD_WIDTH,
    backgroundColor: EVENT_COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    overflow: 'hidden',
  },
  stripMedia: {
    width: '100%',
    height: 168,
    backgroundColor: EVENT_COLORS.accentSoft,
  },
  stripNameScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  stripName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  stripBody: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, gap: 8 },
  stripTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: EVENT_COLORS.text,
    lineHeight: 20,
  },
  stripTeaser: { fontSize: 12, color: EVENT_COLORS.textSecondary, lineHeight: 16, marginTop: -2 },
});

export const EventCard = memo(EventCardComponent);
