import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { REEL_ACCENT } from './reelTheme';
import { ReelProgressBar } from './ReelProgressBar';
import { ReelCommentBar } from './ReelCommentBar';
import { ReelAuthorRow } from './ReelAuthorRow';
import { buildReelHashtags, splitCaptionAndHashtags } from './reelCaptionUtils';
import { REEL_BOTTOM_GAP } from './reelLayout';

type Props = {
  title: string | null;
  description: string | null;
  placeName?: string | null;
  placeCity?: string | null;
  collaborationVendorName?: string | null;
  collaborationCreatorName?: string | null;
  isCollaboration?: boolean;
  authorDisplayName?: string | null;
  authorSubtitle?: string | null;
  authorAvatarUri?: string | null;
  authorVerified?: boolean;
  isFollowingAuthor?: boolean;
  isOwnReel?: boolean;
  onPressAuthor?: () => void;
  onFollowAuthor?: () => void;
  progress: number;
  showControls: boolean;
  paddingBottom: number;
  onComment: () => void;
};

function ReelBottomPanelComponent({
  title,
  description,
  placeName,
  placeCity,
  collaborationVendorName,
  collaborationCreatorName,
  isCollaboration,
  authorDisplayName,
  authorSubtitle,
  authorAvatarUri,
  authorVerified,
  isFollowingAuthor = false,
  isOwnReel,
  onPressAuthor,
  onFollowAuthor,
  progress,
  showControls,
  paddingBottom,
  onComment,
}: Props) {
  const raw = description || title || '';
  const { caption } = splitCaptionAndHashtags(raw);
  const hashtags = buildReelHashtags(raw, placeCity, placeName);
  const hasContent = !!caption || hashtags.length > 0;

  return (
    <View style={[styles.wrap, { paddingBottom }]} pointerEvents="box-none">
      {authorDisplayName ? (
        <ReelAuthorRow
          avatarUri={authorAvatarUri}
          displayName={authorDisplayName}
          subtitle={authorSubtitle}
          verified={authorVerified}
          isFollowing={isFollowingAuthor}
          isOwnReel={isOwnReel}
          onPressAuthor={onPressAuthor}
          onFollowPress={onFollowAuthor}
        />
      ) : null}

      {isCollaboration && (collaborationVendorName || collaborationCreatorName) ? (
        <View style={styles.collabRow} pointerEvents="none">
          <Text style={styles.collabLabel} numberOfLines={1}>
            {collaborationCreatorName && collaborationVendorName
              ? `${collaborationCreatorName} 🤝 ${collaborationVendorName}`
              : `🤝 Collaborating With ${collaborationVendorName || collaborationCreatorName}`}
          </Text>
        </View>
      ) : null}
      {hasContent ? (
        <View style={styles.captionBlock} pointerEvents="none">
          {!!caption && (
            <Text style={styles.caption} numberOfLines={3}>
              {caption}
            </Text>
          )}
          {hashtags.length > 0 && (
            <Text style={styles.hashtags} numberOfLines={2}>
              {hashtags.join(' ')}
            </Text>
          )}
        </View>
      ) : null}

      {showControls && (
        <View pointerEvents="box-none">
          <View style={styles.progressWrap} pointerEvents="none">
            <ReelProgressBar progress={progress} />
          </View>
          {/* <ReelCommentBar onPress={onComment} /> */}
        </View>
      )}
    </View>
  );
}

export const ReelBottomPanel = memo(ReelBottomPanelComponent);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
  },
  collabRow: {
    marginBottom: 10,
    paddingRight: 56,
  },
  collabLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  collabName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  captionBlock: {
    marginBottom: REEL_BOTTOM_GAP,
    minHeight: 48,
    paddingRight: 56,
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hashtags: {
    color: REEL_ACCENT,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 20,
  },
  progressWrap: {
    marginHorizontal: -16,
  },
});
