import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  avatarUri?: string | null;
  displayName: string;
  subtitle?: string | null;
  verified?: boolean;
  isFollowing: boolean;
  isOwnReel?: boolean;
  onPressAuthor?: () => void;
  onFollowPress?: () => void;
  /**
   * Business actions for a vendor reel's author card.
   *
   * Supplied only when the reel's vendor has usable coordinates, so a vendor
   * without a location gets no dead Direction button. `isLiked` drives the fill
   * state of the heart; the callback is the feed's own toggle handler, so the
   * rail and the card can never disagree about whether the reel is liked.
   */
  vendorActions?: {
    isLiked?: boolean;
    onLike: () => void;
    onShare: () => void;
    /** Absent when the vendor has no routeable coordinates. */
    onDirections?: () => void;
  };
};

function ReelAuthorRowComponent({
  avatarUri,
  displayName,
  subtitle,
  verified,
  isFollowing,
  isOwnReel,
  onPressAuthor,
  onFollowPress,
  vendorActions,
}: Props) {
  // A business cannot be "followed" the way a creator can, so the trailing
  // slot is either the Follow button or the vendor action row, never both.
  const showFollow = !isOwnReel && !vendorActions && !!onFollowPress;

  return (
    <View style={styles.row} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.identity}
        onPress={onPressAuthor}
        activeOpacity={onPressAuthor ? 0.85 : 1}
        disabled={!onPressAuthor}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Icon name="person" size={16} color="#fff" />
          </View>
        )}

        <View style={styles.textWrap}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {displayName}
            </Text>
            {verified ? (
              <Icon name="checkmark-circle" size={14} color={REEL_ACCENT} style={styles.verified} />
            ) : null}
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {showFollow ? (
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followBtnActive]}
          onPress={onFollowPress}
          activeOpacity={0.85}
        >
          <Text style={[styles.followText, isFollowing && styles.followTextActive]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {vendorActions ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionChip}
            onPress={vendorActions.onLike}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={vendorActions.isLiked ? 'Unlike this reel' : 'Like this reel'}
          >
            <Icon
              name={vendorActions.isLiked ? 'heart' : 'heart-outline'}
              size={16}
              color={vendorActions.isLiked ? REEL_ACCENT : '#fff'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionChip}
            onPress={vendorActions.onShare}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share this reel"
          >
            <Icon name="share-social-outline" size={16} color="#fff" />
          </TouchableOpacity>

          {vendorActions.onDirections ? (
            <TouchableOpacity
              style={[styles.actionChip, styles.directionChip]}
              onPress={vendorActions.onDirections}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Get directions to ${displayName}`}
            >
              <Icon name="navigate-outline" size={16} color="#fff" />
              <Text style={styles.directionChipText}>Directions</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const ReelAuthorRow = memo(ReelAuthorRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingRight: 56,
    gap: 10,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    marginRight: 10,
  },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  displayName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  verified: {
    flexShrink: 0,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  followBtn: {
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  followBtnActive: {
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  followText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  followTextActive: {
    color: 'rgba(255,255,255,0.82)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  actionChip: {
    height: 30,
    minWidth: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  directionChip: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
  },
  directionChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
