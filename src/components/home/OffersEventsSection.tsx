import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { PressableScale } from './PressableScale';
import { PalPointsIcon } from '../PalPointsIcon';
import {
  getLuxuryTheme,
  luxuryCardShadow,
  LuxuryRadii,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';

export type HomeOfferItem = {
  id: string;
  title: string;
  subtitle: string;
  discountLabel: string;
  pointsRequired: number;
  imageUrl: string;
};

export type HomeEventItem = {
  id: string;
  title: string;
  location: string;
  time: string;
  imageUrl?: string | null;
};

type Props = {
  offer: HomeOfferItem | null;
  todayEvent?: HomeEventItem | null;
  onOfferPress?: () => void;
  onEventsPress?: () => void;
};

function OffersEventsSectionComponent({ offer, todayEvent, onOfferPress, onEventsPress }: Props) {
  const theme = getLuxuryTheme('light');

  return (
    <View style={styles.row}>
      {offer ? (
        <PressableScale
          onPress={onOfferPress}
          style={[styles.offerCard, luxuryCardShadow()]}
          activeScale={0.98}
        >
        {offer?.imageUrl ? (
          <Image source={{ uri: offer.imageUrl }} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.divider }]} />
        )}
          <LinearGradient
            colors={['rgba(45, 36, 29, 0.15)', 'rgba(45, 36, 29, 0.75)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.offerBadge}>
            <Text style={[LuxuryTypography.label, { color: theme.white }]}>
              {offer.discountLabel}
            </Text>
          </View>
          <View style={styles.offerBody}>
            <Text style={[LuxuryTypography.bodySemiBold, { color: theme.white }]} numberOfLines={1}>
              {offer.title}
            </Text>
            <Text style={[LuxuryTypography.caption, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
              {offer.subtitle}
            </Text>
            <View style={styles.redeemRow}>
              <PalPointsIcon size={18} />
              <Text style={[LuxuryTypography.caption, { color: theme.white }]}>
                Redeem {offer.pointsRequired} PalPoints
              </Text>
            </View>
          </View>
        </PressableScale>
      ) : (
        <View style={[styles.offerCard, styles.placeholder, { borderColor: theme.border }]}>
          <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
            No active offers available.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.eventsCard, luxuryCardShadow(), { backgroundColor: theme.card, borderColor: theme.border }]}
        activeOpacity={0.9}
        onPress={onEventsPress}
        accessibilityRole="button"
        accessibilityLabel="Today's events"
      >
        <View style={styles.eventsHeader}>
          <Text style={[LuxuryTypography.bodySemiBold, { color: theme.textPrimary }]}>
            Today&apos;s Events
          </Text>
          <Icon name="chevron-forward" size={16} color={theme.textSecondary} />
        </View>
        {todayEvent ? (
          <View style={styles.eventRow}>
            {todayEvent.imageUrl ? (
              <Image
                source={{ uri: todayEvent.imageUrl }}
                style={styles.eventThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.eventThumb, styles.eventThumbPlaceholder, { backgroundColor: theme.divider }]}>
                <Icon name="calendar-outline" size={22} color={theme.textSecondary} />
              </View>
            )}
            <View style={styles.eventMeta}>
              <Text style={[LuxuryTypography.bodySemiBold, { color: theme.textPrimary }]} numberOfLines={1}>
                {todayEvent.title}
              </Text>
              <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                {todayEvent.location}
              </Text>
              <View style={styles.timeRow}>
                <Icon name="time-outline" size={13} color={theme.accentBrown} />
                <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                  {todayEvent.time}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.eventsEmpty}>
            <Icon name="calendar-outline" size={28} color={theme.textSecondary} />
            <Text style={[LuxuryTypography.caption, { color: theme.textSecondary, textAlign: 'center' }]}>
              No events near you today. Browse upcoming events.
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: LuxurySpacing.screenHorizontal,
    gap: 12,
    marginBottom: LuxurySpacing.sectionGap,
  },
  offerCard: {
    flex: 1.05,
    height: 168,
    borderRadius: LuxuryRadii.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ECE3D8',
  },
  placeholder: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(110, 68, 36, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: LuxuryRadii.pill,
  },
  offerBody: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
    gap: 4,
  },
  redeemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  coin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D4843A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventsCard: {
    flex: 1,
    borderRadius: LuxuryRadii.card,
    borderWidth: 1,
    padding: 14,
  },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  eventThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  eventThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventMeta: {
    flex: 1,
    gap: 2,
  },
  eventsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
});

export const OffersEventsSection = memo(OffersEventsSectionComponent);
