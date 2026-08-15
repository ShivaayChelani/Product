import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { REEL_ACCENT } from './reelTheme';

interface ReelActionsProps {
  isLiked: boolean;
  isSaved: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  bottom: number;
  right?: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onMenu: () => void;
}

export const ReelActions: React.FC<ReelActionsProps> = React.memo(({
  isLiked,
  isSaved,
  likeCount,
  commentCount,
  shareCount,
  bottom,
  right = 14,
  onLike,
  onComment,
  onShare,
  onSave,
  onMenu,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, friction: 2, tension: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 10, tension: 100, useNativeDriver: true }),
    ]).start();
    onLike();
  };

  const formatCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 10_000) return `${(count / 1_000).toFixed(1)}K`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const ActionBtn = ({
    icon,
    label,
    count,
    onPress,
    color = '#fff',
    animated,
  }: {
    icon: string;
    label?: string;
    count?: number;
    onPress: () => void;
    color?: string;
    animated?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.8}>
      {animated || (
        <Ionicons name={icon as any} size={28} color={color} style={styles.iconShadow} />
      )}
      {label ? (
        <Text style={styles.actionLabel}>{label}</Text>
      ) : count != null ? (
        <Text style={styles.actionText}>{formatCount(count)}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { bottom, right }]} pointerEvents="box-none">
      <ActionBtn
        icon={isLiked ? 'heart' : 'heart-outline'}
        count={likeCount}
        onPress={handleLike}
        color={isLiked ? '#FF2D55' : '#fff'}
        animated={
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={28}
              color={isLiked ? '#FF2D55' : '#fff'}
              style={styles.iconShadow}
            />
          </Animated.View>
        }
      />

      <ActionBtn icon="chatbubble-outline" count={commentCount} onPress={onComment} />
      <ActionBtn icon="paper-plane-outline" count={shareCount} onPress={onShare} />
      <ActionBtn
        icon={isSaved ? 'bookmark' : 'bookmark-outline'}
        label="Save"
        onPress={onSave}
        color={isSaved ? REEL_ACCENT : '#fff'}
      />

      <TouchableOpacity style={styles.actionButton} onPress={onMenu} activeOpacity={0.8}>
        <Ionicons name="ellipsis-vertical" size={24} color="#fff" style={styles.iconShadow} />
      </TouchableOpacity>
    </View>
  );
});

export function showReelMenu(onReport?: () => void, onDownload?: () => void) {
  const { Alert } = require('react-native');
  Alert.alert('Reel options', undefined, [
    { text: 'Download Reel', onPress: onDownload },
    { text: 'Report', style: 'destructive', onPress: onReport },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    gap: 24,
    zIndex: 20,
    elevation: 24,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
