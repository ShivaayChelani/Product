import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import DraggableFlatList, {
  NestableDraggableFlatList,
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { TripPlanStop } from '../../../services/api/trips';
import type { RouteLeg } from '../hooks/useOsrmLegs';
import { BT, SERIF, SANS, SANS_SEMI, SANS_BOLD } from '../theme';
import { categoryBadge, formatVisitDuration } from '../utils/itineraryHelpers';
import { getMapMarkerConfig, normalizeCategory } from '../../../utils/mapMarkerUtils';
import { PressableScale } from '../../../components/home/PressableScale';

type Props = {
  stops: TripPlanStop[];
  legs: RouteLeg[];
  listBottomPadding: number;
  onReorder: (ordered: TripPlanStop[]) => void;
  onPressStop: (stop: TripPlanStop) => void;
  onMenuStop: (stop: TripPlanStop) => void;
  onAddPlaces?: () => void;
  /** False when nested in a parent ScrollView that shows every day. */
  scrollEnabled?: boolean;
  listKey?: string;
};

function categoryIconName(category?: string | null): string {
  const icon = getMapMarkerConfig(normalizeCategory(category || 'default')).icon;
  const map: Record<string, string> = {
    waterfall: 'water-outline',
    museum: 'library-outline',
    heritage: 'business-outline',
    cafe: 'cafe-outline',
    food: 'restaurant-outline',
    scenic: 'camera-outline',
    default: 'camera-outline',
  };
  return map[icon] || map.default;
}

function TravelLegPill({ leg }: { leg: RouteLeg }) {
  if (!leg) return null;
  const minLabel =
    leg.minutes >= 60
      ? `${Math.floor(leg.minutes / 60)}h ${leg.minutes % 60}m`
      : `${leg.minutes} min`;
  return (
    <View style={styles.legPillWrap}>
      <View style={styles.legPill}>
        <Icon name="car-outline" size={12} color={BT.secondary} />
        <Text style={styles.legPillText}>
          {minLabel} ({leg.km.toFixed(1)} km)
        </Text>
      </View>
    </View>
  );
}

function StopCard({
  stop,
  index,
  drag,
  isActive,
  onPress,
  onMenu,
  isLast,
  leg,
}: {
  stop: TripPlanStop;
  index: number;
  drag: () => void;
  isActive: boolean;
  onPress: () => void;
  onMenu: () => void;
  isLast: boolean;
  leg: RouteLeg | null;
}) {
  const place = stop.place;
  const thumb = place?.thumbnail || place?.images?.[0];
  const badge = categoryBadge(place?.category);
  const location =
    [place?.city, place?.state].filter(Boolean).join(', ') || place?.name || 'Location';

  return (
    <ScaleDecorator>
      <View style={styles.itemWrap}>
        {index > 0 && leg ? <TravelLegPill leg={leg} /> : null}
        <View style={styles.itemRow}>
          <View style={styles.timelineCol}>
            {!isLast ? <View style={styles.timelineLine} /> : null}
            <View style={styles.numCircle}>
              <Text style={styles.numText}>{index + 1}</Text>
            </View>
          </View>

          <View style={styles.cardCol}>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={onPress}
              onLongPress={drag}
              delayLongPress={180}
              disabled={isActive}
              style={[styles.card, isActive && styles.cardActive]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPh]}>
                  <Icon name="image-outline" size={22} color={BT.textMuted} />
                </View>
              )}

              <View style={styles.info}>
                <Text style={styles.placeName} numberOfLines={2}>
                  {place?.name || 'Place'}
                </Text>
                <View style={styles.metaRow}>
                  <Icon name="location-outline" size={12} color={BT.textSecondary} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {location}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Icon name="time-outline" size={12} color={BT.textSecondary} />
                  <Text style={styles.metaText}>{formatVisitDuration(stop)}</Text>
                </View>
                <View style={[styles.catBadge, { backgroundColor: `${badge.color}18` }]}>
                  <Icon
                    name={categoryIconName(place?.category) as any}
                    size={11}
                    color={badge.color}
                  />
                  <Text style={[styles.catText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>

              <View style={styles.rightCol}>
                <View accessibilityLabel="Drag to reorder">
                  <MaterialCommunityIcons name="drag" size={22} color={BT.textMuted} />
                </View>
                <TouchableOpacity onPress={onMenu} hitSlop={8} accessibilityLabel="More options">
                  <Icon name="ellipsis-vertical" size={18} color={BT.textSecondary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScaleDecorator>
  );
}

function ItineraryTimelineListComponent({
  stops,
  legs,
  listBottomPadding,
  onReorder,
  onPressStop,
  onMenuStop,
  onAddPlaces,
  scrollEnabled = true,
  listKey,
}: Props) {
  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<TripPlanStop>) => {
      const index = getIndex() ?? 0;
      const leg = legs[index] ?? null;
      return (
        <StopCard
          stop={item}
          index={index}
          drag={drag}
          isActive={isActive}
          isLast={index === stops.length - 1}
          leg={leg}
          onPress={() => onPressStop(item)}
          onMenu={() => onMenuStop(item)}
        />
      );
    },
    [legs, onMenuStop, onPressStop, stops.length],
  );

  const keyExtractor = useCallback((item: TripPlanStop) => item.id, []);

  if (stops.length === 0) {
    return (
      <View style={[styles.empty, { paddingBottom: listBottomPadding }]}>
        <View style={styles.emptyIcon}>
          <Icon name="map-outline" size={36} color={BT.secondary} />
        </View>
        <Text style={styles.emptyTitle}>No places yet</Text>
        <Text style={styles.emptyText}>Select places to start building your itinerary.</Text>
        {onAddPlaces ? (
          <PressableScale style={styles.emptyBtn} onPress={onAddPlaces}>
            <Text style={styles.emptyBtnText}>Select Places to Build Itinerary</Text>
          </PressableScale>
        ) : null}
      </View>
    );
  }

  const List = scrollEnabled ? DraggableFlatList : NestableDraggableFlatList;

  return (
    <List
      style={scrollEnabled ? styles.list : undefined}
      containerStyle={scrollEnabled ? styles.list : undefined}
      data={stops}
      extraData={legs}
      keyExtractor={keyExtractor}
      listKey={listKey}
      renderItem={renderItem}
      onDragEnd={({ data }) => onReorder(data)}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: scrollEnabled ? listBottomPadding : 8 },
      ]}
      activationDistance={scrollEnabled ? 0 : 20}
      scrollEnabled={scrollEnabled}
      autoscrollSpeed={80}
      dragItemOverflow
      removeClippedSubviews={false}
      initialNumToRender={Math.max(stops.length, 8)}
      maxToRenderPerBatch={Math.max(stops.length, 8)}
      windowSize={21}
      showsVerticalScrollIndicator={false}
    />
  );
}

