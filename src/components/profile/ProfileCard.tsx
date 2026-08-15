import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ImageBackground } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PalPointsIcon } from '../PalPointsIcon';
import { ProfileColors as C, SANS, SANS_BOLD } from './profileTheme';

interface ProfileCardProps {
  name: string;
  avatarUri: string | null;
  location?: string;
  email?: string;
  points: number;
  unlockedRewards: number;
  onEditPress: () => void;
  onCameraPress: () => void;
  onWalletPress: () => void;
  onRewardsPress: () => void;
}

export const ProfileCard = ({
  name,
  avatarUri,
  location,
  email,
  points,
  unlockedRewards,
  onEditPress,
  onCameraPress,
  onWalletPress,
  onRewardsPress,
}: ProfileCardProps) => {
  const formattedPoints = points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return (
    <View style={styles.container}>
      <View style={styles.mainCard}>
        {/* Background Image placed in top right */}
        <Image
          source={require('../../assets/settings_cover.png')}
          style={styles.bgImage}
          resizeMode="cover"
        />

        <View style={styles.topRow}>
          <TouchableOpacity onPress={onEditPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.editBtn}>
            <Icon name="pencil" size={16} color="#1D192B" />
          </TouchableOpacity>

          <View style={styles.avatarWrapper}>
            <View style={styles.avatarRing}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <Image source={require('../../assets/default-avatar.png')} style={styles.avatar} />
              )}
            </View>
            <TouchableOpacity style={styles.cameraBtn} onPress={onCameraPress} activeOpacity={0.8}>
              <Icon name="camera" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.infoContainer}>
            <View style={styles.nameBadgeRow}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </View>
            <View style={styles.explorerBadge}>
              <Icon name="rocket-outline" size={10} color="#7B563D" />
              <Text style={styles.explorerBadgeText}>Explorer</Text>
            </View>

            {email ? (
              <View style={styles.metaRow}>
                <Icon name="mail-outline" size={13} color="#6A6158" />
                <Text style={styles.metaText} numberOfLines={1}>{email}</Text>
              </View>
            ) : null}

            {location ? (
              <View style={styles.metaRow}>
                <Icon name="location-outline" size={13} color="#6A6158" />
                <Text style={styles.metaText} numberOfLines={1}>{location}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.statsSection}>
          <TouchableOpacity style={styles.statTile} onPress={onWalletPress} activeOpacity={0.85}>
            <View style={styles.statIconCircle}>
              <PalPointsIcon size={24} />
            </View>
            <View style={styles.statCopy}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formattedPoints}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>Total Pal Points</Text>
            </View>
            <Icon name="chevron-forward" size={14} color="#1D192B" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.statTile} onPress={onRewardsPress} activeOpacity={0.85}>
            <View style={[styles.statIconCircle, styles.rewardsIconCircle]}>
              <Icon name="gift-outline" size={20} color="#6A6158" />
            </View>
            <View style={styles.statCopy}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{unlockedRewards}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>Rewards</Text>
            </View>
            <Icon name="chevron-forward" size={14} color="#1D192B" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  mainCard: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3EBE3',
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  bgImage: {
    position: 'absolute',
    right: -40,
    bottom: 50,
    width: 250,
    height: 120,
    opacity: 0.8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  avatarWrapper: {
    marginRight: 16,
    position: 'relative',
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#C49B74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#E8DDD0',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#63300E',
    borderWidth: 2,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
    paddingTop: 8,
    minWidth: 0,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 20,
    fontFamily: SANS_BOLD,
    color: '#13111C',
    flexShrink: 1,
    paddingRight: 10,
  },
  explorerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF7F2',
    borderWidth: 1,
    borderColor: '#F3EBE3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    marginBottom: 6,
  },
  explorerBadgeText: {
    fontSize: 10,
    fontFamily: SANS_BOLD,
    color: '#7B563D',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    fontFamily: SANS,
    color: '#6A6158',
  },
  editBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    padding: 4,
  },
  statsSection: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    zIndex: 1,
  },
  statTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF7F2',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#F3EBE3',
  },
  statIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDF7F2',
  },
  rewardsIconCircle: {
    borderWidth: 1,
    borderColor: '#E8DDD0',
    backgroundColor: '#F7F3EE',
  },
  statCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 16,
    fontFamily: SANS_BOLD,
    color: '#13111C',
    marginBottom: 0,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: SANS,
    color: '#6A6158',
    lineHeight: 12,
  },
});
