import React, { memo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { InAppNotification } from '../../../services/api/notifications';

type Props = {
  notification: InAppNotification;
  index: number;
  selected: boolean;
  selectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
};

const COLORS = {
  bg: '#FCF9F4',
  card: '#FFFFFF',
  gold: '#D9A441',
  goldLight: '#FDF7EB',
  black: '#111111',
  border: '#ECE3D7',
  textPrimary: '#202020',
  textSecondary: '#6F6F6F',
  timeText: '#888888',
  green: '#22C55E',
};

function getThumbnail(n: InAppNotification): string | undefined {
  const d = n.data as Record<string, unknown> | null;
  if (!d) return undefined;
  const v = d['imageUrl'] || d['thumbnailUrl'] || d['image'] || d['placeImageUrl'] || d['coverUrl'];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDateDisplay(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'short' });
  const year = date.getFullYear();
  let hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function NotificationCardComponent({
  notification,
  index,
  selected,
  selectionMode,
  onPress,
  onLongPress,
  onMarkRead,
  onDelete,
}: Props) {
  const navigation = useNavigation<any>();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const timeStr = formatRelativeTime(notification.createdAt);
  const thumbUrl = getThumbnail(notification);

  const closeSwipe = useCallback(() => swipeableRef.current?.close(), []);
  const handleMarkRead = useCallback(() => { onMarkRead(); closeSwipe(); }, [closeSwipe, onMarkRead]);
  const handleDelete = useCallback(() => { onDelete(); closeSwipe(); }, [closeSwipe, onDelete]);

  const renderLeftActions = useCallback(
    () => (
      <Pressable style={[styles.actionWrap, styles.actionRead]} onPress={handleMarkRead}>
        <Icon name="checkmark-circle" size={22} color="#FFF" />
        <Text style={styles.actionText}>Read</Text>
      </Pressable>
    ),
    [handleMarkRead],
  );

  const renderRightActions = useCallback(
    () => (
      <Pressable style={[styles.actionWrap, styles.actionDelete]} onPress={handleDelete}>
        <Icon name="trash" size={20} color="#FFF" />
        <Text style={styles.actionText}>Delete</Text>
      </Pressable>
    ),
    [handleDelete],
  );

  const t = `${notification.type} ${notification.title} ${notification.body || ''}`.toLowerCase();
  
  const isCreatorApproved = /creator/i.test(t) && /approve/i.test(t);
  const isPalPoints = /pal.?point/i.test(t) || /reward/i.test(notification.type || '');
  
  let iconName = 'notifications';
  let iconCircleBg = COLORS.black;
  let iconColor = COLORS.gold;
  let badgeText = '';

  if (isCreatorApproved) {
    iconName = 'notifications';
    iconCircleBg = COLORS.black;
    iconColor = COLORS.gold;
    badgeText = 'Creator Program';
  } else if (isPalPoints) {
    iconName = 'gift';
    iconCircleBg = COLORS.gold;
    iconColor = '#FFF';
    badgeText = 'Rewards';
  } else if (/trip|flight|itinerary/.test(t)) {
    iconName = 'airplane';
    badgeText = 'Trips';
  } else if (/hidden.?gem|nearby/.test(t)) {
    iconName = 'location';
    badgeText = 'Nearby';
  } else if (/system|admin|welcome/.test(t)) {
    iconName = 'settings-outline';
    badgeText = 'System';
  }

  let pointsValue = '';
  if (isPalPoints) {
    const match = notification.title.match(/\+?\d+/);
    if (match) pointsValue = match[0];
  }

  const handleCreatorWorkspace = () => {
    navigation.navigate('CreatorTabs');
  };

  const handlePalPointHistory = () => {
    navigation.navigate('Wallet', { initialTab: 'history' });
  };

  const card = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, selected && styles.cardSelected]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: iconCircleBg }]}>
          <Icon name={iconName} size={24} color={iconColor} />
        </View>
        <View style={styles.headerTextWrap}>
          <View style={styles.titleRow}>
            {!notification.read && <View style={styles.unreadDot} />}
            <Text style={styles.title}>{notification.title}</Text>
            <Text style={styles.time}>{timeStr}</Text>
          </View>
          {!!badgeText && (
            <View style={styles.badgeWrap}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardBodyRow}>
        <View style={styles.bodyContent}>
          {!!notification.body && (
            <Text style={styles.bodyText}>{notification.body}</Text>
          )}
          {isCreatorApproved && (
            <View style={styles.supportingRow}>
              <Icon name="star-outline" size={16} color={COLORS.gold} />
              <Text style={styles.supportingText}>
                You can now create content, earn points and grow your audience.
              </Text>
            </View>
          )}
          {isPalPoints && (
            <View style={styles.supportingRow}>
              <View style={styles.goldP}>
                <Text style={styles.goldPText}>P</Text>
              </View>
              <Text style={styles.supportingText}>
                Keep exploring and earning more rewards!
              </Text>
            </View>
          )}
        </View>

        {isCreatorApproved && (
          <View style={styles.statusBlock}>
            <View style={styles.statusTopRow}>
              <View style={styles.statusIconWrap}>
                <Icon name="medal" size={20} color={COLORS.gold} />
              </View>
              <View>
                <Text style={styles.statusLabel}>Status</Text>
                <Text style={styles.statusValueGreen}>Approved</Text>
              </View>
            </View>
            <Text style={styles.statusLabel}>Approved on</Text>
            <Text style={styles.statusDate}>{formatDateDisplay(notification.createdAt)}</Text>
          </View>
        )}

        {isPalPoints && (
          <View style={styles.statusBlock}>
            <View style={styles.statusTopRow}>
              <View style={[styles.statusIconWrap, { backgroundColor: COLORS.gold }]}>
                <Text style={[styles.goldPText, { color: '#FFF' }]}>P</Text>
              </View>
              <Text style={styles.pointsEarnedText}>+{pointsValue || '5'} Pal Points</Text>
            </View>
            <Text style={styles.statusLabel}>Current Balance</Text>
            <Text style={styles.statusValueGold}>5 Pal Points</Text>
          </View>
        )}
        
        {!isCreatorApproved && !isPalPoints && thumbUrl && (
          <View style={styles.thumbWrap}>
            <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        {isCreatorApproved ? (
          <>
            <Pressable style={styles.btnPrimary} onPress={handleCreatorWorkspace}>
              <Icon name="person-outline" size={16} color={COLORS.black} style={styles.btnIcon} />
              <Text style={styles.btnPrimaryText}>View Creator Workspace</Text>
            </Pressable>
            <Pressable style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>Learn More</Text>
              <Icon name="information-circle-outline" size={16} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
            </Pressable>
          </>
        ) : isPalPoints ? (
          <>
            <Pressable style={styles.btnSecondaryIcon}>
              <Icon name="gift-outline" size={16} color={COLORS.black} style={styles.btnIcon} />
              <Text style={styles.btnSecondaryIconText}>View Only</Text>
            </Pressable>
            <Pressable style={styles.btnPrimaryOutline} onPress={handlePalPointHistory}>
              <Icon name="time-outline" size={16} color={COLORS.gold} style={styles.btnIcon} />
              <Text style={styles.btnPrimaryOutlineText}>Pal Point History</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.btnSecondaryIcon} onPress={onPress}>
            <Text style={styles.btnSecondaryIconText}>View</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );

  if (selectionMode) {
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 180)).duration(280)}>
        {card}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 180)).duration(280)}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        overshootFriction={8}
        rightThreshold={40}
        leftThreshold={40}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={direction => {
          if (direction === 'left') handleDelete();
          if (direction === 'right') handleMarkRead();
        }}
      >
        {card}
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

