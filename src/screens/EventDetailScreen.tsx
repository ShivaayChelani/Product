/**
 * Single Community Event.
 *
 * Accepts the cuid or the slug, so the list, Search, the map layer and a
 * `https://palsafar.in/event/:slug` deep link all resolve through the same
 * route and the same cache key. A link whose id fails to parse still lands here
 * with an empty id (see `linking.ts`) and renders the not-found state rather
 * than silently dropping the user on Home.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventDetail } from '../features/events/hooks';
import { EVENT_COLORS } from '../features/events/EventCard';
import {
  eventHasCoordinates,
  eventImage,
  eventLifecycle,
  eventTypeIcon,
  eventTypeLabel,
  formatEventAddress,
  formatEventDateRange,
  formatEventFullSchedule,
  formatEventLocation,
  formatEventTimeRange,
} from '../features/events/eventFormat';
import { shareEvent } from '../services/sharing/shareEvent';
import type { RootStackParamList } from '../navigation/types';
import { openInternalDirections } from '../features/mapExplore/utils/internalDirections';

type Props = { eventIdOrSlug: string };

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_GALLERY = 6;

export default function EventDetailScreen({ eventIdOrSlug }: Props) {
  const navigation = useNavigation<Nav>();
  const { event, isLoading, isError, refetch } = useEventDetail(eventIdOrSlug);
  const [imageError, setImageError] = useState(false);

  const openOnMap = useCallback(() => {
    if (!event || !eventHasCoordinates(event)) return;
    navigation.navigate('MainTabs', {
      screen: 'Map',
      params: { initialMapTab: 'events', mapTabKey: Date.now() },
    });
  }, [event, navigation]);

  const openOnMapAtEvent = useCallback(() => {
    if (!event || !eventHasCoordinates(event)) return;
    navigation.navigate('MainTabs', {
      screen: 'Map',
      params: {
        initialMapTab: 'events',
        mapTabKey: Date.now(),
        selectedPlaceId: '',
        selectedPlaceKey: 0,
      },
    });
  }, [event, navigation]);

  // Event "Directions" → PalSafar's own map, not an external maps app.
  const openDirections = useCallback(() => {
    if (!event || !eventHasCoordinates(event)) return;
    openInternalDirections({
      navigation,
      destination: {
        latitude: event.latitude,
        longitude: event.longitude,
        label: event.title,
      },
      context: 'event_detail',
      initialMapTab: 'events',
    });
  }, [event, navigation]);

  const onShare = useCallback(async () => {
    if (!event) return;
    const result = await shareEvent({
      id: event.id,
      slug: event.slug,
      status: event.status,
      title: event.title,
    });
    if (result === 'unavailable') {
      Alert.alert('Unavailable', 'This event cannot be shared.');
    }
  }, [event]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <DetailHeader onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={EVENT_COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !event) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <DetailHeader onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Icon name="calendar-outline" size={36} color={EVENT_COLORS.textSecondary} />
          <Text style={styles.stateTitle}>Event unavailable</Text>
          <Text style={styles.stateBody}>
            This event may have been removed, cancelled, or the link is not valid.
          </Text>
          <Pressable
            style={styles.stateBtn}
            onPress={() => {
              void refetch();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.stateBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cover = eventImage(event);
  const gallery = [cover, ...(event.images ?? [])].filter(Boolean).slice(0, MAX_GALLERY) as string[];
  const lifecycle = eventLifecycle(event);
  const when = formatEventDateRange(event.startDate, event.endDate);
  const timeRange = formatEventTimeRange(event.startTime, event.endTime);
  const location = formatEventLocation(event);
  const address = formatEventAddress(event);
  const canLocate = eventHasCoordinates(event);
  const description = (event.description || '').trim();
  const linkedPlace = event.placeId && event.placeName ? { id: event.placeId, name: event.placeName } : null;
  const linkedVendor = event.vendorId && event.vendorName ? { id: event.vendorId, name: event.vendorName } : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          {cover && !imageError ? (
            <Image
              source={{ uri: cover }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Icon name={eventTypeIcon(event.eventType)} size={40} color={EVENT_COLORS.accent} />
            </View>
          )}

          <View style={styles.heroTopBar}>
            <Pressable
              style={styles.circleBtn}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-back" size={20} color="#0F172A" />
            </Pressable>
            <Pressable
              style={styles.circleBtn}
              onPress={() => void onShare()}
              accessibilityRole="button"
              accessibilityLabel="Share event"
            >
              <Icon name="share-outline" size={19} color="#0F172A" />
            </Pressable>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, lifecycle === 'LIVE' ? styles.badgeLive : styles.badgeSoon]}>
              <Text
                style={[
                  styles.badgeText,
                  lifecycle === 'LIVE' ? styles.badgeTextLive : styles.badgeTextSoon,
                ]}
              >
                {lifecycle === 'LIVE' ? 'LIVE NOW' : lifecycle === 'ENDED' ? 'ENDED' : 'UPCOMING'}
              </Text>
            </View>
            <View style={styles.badgeGlass}>
              <Icon name={eventTypeIcon(event.eventType)} size={11} color="#FFFFFF" />
              <Text style={styles.badgeTextGlass}>{eventTypeLabel(event.eventType)}</Text>
            </View>
            {event.isFeatured ? (
              <View style={styles.badgeGlass}>
                <Icon name="star" size={11} color="#FCD34D" />
                <Text style={styles.badgeTextGlass}>Featured</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{event.title}</Text>

          <View style={styles.scheduleCard}>
            <Icon name="calendar-outline" size={18} color={EVENT_COLORS.accent} />
            <View style={styles.scheduleText}>
              <Text style={styles.scheduleTitle}>
                {formatEventFullSchedule(event)}
              </Text>
              <Text style={styles.scheduleSub}>
                {when}
                {timeRange ? ` · ${timeRange}` : ''}
              </Text>
            </View>
          </View>

          {address || location ? (
            <View style={styles.infoRow}>
              <Icon name="location-outline" size={18} color={EVENT_COLORS.textSecondary} />
              <View style={styles.infoText}>
                {address ? <Text style={styles.infoTitle}>{address}</Text> : null}
                {location && location !== address ? (
                  <Text style={styles.infoSub}>{location}</Text>
                ) : null}
              </View>
              {canLocate ? (
                <Pressable
                  onPress={openOnMapAtEvent}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Show on map"
                >
                  <Text style={styles.linkText}>Map</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About this event</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
          ) : null}

          {gallery.length > 1 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gallery</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                {gallery.map((uri, index) => (
                  <Image
                    key={`${uri}-${index}`}
                    source={{ uri }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {linkedPlace || linkedVendor ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Organised with</Text>
              {linkedPlace ? (
                <Pressable
                  style={styles.linkRow}
                  onPress={() => navigation.navigate('SpotDetail', { spotId: linkedPlace.id })}
                  accessibilityRole="button"
                >
                  <Icon name="location" size={16} color={EVENT_COLORS.accent} />
                  <Text style={styles.linkRowText}>{linkedPlace.name}</Text>
                  <Icon name="chevron-forward" size={15} color={EVENT_COLORS.textSecondary} />
                </Pressable>
              ) : null}
              {linkedVendor ? (
                <Pressable
                  style={styles.linkRow}
                  onPress={() => navigation.navigate('VendorProfile', { vendorId: linkedVendor.id })}
                  accessibilityRole="button"
                >
                  <Icon name="storefront-outline" size={16} color={EVENT_COLORS.accent} />
                  <Text style={styles.linkRowText}>{linkedVendor.name}</Text>
                  <Icon name="chevron-forward" size={15} color={EVENT_COLORS.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actions}>
            {canLocate ? (
              <>
                <Pressable style={styles.primaryBtn} onPress={openOnMap} accessibilityRole="button">
                  <Icon name="navigate-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>View on map</Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={openDirections} accessibilityRole="button">
                  <Icon name="navigate" size={16} color={EVENT_COLORS.accent} />
                  <Text style={styles.secondaryBtnText}>Directions</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.noLocationNote}>
                <Icon name="information-circle-outline" size={16} color={EVENT_COLORS.textSecondary} />
                <Text style={styles.noLocationText}>
                  The organiser has not published a location for this event.
                </Text>
              </View>
            )}
            <Pressable style={styles.secondaryBtn} onPress={() => void onShare()} accessibilityRole="button">
              <Icon name="share-outline" size={16} color={EVENT_COLORS.accent} />
              <Text style={styles.secondaryBtnText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.miniHeader}>
      <Pressable
        style={styles.circleBtn}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Icon name="chevron-back" size={20} color="#0F172A" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  miniHeader: { paddingHorizontal: 16, paddingVertical: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  stateTitle: { fontSize: 17, fontWeight: '700', color: EVENT_COLORS.text, marginTop: 6 },
  stateBody: { fontSize: 13.5, color: EVENT_COLORS.textSecondary, textAlign: 'center' },
  stateBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: EVENT_COLORS.accent,
  },
  stateBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13.5 },
  scrollContent: { paddingBottom: 48 },
  hero: { height: 260, backgroundColor: EVENT_COLORS.accentSoft },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroTopBar: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: { position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeLive: { backgroundColor: EVENT_COLORS.liveSoft },
  badgeSoon: { backgroundColor: EVENT_COLORS.soonSoft },
  badgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  badgeTextLive: { color: EVENT_COLORS.live },
  badgeTextSoon: { color: EVENT_COLORS.soon },
  badgeGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  badgeTextGlass: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' },
  body: { padding: 20, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: EVENT_COLORS.text, lineHeight: 28 },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: EVENT_COLORS.accentSoft,
    borderWidth: 1,
    borderColor: EVENT_COLORS.accentBorder,
  },
  scheduleText: { flex: 1 },
  scheduleTitle: { fontSize: 14.5, fontWeight: '700', color: EVENT_COLORS.text },
  scheduleSub: { fontSize: 12.5, color: EVENT_COLORS.textSecondary, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '600', color: EVENT_COLORS.text },
  infoSub: { fontSize: 12.5, color: EVENT_COLORS.textSecondary, marginTop: 1 },
  linkText: { fontSize: 13, fontWeight: '700', color: EVENT_COLORS.accent },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: EVENT_COLORS.text },
  description: { fontSize: 14, color: EVENT_COLORS.textBody, lineHeight: 21 },
  galleryRow: { gap: 10, paddingRight: 20 },
  galleryImage: { width: 132, height: 96, borderRadius: 14, backgroundColor: EVENT_COLORS.accentSoft },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
  },
  linkRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: EVENT_COLORS.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexGrow: 1,
    minWidth: 150,
    height: 46,
    borderRadius: 14,
    backgroundColor: EVENT_COLORS.accent,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EVENT_COLORS.accentBorder,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: EVENT_COLORS.accent },
  noLocationNote: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1 },
  noLocationText: { flex: 1, fontSize: 12.5, color: EVENT_COLORS.textSecondary },
});