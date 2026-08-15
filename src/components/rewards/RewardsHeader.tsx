import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserContext } from '../../context/UserContext';
import { PalPointsIcon } from '../PalPointsIcon';
import { walletApi } from '../../services/api';
import { useNavigation } from '@react-navigation/native';

const COLORS = {
  background: '#FFFFFF',
  text: '#202020',
  gold: '#D9A441',
  white: '#FFFFFF',
};

export const RewardsHeader = ({ onMenuPress }: { onMenuPress: () => void }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, setUser } = useUserContext();
  const [localPoints, setLocalPoints] = useState(user?.totalPoints || 0);

  useEffect(() => {
    setLocalPoints(user?.totalPoints || 0);
  }, [user?.totalPoints]);

  useEffect(() => {
    let mounted = true;
    walletApi.getProfile().then((res: any) => {
      if (!mounted) return;
      const profile = res?.data ?? res;
      const pts = Number(profile?.palPoints ?? user?.totalPoints ?? 0);
      if (!Number.isNaN(pts)) {
        setLocalPoints(pts);
        if (pts !== user?.totalPoints && setUser) {
          setUser(prev => prev ? { ...prev, totalPoints: pts } : prev);
        }
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [setUser, user?.totalPoints]);

  const points = localPoints.toLocaleString('en-IN');

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.leftActions}>
        <TouchableOpacity onPress={onMenuPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="menu-outline" size={28} color={COLORS.text} />
        </TouchableOpacity>

        <Image 
          source={require('../../assets/screen_logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={[styles.rightActions, { zIndex: 10 }]}>
        <TouchableOpacity style={styles.pointsBadge} activeOpacity={0.8}>
          <PalPointsIcon size={18} style={styles.pointsIcon} />
          <Text style={styles.pointsText}>{points}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.notificationBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Icon name="notifications-outline" size={24} color={COLORS.text} />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.background,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 160,
    height: 52,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pointsIcon: {
    marginRight: 6,
  },
  pointsText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  notificationBtn: {
    position: 'relative',
    padding: 4,
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.gold,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
});
