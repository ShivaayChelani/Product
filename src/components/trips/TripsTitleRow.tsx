import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useUserContext } from '../../context/UserContext';
import { LinearGradient } from '../../utils/LinearGradient';
import { TripsColors as C, SERIF, SANS } from './tripsTheme';

interface Props {
  unreadCount?: number;
  onNotificationsPress?: () => void;
  topInset?: number;
}

export const TripsTitleRow = ({ unreadCount = 0, onNotificationsPress, topInset = 0 }: Props) => {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/trip-screen-cover.png')}
        style={[styles.heroBg, { paddingTop: topInset + 8 }]}
        imageStyle={styles.heroBgImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.7)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.bellBtn}
            activeOpacity={0.8}
            onPress={onNotificationsPress}
          >
            <Icon name="notifications-outline" size={18} color="#0B2545" />
            {unreadCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.textBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.titleMy}>MY </Text>
            <Text style={styles.titleTrips}>TRIPS</Text>
          </View>
          
          <View style={styles.separatorContainer}>
            <View style={styles.separatorLine} />
            <Icon name="airplane" size={12} color="#0B2545" style={styles.planeIcon} />
            <View style={styles.separatorLine} />
          </View>

          <Text style={styles.tagline}>Explore more, Worry less.</Text>
          
          <View style={styles.subtitleRow}>
            <View style={styles.verticalLine} />
            <Text style={styles.subtitle}>
              All your journeys, one beautiful place{'\n'}to plan, manage and relive.
            </Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    // No bottom margin, so FilterTabs can overlap cleanly
  },
  heroBg: {
    width: '100%',
    minHeight: 250,
    paddingHorizontal: 20,
    paddingBottom: 16,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  heroBgImage: {
    opacity: 1,
    transform: [{ scale: 1.15 }, { translateX: 20 }],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    marginBottom: 0,
    zIndex: 2,
    position: 'relative',
  },
  bellBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E05252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFF',
  },
  textBlock: {
    position: 'relative',
    zIndex: 1,
    paddingRight: 20,
    marginTop: -20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleMy: {
    fontFamily: SANS,
    fontWeight: '900',
    fontSize: 44,
    color: '#0B2545',
    letterSpacing: -1.5,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  titleTrips: {
    fontFamily: SANS,
    fontWeight: '900',
    fontSize: 44,
    color: '#D49A2D',
    letterSpacing: -1.5,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    width: 150,
  },
  separatorLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#0B2545',
    opacity: 0.4,
  },
  planeIcon: {
    marginHorizontal: 8,
    opacity: 0.9,
  },
  tagline: {
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontSize: 16,
    color: '#0B2545',
    marginBottom: 6,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verticalLine: {
    width: 3,
    height: '100%',
    backgroundColor: '#D49A2D',
    marginRight: 10,
    borderRadius: 2,
  },
  subtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 18,
    fontWeight: '600',
  },
});
