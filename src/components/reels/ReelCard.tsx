import React, { useCallback, useMemo, useState, useEffect } from 'react';
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
import { resolveReelVendorActions } from './reelVendorActions';
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
  isFollowingCreator?: boolean;
  currentUserId?: string;
  itemHeight?: number;
  layoutMode?: ReelLayoutMode;
  actionRailPosition?: ReelActionRailPosition;
  onLike: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onShare: (reel: Reel) => void;
  onFollow?: (creatorProfileId: string, currentlyFollowing: boolean) => void;
  onPressAuthor?: (reel: Reel) => void;
  onReport?: (reelId: string) => void;
  /**
   * Route to a vendor reel's business. Only the feed supplies this, and only
   * after it has confirmed the vendor has usable coordinates — the card must
   * never offer a Direction button that goes nowhere.
   */
  onVendorDirections?: (reel: Reel) => void;
}

export const ReelCard: React.FC<ReelCardProps> = React.memo(({
  reel,
  isActive,
  isLiked,
  isFollowingCreator = false,
  currentUserId,
  itemHeight,
  layoutMode = 'tab',
  actionRailPosition,
  onLike,
  onComment,
  onShare,
  onFollow,
  onPressAuthor,
  onReport: _onReport,
  onVendorDirections,
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

  // Business actions live on the author card. They reuse `handleLike` and
  // `handleShare` — the exact callbacks the right rail already calls — so the
  // heart fill state cannot disagree between the rail and the card, and an
  // optimistic failure rolls back in one place.
  const vendorActions = useMemo(
    () => resolveReelVendorActions({
      vendor: reel.vendor,
      isLiked,
      canRoute: !!onVendorDirections,
      onLike: handleLike,
      onShare: handleShare,
      onDirections: () => onVendorDirections?.(reel),
    }),
    [reel, isLiked, onVendorDirections, handleLike, handleShare],
  );

  // Fix for bad scraped usernames that were Instagram URLs stripped of punctuation
  let cleanUsername = creator?.username;
  if (cleanUsername && cleanUsername.includes('instagram')) {
    cleanUsername = cleanUsername
      .replace(/^httpswwwinstagramcom/, '')
      .replace(/^httpwwwinstagramcom/, '')
      .replace(/^httpsinstagramcom/, '')
      .replace(/^httpinstagramcom/, '')
      .replace(/^wwwinstagramcom/, '');
  }

  const vendorName = reel.vendor?.businessName || reel.collaboration?.vendor?.businessName || null;
  const authorDisplayName = vendorName || (cleanUsername ? `@${cleanUsername}` : 'Creator');
  const authorSubtitle = vendorName && cleanUsername ? `@${cleanUsername}` : null;
  const isOwnReel = !!currentUserId && creator?.userId === currentUserId;

  const handleFollowAuthor = useCallback(() => {
    if (!creator?.id || !onFollow) return;
    onFollow(creator.id, isFollowingCreator);
  }, [creator?.id, isFollowingCreator, onFollow]);

  const handlePressAuthor = useCallback(() => {
    onPressAuthor?.(reel);
  }, [onPressAuthor, reel]);

  const playerRef = React.useRef<any>(null);

  const handleSeek = useCallback((pct: number) => {
    if (playerRef.current) {
      playerRef.current.seekToPercent(pct);
    }
    setProgress(pct);
  }, []);

  return (
    <View style={[styles.container, { height, width: windowWidth }]}>
      <ReelPlayer
        ref={playerRef}
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
        likeCount={likeCount}
        commentCount={commentCount}
        shareCount={reel.shares}
        bottom={railPosition.bottom}
        right={railPosition.right}
        onLike={handleLike}
        onComment={handleComment}
        onShare={handleShare}
        onMenu={handleMenu}
      />

      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <ReelBottomPanel
          title={reel.title}
          description={reel.description}
          tags={reel.tags}
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
          vendorActions={vendorActions}
          progress={progress}
          showControls={isActive}
          paddingBottom={overlayInsets.contentPaddingBottom}
          onComment={handleComment}
          onSeek={handleSeek}
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
