import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

import { spacing } from '../config/theme';
import { ScheduledItineraryItem, groupSpotsByTimeSlot } from '../utils/itinerary';
import { TouristSpot } from '../types';
import ItineraryCard from './ItineraryCard';
import { palette } from '../config/theme';

interface ItineraryTimelineProps {
  scheduledSpots: ScheduledItineraryItem[];
  completedStops: string[];
  onNavigate: (spot: TouristSpot) => void;
  onViewDetails: (spot: TouristSpot) => void;
  onRemove: (spotId: string) => void;
  onToggleComplete: (spotId: string) => void;
}

const SLOT_COLORS: Record<string, { icon: string; label: string; primary: string; bg: string; gradient: string[] }> = {
  sunrise: { icon: '\uD83C\uDF04', label: 'Sunrise', primary: palette.primary, bg: palette.primaryLight, gradient: [palette.primary, palette.primaryDark] },
  morning: { icon: '\u2600\uFE0F', label: 'Morning', primary: palette.primary, bg: palette.background, gradient: [palette.primary, palette.primaryDark] },
  afternoon: { icon: '\uD83C\uDF1E', label: 'Afternoon', primary: palette.primary, bg: palette.primaryLight, gradient: [palette.primary, palette.primaryDark] },
  evening: { icon: '\uD83C\uDF06', label: 'Evening', primary: palette.primary, bg: palette.background, gradient: [palette.primary, palette.primaryLight] },
  sunset: { icon: '\uD83C\uDF05', label: 'Sunset', primary: palette.primary, bg: palette.primaryLight, gradient: [palette.primary, palette.primaryDark] },
  night: { icon: '\uD83C\uDF19', label: 'Night', primary: palette.primary, bg: palette.primaryLight, gradient: [palette.primary, palette.primaryDark] },
  any: { icon: '\uD83D\uDD50', label: 'Anytime', primary: palette.textSecondary, bg: palette.background, gradient: [palette.textSecondary, palette.border] },
};

export default function ItineraryTimeline({
  scheduledSpots,
  completedStops,
  onNavigate,
  onViewDetails,
  onRemove,
  onToggleComplete,
}: ItineraryTimelineProps) {
  const grouped = groupSpotsByTimeSlot(scheduledSpots);
  const timeSlotKeys = Object.keys(grouped);

  if (timeSlotKeys.length === 0) return null;

  return (
    <View style={styles.container}>
      {timeSlotKeys.map((slot, idx) => {
        const meta = SLOT_COLORS[slot] || { icon: '\uD83D\uDCCD', label: slot, primary: palette.textSecondary, bg: palette.background, gradient: [palette.textSecondary, palette.border] };
        const items = grouped[slot];

        return (
          <SlotSection
            key={slot}
            meta={meta}
            items={items}
            slot={slot}
            idx={idx}
            completedStops={completedStops}
            onNavigate={onNavigate}
            onViewDetails={onViewDetails}
            onRemove={onRemove}
            onToggleComplete={onToggleComplete}
          />
        );
      })}
    </View>
  );
}

function SlotSection({
  meta,
  items,
  idx,
  completedStops,
  onNavigate,
  onViewDetails,
  onRemove,
  onToggleComplete,
}: {
  meta: { icon: string; label: string; primary: string; bg: string; gradient: string[] };
  items: ScheduledItineraryItem[];
  idx: number;
  slot: string;
  completedStops: string[];
  onNavigate: (spot: TouristSpot) => void;
  onViewDetails: (spot: TouristSpot) => void;
  onRemove: (spotId: string) => void;
  onToggleComplete: (spotId: string) => void;
}) {
  const headerAnim = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, friction: 8, tension: 40, delay: idx * 100, useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, [dotPulse, headerAnim, idx]);

  const dotScale = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const dotOpacity = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const headerWidth = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 1] });

  return (
    <View style={styles.section}>
      <Animated.View
        style={[
          styles.sectionHeader,
          {
            opacity: headerAnim,
            transform: [{ translateX: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          },
        ]}
      >
        <View style={[styles.sectionDotOuter, { backgroundColor: meta.bg }]}>
          <View style={[styles.sectionDotInner, { backgroundColor: meta.primary }]}>
            <Text style={styles.sectionDotIcon}>{meta.icon}</Text>
          </View>
          <Animated.View
            style={[
              styles.sectionDotPulse,
              { backgroundColor: meta.primary, transform: [{ scale: dotScale }], opacity: dotOpacity },
            ]}
          />
        </View>
        <View style={styles.sectionLabelGroup}>
          <Text style={[styles.sectionLabel, { color: meta.primary }]}>{meta.label}</Text>
          <Animated.View style={[styles.sectionLine, { flex: headerWidth, backgroundColor: meta.primary + '25' }]} />
        </View>
        <View style={[styles.sectionCountBadge, { backgroundColor: meta.primary + '15' }]}>
          <Text style={[styles.sectionCount, { color: meta.primary }]}>{items.length} stop{items.length > 1 ? 's' : ''}</Text>
        </View>
      </Animated.View>

      <View style={styles.cardsContainer}>
        {items.map((item, itemIdx) => (
          <ItineraryCard
            key={`${item.spot.id}-${item.order}-${itemIdx}`}
            spot={item.spot}
            scheduledTime={item.scheduledTime}
            startMinutes={item.startMinutes}
            endMinutes={item.endMinutes}
            order={item.order}
            distanceFromPrevious={item.distanceFromPrevious}
            isCompleted={completedStops.includes(item.spot.id)}
            onNavigate={() => onNavigate(item.spot)}
            onViewDetails={() => onViewDetails(item.spot)}
            onRemove={() => onRemove(item.spot.id)}
            onToggleComplete={() => onToggleComplete(item.spot.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.lg,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderRadius: 24,
  },
  sectionDotOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  sectionDotInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionDotPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  sectionDotIcon: {
    fontSize: 16,
  },
  sectionLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionLine: {
    height: 2,
    borderRadius: 1,
  },
  sectionCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardsContainer: {
    gap: 0,
  },
});
