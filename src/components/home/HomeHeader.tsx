import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Avatar } from '../ui/Avatar';
import {
  getLuxuryTheme,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';

type Props = {
  greeting: string;
  userName: string;
  locationLabel: string;
  weatherLabel: string;
  unreadCount: number;
  avatarUri?: string | null;
  avatarStyle?: number;
  onMenuPress: () => void;
  onNotificationsPress?: () => void;
  onProfilePress?: () => void;
};

function HomeHeaderComponent({
  greeting,
  userName,
  locationLabel,
  weatherLabel,
  unreadCount,
  avatarUri,
  avatarStyle,
  onMenuPress,
  onNotificationsPress,
  onProfilePress,
}: Props) {
  const theme = getLuxuryTheme('light');

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={onMenuPress}
          style={styles.iconHit}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Icon name="menu-outline" size={26} color={theme.textPrimary} />
        </TouchableOpacity>

        <View style={styles.topRight}>
          <TouchableOpacity
            onPress={onNotificationsPress}
            style={styles.iconHit}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Icon name="notifications-outline" size={24} color={theme.textPrimary} />
            {unreadCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <Avatar
            source={avatarUri ? { uri: avatarUri } : null}
            avatarStyle={avatarStyle}
            size="sm"
            onPress={onProfilePress}
          />
        </View>
      </View>

      <View style={styles.greetingBlock}>
        <Text style={[LuxuryTypography.caption, styles.greeting, { color: theme.textSecondary }]}>
          {greeting}
        </Text>
        <Text
          style={[LuxuryTypography.headingLarge, styles.userName, { color: theme.textPrimary }]}
          accessibilityRole="header"
        >
          {userName} 👋
        </Text>
        <View style={styles.metaRow}>
          <Icon name="location-sharp" size={14} color={theme.accentBrown} />
          <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
            {locationLabel}
          </Text>
          <Text style={[LuxuryTypography.caption, styles.metaDot, { color: theme.divider }]}>
            •
          </Text>
          <Icon name="sunny-outline" size={14} color={theme.accentBrown} />
          <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
            {weatherLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: LuxurySpacing.screenHorizontal,
    marginBottom: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E05252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFF',
  },
  greetingBlock: {
    gap: 2,
  },
  greeting: {
    marginBottom: 2,
  },
  userName: {
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaDot: {
    marginHorizontal: 2,
  },
});

export const HomeHeader = memo(HomeHeaderComponent);
