import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserProfile } from '../../types';
import { PalPointsIcon } from '../PalPointsIcon';
import { SB, SERIF, SANS, SANS_BOLD, SANS_SEMI } from './sidebarTheme';

interface DrawerHeaderProps {
  user: UserProfile;
  palPoints?: number;
  isGuest?: boolean;
  onClose: () => void;
}

export const DrawerHeader: React.FC<DrawerHeaderProps> = ({
  user,
  palPoints = 0,
  isGuest,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const initial = (user.displayName || 'T').charAt(0).toUpperCase();
  const hasAvatar = !!user.avatar && !String(user.avatar).startsWith('emoji:');

  return (
    <View style={styles.container}>
      <View style={[styles.headerBg, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 10 }]} onPress={onClose} hitSlop={10}>
          <Icon name="close" size={24} color="#63300E" />
        </TouchableOpacity>
        
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/screen_logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>

      <View style={styles.profileWrapper}>
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            {hasAvatar ? (
              <Image source={{ uri: user.avatar! }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>

          <View style={styles.profileText}>
            <Text style={styles.name} numberOfLines={1}>
              {user.displayName || 'Guest User'}
            </Text>
            <Text style={styles.subline} numberOfLines={1}>
              {isGuest ? 'Guest account' : user.email || user.phoneNumber || 'PalSafar member'}
            </Text>

            {!isGuest ? (
              <View style={styles.pointsChip}>
                <PalPointsIcon size={14} />
                <Text style={styles.pointsText}>
                  {Number(palPoints).toLocaleString()} PalPoints
                </Text>
              </View>
            ) : (
              <View style={styles.guestChip}>
                <Icon name="person-outline" size={12} color={SB.accentSoft} />
                <Text style={styles.guestChipText}>Sign in for full access</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  headerBg: {
    height: 250,
    width: '100%',
    position: 'relative',
    backgroundColor: '#FAF5EE',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3D2B1F',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 0,
    marginTop: -16,
    paddingLeft: 16,
    paddingBottom: 20,
  },
  logo: {
    width: 240,
    height: 120,
  },
  profileWrapper: {
    paddingHorizontal: 20,
    marginTop: -50,
    zIndex: 5,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF0E3', // Bright color instead of white
    borderRadius: 24,
    padding: 16,
    gap: 16,
    shadowColor: SB.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 5,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#F3E8DA',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: SERIF,
    fontSize: 28,
    color: '#A86C20',
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: SANS_BOLD,
    fontSize: 18,
    color: SB.text,
    marginBottom: 2,
  },
  subline: {
    fontFamily: SANS,
    fontSize: 13,
    color: '#8B7D73',
    marginBottom: 8,
  },
  pointsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 4,
  },
  pointsText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: SB.accent,
  },
  guestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    marginTop: 6,
  },
  guestChipText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: '#A86C20',
  },
});
