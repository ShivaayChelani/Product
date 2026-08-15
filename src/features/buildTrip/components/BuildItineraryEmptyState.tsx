import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  useWindowDimensions,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageComingSoon from '../../../components/ui/ImageComingSoon';
import { hasValidImageUrl } from '../../../utils/imageUrl';
import { placesApi, PlaceResponse } from '../../../services/api/places';
import { subscribeUnreadBadge } from '../../../services/notifications/notificationBadgeStore';
import { BT, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../theme';

type ActionCard = {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

type Props = {
  onBack: () => void;
  onNotifications: () => void;
  onAddFromMap: () => void;
  onSearchPlaces: () => void;
  onBrowsePopular: () => void;
  onCreateEmptyTrip: () => void;
  onAddFirstDestination: () => void;
  onPressPlace: (place: PlaceResponse) => void;
  onAddAllRecommended: (places: PlaceResponse[]) => void;
  onViewAllRecommended: () => void;
};

function RecommendedPlaceCard({
  place,
  width,
  onPress,
}: {
  place: PlaceResponse;
  width: number;
  onPress: () => void;
}) {
  const imageUri = place.thumbnail || place.images?.[0];
  const location = [place.city, place.state].filter(Boolean).join(', ') || 'India';
  const rating = place.rating ?? 0;
  const reviews = place.reviewCount ?? 0;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.recCard, { width }]}
    >
      <View style={styles.recImageWrap}>
        {hasValidImageUrl(imageUri) ? (
          <Image source={{ uri: imageUri! }} style={styles.recImage} resizeMode="cover" />
        ) : (
          <ImageComingSoon style={styles.recImage} compact />
        )}
        <View style={styles.recHeart}>
          <Icon name="heart-outline" size={16} color="#FFF" />
        </View>
      </View>
      <View style={styles.recMeta}>
        <Text style={styles.recName} numberOfLines={1}>
          {place.name}
        </Text>
        <View style={styles.recRow}>
          <Icon name="location-outline" size={12} color={BT.textSecondary} />
          <Text style={styles.recLocation} numberOfLines={1}>
            {location}
          </Text>
        </View>
        <View style={styles.recRow}>
          <Icon name="star" size={12} color={BT.accent} />
          <Text style={styles.recRating}>
            {rating > 0 ? rating.toFixed(1) : 'New'}
            {reviews > 0 ? ` (${reviews >= 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews})` : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function BuildItineraryEmptyState({
  onBack,
  onNotifications,
  onAddFromMap,
  onSearchPlaces,
  onBrowsePopular,
  onCreateEmptyTrip,
  onAddFirstDestination,
  onPressPlace,
  onAddAllRecommended,
  onViewAllRecommended,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recommended, setRecommended] = useState<PlaceResponse[]>([]);
  const [recFetchDone, setRecFetchDone] = useState(false);

  const cardWidth = Math.min(118, (width - 56) / 3);
  const recCardWidth = Math.min(168, width * 0.44);
  const footerPad = Math.max(insets.bottom, 12) + 12;

  useEffect(() => subscribeUnreadBadge(setUnreadCount), []);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void Promise.race([
        placesApi.list({ status: 'APPROVED', limit: 6 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ])
        .then(res => {
          if (!cancelled) setRecommended(res.data || []);
        })
        .catch(() => {
          if (!cancelled) setRecommended([]);
        })
        .finally(() => {
          if (!cancelled) setRecFetchDone(true);
        });
    });

    const fallback = setTimeout(() => {
      if (!cancelled) setRecFetchDone(true);
    }, 4500);

    return () => {
      cancelled = true;
      task.cancel();
      clearTimeout(fallback);
    };
  }, []);

  const actionCards: ActionCard[] = useMemo(
    () => [
      {
        key: 'map',
        icon: 'map-outline',
        title: 'Add from Map',
        subtitle: 'Select places directly from the interactive map.',
        onPress: onAddFromMap,
      },
      {
        key: 'search',
        icon: 'search-outline',
        title: 'Search Places',
        subtitle: 'Search cities, attractions, cafes, temples and more.',
        onPress: onSearchPlaces,
      },
      {
        key: 'popular',
        icon: 'star-outline',
        title: 'Browse Popular Places',
        subtitle: 'Explore handpicked popular destinations near you.',
        onPress: onBrowsePopular,
      },
    ],
    [onAddFromMap, onBrowsePopular, onSearchPlaces],
  );

  const handleAddAll = useCallback(() => {
    if (!recommended.length) {
      onSearchPlaces();
      return;
    }
    void onAddAllRecommended(recommended.slice(0, 4));
  }, [onAddAllRecommended, onSearchPlaces, recommended]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={onBack} activeOpacity={0.7}>
          <Icon name="chevron-back" size={22} color={BT.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Build Your Itinerary</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onNotifications} activeOpacity={0.7}>
            <Icon name="notifications-outline" size={21} color={BT.text} />
            {unreadCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerPad + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={styles.heroIllustration}>
          <View style={styles.mapShape}>
            <Icon name="map" size={56} color={BT.secondary} />
          </View>
          <View style={styles.heroPin}>
            <Icon name="location" size={28} color="#FFF" />
            <View style={styles.heroPinPlus}>
              <Icon name="add" size={10} color={BT.primary} />
            </View>
          </View>
        </View>

        <Text style={styles.heroTitle}>No Destinations Added Yet</Text>
        <Text style={styles.heroSub}>
          Start by adding your first destination to build your personalized itinerary.
        </Text>

        <View style={styles.actionRow}>
          {actionCards.map(card => (
            <TouchableOpacity
              key={card.key}
              activeOpacity={0.85}
              style={[styles.actionCard, { width: cardWidth }]}
              onPress={card.onPress}
            >
              <View style={styles.actionIconBox}>
                <Icon name={card.icon} size={22} color={BT.secondary} />
              </View>
              <Text style={styles.actionTitle}>{card.title}</Text>
              <Text style={styles.actionSub} numberOfLines={3}>
                {card.subtitle}
              </Text>
              <View style={styles.actionArrow}>
                <Icon name="arrow-forward" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <TouchableOpacity style={styles.emptyTripRow} activeOpacity={0.85} onPress={onCreateEmptyTrip}>
          <View style={styles.emptyTripIcon}>
            <Icon name="calendar-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.emptyTripTextCol}>
            <Text style={styles.emptyTripTitle}>Create Empty Trip</Text>
            <Text style={styles.emptyTripSub}>Add destinations later.</Text>
          </View>
          <Icon name="chevron-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.recHeader}>
          <Text style={styles.recSectionTitle}>Recommended for You ✨</Text>
          <TouchableOpacity onPress={onViewAllRecommended} activeOpacity={0.7}>
            <Text style={styles.recViewAll}>View all ›</Text>
          </TouchableOpacity>
        </View>

        {!recFetchDone ? (
          <Text style={styles.recEmpty}>Suggestions load in the background — you can tap buttons above anytime.</Text>
        ) : recommended.length > 0 ? (
          <>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recScroll}
            >
              {recommended.map(place => (
                <RecommendedPlaceCard
                  key={place.id}
                  place={place}
                  width={recCardWidth}
                  onPress={() => onPressPlace(place)}
                />
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.addAllBtn} activeOpacity={0.85} onPress={handleAddAll}>
              <Icon name="add-circle-outline" size={18} color={BT.primary} />
              <Text style={styles.addAllText}>Add All Recommended</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.addAllBtn} activeOpacity={0.85} onPress={onSearchPlaces}>
            <Icon name="search-outline" size={18} color={BT.primary} />
            <Text style={styles.addAllText}>Search Places Instead</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerPad }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.footerBtn} activeOpacity={0.88} onPress={onAddFirstDestination}>
          <Icon name="location" size={18} color="#FFF" />
          <Text style={styles.footerBtnText}>Add Your First Destination</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BT.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: SERIF,
    fontSize: 20,
    color: BT.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E05252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontFamily: SANS_BOLD,
    fontSize: 9,
    color: '#FFF',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heroIllustration: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    marginBottom: 16,
  },
  mapShape: {
    width: 110,
    height: 88,
    borderRadius: 18,
    backgroundColor: BT.selectedBg,
    borderWidth: 1,
    borderColor: BT.border,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  heroPin: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BT.accent,
    alignItems: 'center',
    justifyContent: 'center',
    top: 18,
    ...BT.shadow,
  },
  heroPinPlus: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BT.border,
  },
  heroTitle: {
    fontFamily: SERIF,
    fontSize: 24,
    color: BT.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSub: {
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 20,
    color: BT.textSecondary,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 18,
  },
  actionCard: {
    backgroundColor: BT.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BT.border,
    padding: 10,
    minHeight: 168,
    ...BT.shadow,
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BT.selectedBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: BT.text,
    marginBottom: 4,
  },
  actionSub: {
    fontFamily: SANS,
    fontSize: 9,
    lineHeight: 13,
    color: BT.textSecondary,
    flex: 1,
  },
  actionArrow: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BT.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: BT.border,
  },
  orText: {
    fontFamily: SANS_SEMI,
    fontSize: 11,
    color: BT.textMuted,
    letterSpacing: 1,
  },
  emptyTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BT.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BT.primary,
    padding: 14,
    marginBottom: 24,
    ...BT.shadow,
  },
  emptyTripIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTripTextCol: { flex: 1 },
  emptyTripTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: '#FFFFFF',
  },
  emptyTripSub: {
    fontFamily: SANS,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recSectionTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: BT.text,
  },
  recViewAll: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: BT.secondary,
  },
  recScroll: {
    paddingRight: 12,
  },
  recCard: {
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: BT.card,
    borderWidth: 1,
    borderColor: BT.border,
    overflow: 'hidden',
    ...BT.shadow,
  },
  recImageWrap: {
    height: 108,
    backgroundColor: BT.selectedBg,
  },
  recImage: {
    width: '100%',
    height: '100%',
  },
  recHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(45,36,29,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recMeta: {
    padding: 10,
    gap: 4,
  },
  recName: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: BT.text,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recLocation: {
    fontFamily: SANS,
    fontSize: 11,
    color: BT.textSecondary,
    flex: 1,
  },
  recRating: {
    fontFamily: SANS,
    fontSize: 11,
    color: BT.textSecondary,
  },
  addAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: BT.primary,
    backgroundColor: BT.card,
  },
  addAllText: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: BT.primary,
  },
  recEmpty: {
    fontFamily: SANS,
    fontSize: 13,
    color: BT.textSecondary,
    textAlign: 'center',
    marginVertical: 16,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: BT.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BT.border,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BT.secondary,
    paddingVertical: 16,
    borderRadius: 24,
    ...BT.shadow,
  },
  footerBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: '#FFF',
  },
});
