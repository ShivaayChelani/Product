import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { TravelSocialTheme as T } from '../theme';
import { REEL_ACCENT } from '../../../components/reels/reelTheme';

type Props = {
  paddingTop: number;
  title?: string;
  variant?: 'default' | 'feed';
  onBack?: () => void;
  onTitlePress?: () => void;
  onFilter?: () => void;
  filterLabel?: string;
  onCamera?: () => void;
  onNotifications?: () => void;
  onProfile?: () => void;
  avatarUri?: string | null;
  showBack?: boolean;
};

function ReelsTopBarComponent({
  paddingTop,
  title = 'Reels',
  variant = 'default',
  onBack,
  onTitlePress,
  onFilter,
  filterLabel = 'Filter',
  onCamera,
  onNotifications,
  onProfile,
  avatarUri,
  showBack = true,
}: Props) {
  if (variant === 'feed') {
    return (
      <View style={[styles.bar, { paddingTop }]}>
        <View style={styles.feedTitleWrap}>
          <Text style={styles.feedTitle}>{title}</Text>
          <View style={styles.feedUnderline} />
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={onFilter ?? onTitlePress} activeOpacity={0.85}>
          <Icon name="funnel-outline" size={16} color="#fff" />
          <Text style={styles.filterText} numberOfLines={1}>
            {filterLabel}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { paddingTop }]}>
      <View style={styles.left}>
        {showBack ? (
          <TouchableOpacity onPress={onBack} style={styles.hit} accessibilityLabel="Go back">
            <Icon name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.hit} />
        )}
        <TouchableOpacity style={styles.titleRow} onPress={onTitlePress} activeOpacity={0.85}>
          <Text style={styles.title}>{title}</Text>
          <Icon name="chevron-down" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.right}>
        <TouchableOpacity onPress={onCamera} style={styles.hit} accessibilityLabel="Create reel">
          <Icon name="camera-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onNotifications} style={styles.hit} accessibilityLabel="Notifications">
          <Icon name="notifications-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onProfile} style={styles.avatarHit} accessibilityLabel="Your profile">
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Icon name="person" size={16} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  feedTitleWrap: {
    paddingTop: 4,
  },
  feedTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  feedUnderline: {
    marginTop: 6,
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: REEL_ACCENT,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    maxWidth: 140,
  },
  filterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 2,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  avatarHit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.65)',
    marginLeft: 4,
  },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: {
    flex: 1,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ReelsTopBar = memo(ReelsTopBarComponent);
