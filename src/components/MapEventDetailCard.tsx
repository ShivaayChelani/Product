import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLocationContext } from '../context/LocationContext';
import { isReliableUserPosition } from '../services/location/distance';
import { useTravelTime } from '../services/location/useTravelTime';
import { formatDriveDistanceMeters, formatTravelTimeLabel } from '../services/location/travelTime';
import {
  eventLifecycle,
  eventTypeIcon,
  eventTypeLabel,
  formatEventDateRange,
  formatEventLocation,
  formatEventTimeRange,
} from '../features/events/eventFormat';
import { palette } from '../config/theme';

/**
 * Marker shape the map hands over. Subset of `MarkerData` — only what this card
 * renders, so it can never drift from the map's payload contract.
 */
export type MapEventDetailMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** EventType key (FESTIVAL, CONCERT, …). */
  category: string;
  image?: string | null;
  description?: string;
  city?: string;
  state?: string;
  startDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  isFeatured?: boolean;
};

type Props = {
  marker: MapEventDetailMarker;
  bottomInset: number;
  locationUnavailable?: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onBookRide?: () => void;
  /** Opens the full EventDetail screen. */
  onOpenEvent: () => void;
};

/**
 * Events layer detail card.
 *
 * Deliberately lighter than MapPlaceDetailCard: an event has no rating, entry
 * fee or photo gallery, and adding to an itinerary is a Place concept. The
 * primary action is the full event page; navigate/ride stay because the map
 * already owns that plumbing.
 */
export default function MapEventDetailCard({
  marker,
  bottomInset,
  locationUnavailable = false,
  onClose,
  onNavigate,
  onBookRide,
  onOpenEvent,
}: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [imageError, setImageError] = useState(false);

  const { effectivePosition } = useLocationContext();
  const travelOrigin =
    effectivePosition && isReliableUserPosition(effectivePosition)
      ? { latitude: effectivePosition.latitude, longitude: effectivePosition.longitude }
      : null;
  const { result: travelTime, loading: travelTimeLoading } = useTravelTime(
    travelOrigin,
    { latitude: marker.lat, longitude: marker.lng },
    marker.id,
  );

  useEffect(() => {
    setImageError(false);
  }, [marker.id]);

  useEffect(() => {
    translateY.setValue(48);
    Animated.spring(translateY, {
      toValue: 0,
      damping: 16,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [marker.id, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) {
          Animated.timing(translateY, {
            toValue: 500,
            duration: 200,
            useNativeDriver: true,
          }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const lifecycle = eventLifecycle({
    isPast: false,
    startDate: marker.startDate ?? '',
    startTime: marker.startTime ?? null,
  });
  const when = formatEventDateRange(marker.startDate, marker.startDate, new Date());
  const timeRange = formatEventTimeRange(marker.startTime ?? null, marker.endTime ?? null);
  const location = formatEventLocation({
    city: marker.city || null,
    state: marker.state || null,
    address: null,
  });
  const description = marker.description?.trim() || '';
  const hasValidImage = !!marker.image && !imageError;

  return (
    <Animated.View
      style={[styles.wrap, { bottom: bottomInset, transform: [{ translateY }] }]}
      collapsable={false}
    >
      <View
        style={styles.dragRegion}
        {...panResponder.panHandlers}
        accessibilityLabel="Swipe down to close event card"
      />

      <View style={styles.headerRow}>
        <View style={styles.imageCol}>
          {hasValidImage ? (
            <Image
              source={{ uri: marker.image as string }}
              style={styles.thumbnail}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.noImageThumbnail}>
              <Icon name={eventTypeIcon(marker.category)} size={26} color={C.accent} />
            </View>
          )}
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {marker.name}
            </Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={18} color="#000000" />
            </TouchableOpacity>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, lifecycle === 'LIVE' ? styles.badgeLive : styles.badgeSoon]}>
              <Text style={[styles.badgeText, lifecycle === 'LIVE' ? styles.badgeTextLive : styles.badgeTextSoon]}>
                {lifecycle === 'LIVE' ? 'LIVE NOW' : lifecycle === 'ENDED' ? 'ENDED' : 'UPCOMING'}
              </Text>
            </View>
            <View style={styles.badge}>
              <Icon name={eventTypeIcon(marker.category)} size={11} color={C.accent} />
              <Text style={styles.badgeText}>{eventTypeLabel(marker.category)}</Text>
            </View>
            {marker.isFeatured ? (
              <View style={[styles.badge, styles.badgeFeatured]}>
                <Icon name="star" size={11} color={C.featured} />
                <Text style={[styles.badgeText, { color: C.featured }]}>Featured</Text>
              </View>
            ) : null}
          </View>

          {when ? (
            <View style={styles.metaRow}>
              <Icon name="calendar-outline" size={13} color={C.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {timeRange ? `${when} · ${timeRange}` : when}
              </Text>
            </View>
          ) : null}

          {location || locationUnavailable ? (
            <View style={styles.metaRow}>
              <Icon name="location-outline" size={13} color={C.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {locationUnavailable && !location ? 'Location unavailable' : location}
              </Text>
            </View>
          ) : null}

          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>

      {travelOrigin && (travelTime || travelTimeLoading) ? (
        <View style={styles.travelRow}>
          {travelTimeLoading ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <>
              <Icon name="car-outline" size={14} color={C.accent} />
              <Text style={styles.travelText}>
                {formatDriveDistanceMeters(travelTime!.distanceMeters)} ·{' '}
                {formatTravelTimeLabel(travelTime!)}
              </Text>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onOpenEvent}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>View Event</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onNavigate}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Icon name="navigate-outline" size={15} color={C.accent} />
        </TouchableOpacity>
        {onBookRide ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onBookRide}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Book a ride"
          >
            <Icon name="car-outline" size={15} color={C.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const C = {
  accent: '#111111',
  accentSoft: '#F2F2F2',
  featured: '#000000',
  text: '#000000',
  textSecondary: '#6B6B6B',
  textBody: '#6B6B6B',
  border: '#F7F6F1',
  live: '#111111',
  liveSoft: '#F2F2F2',
};

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  dragRegion: { height: 22, width: '100%', alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', gap: 12 },
  imageCol: { width: 84, height: 84 },
  thumbnail: {
    width: 84,
    height: 84,
    borderRadius: 16,
    backgroundColor: C.accentSoft,
  },
  noImageThumbnail: {
    width: 84,
    height: 84,
    borderRadius: 16,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    fontFamily: serif,
    lineHeight: 21,
  },
  closeBtn: { padding: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.accentSoft,
  },
  badgeLive: { backgroundColor: C.liveSoft },
  badgeSoon: { backgroundColor: palette.primaryLight },
  badgeFeatured: { backgroundColor: palette.primaryLight },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: C.accent, letterSpacing: 0.2 },
  badgeTextLive: { color: C.live },
  badgeTextSoon: { color: '#000000' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metaText: { fontSize: 12.5, color: C.textSecondary, flexShrink: 1 },
  description: { fontSize: 12.5, color: C.textBody, marginTop: 5, lineHeight: 18 },
  travelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
  },
  travelText: { fontSize: 12.5, fontWeight: '600', color: C.accent },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
  secondaryBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});