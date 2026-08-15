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
}: Props) {
  const showFollow = !isOwnReel && !!onFollowPress;

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
});
