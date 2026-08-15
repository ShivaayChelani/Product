import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PalPointsIcon } from '../PalPointsIcon';
import { TripsColors as C, SANS, SANS_BOLD } from './tripsTheme';
import type { TripOriginKind } from '../../features/myTrips/utils/tripFormatting';

export interface TripCardProps {
  id: string;
  title: string;
  palPoints?: number;
  budgetStr?: string;
  datesStr: string;
  daysCount?: number;
  locationsStr: string;
  travellerCount: number;
  showResume?: boolean;
  statusBadge?: string;
  originLabel?: string;
  originKind?: TripOriginKind;
  onPressMenu: () => void;
  onPressResume?: () => void;
  onPressViewItinerary: () => void;
}

export const TripCard = ({
  title,
  palPoints = 0,
  budgetStr,
  datesStr,
  daysCount = 1,
  locationsStr,
  travellerCount,
  showResume = false,
  statusBadge = 'UPCOMING',
  originLabel = 'TRIP',
  originKind = 'unknown',
  onPressMenu,
  onPressResume,
  onPressViewItinerary,
}: TripCardProps) => {
  const statusLabel =
    statusBadge === 'ACTIVE'
      ? 'Ongoing'
      : statusBadge === 'COMPLETED'
        ? 'Completed'
        : statusBadge === 'DRAFT'
          ? 'Draft'
          : 'Upcoming';

  const originBadgeStyle =
    originKind === 'ai'
      ? styles.originBadgeAi
      : originKind === 'manual'
        ? styles.originBadgeManual
        : styles.originBadgeUnknown;
  const originTextStyle =
    originKind === 'ai'
      ? styles.originLabelAi
      : originKind === 'manual'
        ? styles.originLabelManual
        : styles.originLabelUnknown;

  return (
    <View style={styles.card}>
      <View style={styles.contentContainer}>
        <View style={styles.originRow}>
          <View style={[styles.originBadge, originBadgeStyle]}>
            <Text style={[styles.originLabel, originTextStyle]} numberOfLines={1}>
              {originLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onPressMenu}
            style={styles.menuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="ellipsis-vertical" size={18} color={C.dark} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleStack}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsBlock}>
          <View style={styles.detailRow}>
            <Icon name="location-outline" size={14} color={C.goldBadge} />
            <Text style={styles.detailText} numberOfLines={1}>
              {locationsStr}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="people-outline" size={14} color={C.goldBadge} />
            <Text style={styles.detailText}>{travellerCount} Travellers</Text>
          </View>
          {palPoints > 0 ? (
            <View style={styles.detailRow}>
              <View style={styles.palPointsIconWrap}>
                <PalPointsIcon size={14} />
              </View>
              <Text style={styles.detailText}>{palPoints.toLocaleString()} PalPoints</Text>
            </View>
          ) : null}
          {budgetStr ? (
            <View style={styles.detailRow}>
              <Icon name="wallet-outline" size={14} color={C.goldBadge} />
              <Text style={styles.detailText}>{budgetStr}</Text>
            </View>
          ) : null}
          {datesStr && datesStr !== 'Dates not set' ? (
            <View style={styles.detailRow}>
              <Icon name="calendar-outline" size={14} color={C.goldBadge} />
              <Text style={styles.detailText}>{datesStr}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Icon name="time-outline" size={14} color={C.goldBadge} />
            <Text style={styles.detailText}>{daysCount} Day{daysCount !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {showResume && onPressResume ? (
            <TouchableOpacity style={styles.resumeBtn} onPress={onPressResume} activeOpacity={0.85}>
              <View style={styles.playCircle}>
                <Icon name="play" size={12} color={C.dark} style={styles.playIcon} />
              </View>
              <Text style={styles.resumeBtnText} numberOfLines={1}>Continue</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.itineraryBtn, !showResume && styles.itineraryBtnFull]}
            onPress={onPressViewItinerary}
            activeOpacity={0.85}
          >
            <Icon name="map-outline" size={13} color={C.dark} />
            <Text style={styles.itineraryBtnText} numberOfLines={1}>Itinerary</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    marginBottom: 0,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3EBE3', // Lighter border
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  originBadge: {
    flexShrink: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  originBadgeAi: {
    backgroundColor: C.brandBlueLight,
    borderColor: '#C5D4E0',
  },
  originBadgeManual: {
    backgroundColor: C.brandOrangeLight,
    borderColor: '#E0D0BC',
  },
  originBadgeUnknown: {
    backgroundColor: '#F5F2EE',
    borderColor: '#E8DFD0',
  },
  originLabel: {
    fontSize: 9,
    fontFamily: SANS_BOLD,
    letterSpacing: 0.3,
  },
  originLabelAi: {
    color: C.brandBlue,
  },
  originLabelManual: {
    color: C.dark,
  },
  originLabelUnknown: {
    color: C.textMuted,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3E914F',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: SANS_BOLD,
    color: '#FFF',
  },
  contentContainer: {
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleStack: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: C.dark,
    flex: 1,
    paddingRight: 4,
  },
  menuBtn: {
    paddingTop: 2,
  },
  detailsBlock: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  palPointsIconWrap: {
    width: 14,
    alignItems: 'center',
  },
  detailText: {
    fontSize: 11,
    fontFamily: SANS,
    color: '#5C534C',
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#63300E',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 20,
    gap: 6,
  },
  playCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 2,
  },
  resumeBtnText: {
    fontSize: 10,
    fontFamily: SANS_BOLD,
    color: '#FFF',
    flexShrink: 1,
  },
  itineraryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C49B74',
    gap: 6,
  },
  itineraryBtnFull: {
    flex: 1,
  },
  itineraryBtnText: {
    fontSize: 10,
    fontFamily: SANS_BOLD,
    color: '#63300E',
    flexShrink: 1,
  },
});
