import React, { memo, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PalPointsIcon } from '../../../components/PalPointsIcon';
import { subscribeUnreadBadge } from '../../../services/notifications/notificationBadgeStore';
import { useUserContext } from '../../../context/UserContext';
import { walletApi } from '../../../services/api';

type Props = {
  onBack?: () => void;
  topInset: number;
  onMarkAllRead: () => void;
  markingAll?: boolean;
};

const COLORS = {
  bg: '#FCF9F4',
  gold: '#D9A441',
  textPrimary: '#202020',
  textSecondary: '#6F6F6F',
  headerBlack: '#111111',
};

function NotificationsHeaderComponent({ onBack, topInset, onMarkAllRead, markingAll }: Props) {
  const [unread, setUnread] = useState(0);
  const { user, setUser } = useUserContext();
  const [localPoints, setLocalPoints] = useState(user?.totalPoints || 0);
  
  useEffect(() => {
    // Sync context if possible
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
  
  useEffect(() => subscribeUnreadBadge(setUnread), []);

  return (
    <View style={[styles.wrap, { paddingTop: topInset + 8 }]}>
      {/* Top Row: Back, Logo, Bell, Points */}
      <View style={styles.topRow}>
        <View style={styles.leftSection}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Go back">
              <Icon name="chevron-back" size={28} color={COLORS.headerBlack} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 28 }} />
          )}
          <Image source={require('../../../assets/screen_logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.rightSection}>
          <TouchableOpacity style={styles.bellBtn}>
            <Icon name="notifications-outline" size={24} color={COLORS.headerBlack} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <View style={styles.pointsPill}>
            <PalPointsIcon size={22} />
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.pointsValue}>{points}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Title Row */}
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={onMarkAllRead}
          disabled={markingAll || unread === 0}
          style={styles.markAllBtn}
        >
          <Text style={styles.markAllText}>Mark all as read</Text>
          <Icon name="checkmark-circle-outline" size={18} color={COLORS.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const NotificationsHeader = memo(NotificationsHeaderComponent);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: COLORS.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 4,
    marginLeft: -4,
  },
  logo: {
    width: 120,
    height: 40,
    marginLeft: 0,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bellBtn: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: COLORS.gold,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.headerBlack,
    borderRadius: 24,
    paddingVertical: 4,
    paddingHorizontal: 8,
    paddingRight: 12,
  },
  pointsIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pointsValue: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  pointsLabel: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  markAllText: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '600',
  },
});
