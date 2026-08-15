import React, { memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PressableScale } from '../../../components/home/PressableScale';
import { TripsColors as C } from '../../../components/trips/tripsTheme';
import { SERIF, SANS, SANS_BOLD } from '../theme';

type Props = {
  variant: 'upcoming' | 'draft' | 'completed';
  onAction?: () => void;
};

function TripEmptySectionComponent({ variant, onAction }: Props) {
  const isDraft = variant === 'draft';
  const isUpcoming = variant === 'upcoming';

  const bgColor = '#F1F5F9';

  return (
    <View style={[styles.card, { backgroundColor: bgColor }]}>
      <View style={styles.leftCol}>
        <View>
          <Text style={styles.title}>
            {isUpcoming
              ? 'No Upcoming\nTrips Yet!'
              : isDraft
                ? 'No Draft\nTrips Yet'
                : 'No Completed\nTrips Yet'}
          </Text>
          <View style={styles.titleUnderline} />
        </View>
        <Text style={styles.body}>
          {isUpcoming
            ? 'Plan your next journey with AI or build an itinerary manually below.'
            : isDraft
              ? 'Start planning your next adventure and save it as draft.'
              : 'Trips you complete will appear here for your memories.'}
        </Text>
        {onAction ? (
          <PressableScale style={styles.btn} onPress={onAction}>
            <Icon name="add" size={14} color="#FFF" />
            <Text style={styles.btnText}>
              {isDraft ? 'Start New Trip' : isUpcoming ? 'Plan a Trip' : 'Explore Places'}
            </Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.rightCol}>
        <Image 
          source={require('../../../assets/empty_trips_suitcase.png')} 
          style={styles.suitcaseImg}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  leftCol: {
    flex: 1,
    paddingRight: 10,
    zIndex: 1,
  },
  title: {
    fontFamily: SANS,
    fontWeight: '800',
    fontSize: 16,
    color: '#0B2545',
    lineHeight: 20,
    marginBottom: 4,
  },
  titleUnderline: {
    width: 20,
    height: 2,
    backgroundColor: '#2563EB',
    marginBottom: 8,
  },
  body: {
    fontFamily: SANS,
    fontSize: 10,
    lineHeight: 14,
    color: '#475569',
    marginBottom: 12,
    maxWidth: 160,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#0B2545',
    alignSelf: 'flex-start',
  },
  btnText: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: '#FFF',
  },
  rightCol: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -10,
  },
  suitcaseImg: {
    width: 110,
    height: 110,
    transform: [{ translateX: 10 }],
  },
});

export const TripEmptySection = memo(TripEmptySectionComponent);