export const ItineraryTimelineList = memo(ItineraryTimelineListComponent);

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, flexGrow: 1 },
  itemWrap: { width: '100%' },
  legPillWrap: { alignItems: 'center', marginVertical: 6, paddingLeft: 18 },
  legPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: BT.selectedBg,
    borderWidth: 1,
    borderColor: BT.border,
  },
  legPillText: { fontFamily: SANS, fontSize: 11, color: BT.secondary },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 6,
  },
  timelineCol: {
    width: 32,
    alignItems: 'center',
    paddingTop: 22,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    top: 42,
    bottom: -10,
    width: 2,
    backgroundColor: BT.border,
  },
  numCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BT.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  numText: { fontFamily: SANS_BOLD, fontSize: 12, color: '#FFF' },
  cardCol: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: BT.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BT.border,
    padding: 12,
    gap: 10,
    width: '100%',
    ...BT.shadow,
  },
  cardActive: {
    opacity: 0.96,
    transform: [{ scale: 1.01 }],
    shadowOpacity: 0.1,
  },
  thumb: { width: 76, height: 76, borderRadius: 14, flexShrink: 0 },
  thumbPh: { backgroundColor: BT.border, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 4 },
  placeName: { fontFamily: SERIF, fontSize: 15, color: BT.text, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, fontFamily: SANS, fontSize: 11, color: BT.textSecondary },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 2,
  },
  catText: { fontFamily: SANS_SEMI, fontSize: 10 },
  rightCol: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
    minHeight: 76,
    flexShrink: 0,
  },
  empty: { padding: 32, alignItems: 'center' },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: BT.selectedBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontFamily: SERIF, fontSize: 18, color: BT.text, marginBottom: 6 },
  emptyText: {
    fontFamily: SANS,
    fontSize: 13,
    color: BT.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  emptyBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: BT.primary,
  },
  emptyBtnText: { fontFamily: SANS_BOLD, fontSize: 13, color: '#FFF' },
});
