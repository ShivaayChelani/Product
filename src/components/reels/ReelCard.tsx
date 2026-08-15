import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Platform,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reel } from '../../types';
import { ReelPlayer } from './ReelPlayer';
import { ReelActions, showReelMenu } from './ReelActions';
import { ReelBottomPanel } from './ReelBottomPanel';
import LinearGradient from 'react-native-linear-gradient';
import { HeartBurstOverlay } from '../../features/travelSocial/components/HeartBurstOverlay';
import {
  getReelOverlayInsets,
  getReelActionRailPosition,
  ReelActionRailPosition,
  ReelLayoutMode,
} from './reelLayout';

interface ReelCardProps {
  reel: Reel;
  isActive: boolean;
  isLiked: boolean;
  isSaved: boolean;
  isFollowingCreator?: boolean;
  currentUserId?: string;
  itemHeight?: number;
  layoutMode?: ReelLayoutMode;
  actionRailPosition?: ReelActionRailPosition;
  onLike: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onShare: (reel: Reel) => void;
  onSave: (reelId: string) => void;
  onFollow?: (creatorProfileId: string, currentlyFollowing: boolean) => void;
  onPressAuthor?: (reel: Reel) => void;
  onReport?: (reelId: string) => void;
}

export const ReelCard: React.FC<ReelCardProps> = React.memo(({
  reel,
  isActive,
  isLiked,
  isSaved,
  isFollowingCreator = false,
  currentUserId,
  itemHeight,
  layoutMode = 'tab',
  actionRailPosition,
  onLike,
  onComment,
  onShare,
  onSave,
  onFollow,
  onPressAuthor,
  onReport: _onReport,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const height = itemHeight || windowHeight;
  const overlayInsets = getReelOverlayInsets(insets.bottom, layoutMode);
  const railPosition = getReelActionRailPosition(insets.bottom, layoutMode, actionRailPosition);

  const [muted, setMuted] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isActive) setProgress(0);
  }, [isActive]);

  const handleDoubleTap = useCallback(() => {
    if (!isLiked) {
      onLike(reel.id);
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        Vibration.vibrate(10);
      }
    }
    setHeartBurst(true);
  }, [isLiked, onLike, reel.id]);

  const handleLongPressMute = useCallback(() => {
    setMuted(m => !m);
  }, []);

  const handleLike = useCallback(() => onLike(reel.id), [reel.id, onLike]);
  const handleComment = useCallback(() => onComment(reel.id), [reel.id, onComment]);
  const handleShare = useCallback(() => onShare(reel), [reel, onShare]);
  const handleSave = useCallback(() => onSave(reel.id), [reel.id, onSave]);

  const handleMenu = useCallback(() => {
    showReelMenu(() => _onReport?.(reel.id));
  }, [_onReport, reel.id]);

  const commentCount = typeof (reel as any).commentsCount === 'number'
    ? Math.max((reel as any).commentsCount, Array.isArray(reel.comments) ? reel.comments.length : 0)
    : (Array.isArray(reel.comments) && reel.comments.length > 0)
      ? reel.comments.length
      : (reel as any).commentCount || 0;

  const likeCount = Math.max(0, reel.likes ?? (reel as any).likeCount ?? (reel as any).likesCount ?? 0);

  const collabVendorName = reel.isCollaboration
    ? (reel.collaboration?.vendor?.businessName || reel.vendor?.businessName || null)
    : null;
  const collabCreatorName = reel.isCollaboration
    ? (reel.collaboration?.creator?.fullName || reel.collaboration?.creator?.username || reel.creator?.username || null)
    : null;

  const creator = reel.creator;
  const vendorName = reel.vendor?.businessName || reel.collaboration?.vendor?.businessName || null;
  const authorDisplayName = vendorName || (creator?.username ? `@${creator.username}` : 'Creator');
  const authorSubtitle = vendorName && creator?.username ? `@${creator.username}` : null;
  const isOwnReel = !!currentUserId && creator?.userId === currentUserId;

  const handleFollowAuthor = useCallback(() => {
    if (!creator?.id || !onFollow) return;
    onFollow(creator.id, isFollowingCreator);
  }, [creator?.id, isFollowingCreator, onFollow]);

  const handlePressAuthor = useCallback(() => {
    onPressAuthor?.(reel);
  }, [onPressAuthor, reel]);

  return (
    <View style={[styles.container, { height, width: windowWidth }]}>
      <ReelPlayer
        videoUrl={reel.videoUrl}
        posterUrl={reel.thumbnail}
        isActive={isActive}
        muted={muted}
        onDoubleTap={handleDoubleTap}
        onLongPress={handleLongPressMute}
        onProgress={setProgress}
      />

      <HeartBurstOverlay visible={heartBurst} onFinished={() => setHeartBurst(false)} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.78)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topGradient}
        pointerEvents="none"
      />

      <ReelActions
        isLiked={isLiked}
        isSaved={isSaved}
        likeCount={likeCount}
        commentCount={commentCount}
        shareCount={reel.shares}
        bottom={railPosition.bottom}
        right={railPosition.right}
        onLike={handleLike}
        onComment={handleComment}
        onShare={handleShare}
        onSave={handleSave}
        onMenu={handleMenu}
      />

      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <ReelBottomPanel
          title={reel.title}
          description={reel.description}
          placeName={reel.place?.name}
          placeCity={reel.place?.city}
          isCollaboration={!!reel.isCollaboration}
          collaborationVendorName={collabVendorName}
          collaborationCreatorName={collabCreatorName}
          authorDisplayName={authorDisplayName}
          authorSubtitle={authorSubtitle}
          authorAvatarUri={creator?.avatar}
          authorVerified={!!creator?.verified}
          isFollowingAuthor={isFollowingCreator}
          isOwnReel={isOwnReel}
          onPressAuthor={onPressAuthor ? handlePressAuthor : undefined}
          onFollowAuthor={onFollow ? handleFollowAuthor : undefined}
          progress={progress}
          showControls={isActive}
          paddingBottom={overlayInsets.contentPaddingBottom}
          onComment={handleComment}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    position: 'relative',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 440,
    zIndex: 5,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
    zIndex: 5,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
  },
});