export const NotificationCard = memo(NotificationCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: '#FFFDF9',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  time: {
    fontSize: 11,
    color: COLORS.timeText,
    marginLeft: 8,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
    marginRight: 6,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#B57C1E',
    fontWeight: '600',
  },
  cardBodyRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  bodyContent: {
    flex: 1,
  },
  bodyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  supportingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  supportingText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 6,
    lineHeight: 16,
  },
  goldP: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldPText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.gold,
  },
  statusBlock: {
    width: 140,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    borderRadius: 12,
    padding: 10,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pointsEarnedText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.black,
    flex: 1,
  },
  statusLabel: {
    fontSize: 10,
    color: COLORS.timeText,
    marginBottom: 2,
  },
  statusValueGreen: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.green,
  },
  statusValueGold: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
  },
  statusDate: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  thumbWrap: {
    width: 70,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.black,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FAF7F2',
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  btnSecondaryIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnSecondaryIconText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.black,
  },
  btnPrimaryOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FAF7F2',
  },
  btnPrimaryOutlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  btnIcon: {
    marginRight: 6,
  },
  actionWrap: {
    width: 88,
    marginBottom: 12,
    borderRadius: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionRead: {
    backgroundColor: COLORS.gold,
  },
  actionDelete: {
    backgroundColor: '#EF4444',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
});
