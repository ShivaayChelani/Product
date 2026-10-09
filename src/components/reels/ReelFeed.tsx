import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Image,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Reel } from '../../types';
import { ReelCard } from './ReelCard';
import { ReelErrorView } from './ReelErrorView';
import { ReelSkeleton } from './ReelSkeleton';
import { ReelLayoutMode, ReelActionRailPosition } from './reelLayout';
import { sizedImageSource } from '../../utils/imageUrl';
import {
  isReelNearActive,
  selectSettledReelIndex,
  shouldMountReelVideo,
} from './reelFeedPlayback';

interface ReelFeedProps {
  reels: Reel[];
  loading: boolean;
  isTabFocused?: boolean;
  error: string | null;
  hasMore: boolean;
  likedReelIds: string[];
  followingCreatorIds: string[];
  currentUserId?: string;
  onLoadMore: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLike: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onShare: (reel: Reel) => void;
  onFollow?: (creatorProfileId: string, currentlyFollowing: boolean) => void;
  onPressAuthor?: (reel: Reel) => void;
  onReport?: (reelId: string) => void;
  /** Route to a vendor reel's business. Supplied only for coordinate-backed vendors. */
  onVendorDirections?: (reel: Reel) => void;
  layoutMode?: ReelLayoutMode;
  actionRailPosition?: ReelActionRailPosition;
  onRetry?: () => void;
  onActiveIndexChange?: (index: number) => void;
  onReelViewed?: (reelId: string) => void;
  initialScrollIndex?: number;
}

export const ReelFeed: React.FC<ReelFeedProps> = React.memo(({
  reels,
  loading,
  error,
  hasMore,
  likedReelIds,
  followingCreatorIds,
  currentUserId,
  onLoadMore,
  onRefresh,
  refreshing,
  onLike,
  onComment,
  onShare,
  onFollow,
  onPressAuthor,
  onReport,
  onVendorDirections,
  layoutMode = 'tab',
  actionRailPosition,
  onRetry,
  isTabFocused = true,
  onActiveIndexChange,
  onReelViewed,
  initialScrollIndex = 0,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(windowHeight);
  const [activeIndex, setActiveIndex] = useState(initialScrollIndex);

  const listExtraData = useMemo(() => ({
    activeIndex,
    isTabFocused,
    likedReelIds,
    followingCreatorIds,
  }), [activeIndex, isTabFocused, likedReelIds, followingCreatorIds]);

  const onReelViewedRef = useRef(onReelViewed);
  onReelViewedRef.current = onReelViewed;
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;

  const activeReelId = reels[activeIndex]?.id;
  useEffect(() => {
    if (!isTabFocused || !activeReelId) return;
    onReelViewedRef.current?.(activeReelId);
  }, [activeIndex, isTabFocused, activeReelId]);

  // Play/pause and Video mount follow the *settled* page only. Updating the
  // active index from viewability mid-fling remounts ExoPlayer during the
  // swipe and is the feed's main jank source.
  const commitSettledIndex = useCallback((offsetY: number) => {
    const idx = selectSettledReelIndex(offsetY, viewportHeight, reels.length);
    if (idx == null) return;
    setActiveIndex(prev => {
      if (prev === idx) return prev;
      onActiveIndexChangeRef.current?.(idx);
      return idx;
    });
  }, [viewportHeight, reels.length]);

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitSettledIndex(e.nativeEvent.contentOffset.y);
  }, [commitSettledIndex]);

  const onScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.velocity?.y ?? 0) > 0.08) return;
    commitSettledIndex(e.nativeEvent.contentOffset.y);
  }, [commitSettledIndex]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next > 0) setViewportHeight(next);
  }, []);

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => {
    const isNearbyWindow = isReelNearActive(index, activeIndex);
    if (!isNearbyWindow) {
      return (
        <View style={{ height: viewportHeight, width: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
          {item.thumbnail ? (
            <Image
              source={sizedImageSource(item.thumbnail, 720, Math.round(viewportHeight * 0.6))}
              style={StyleSheet.absoluteFillObject}
              resizeMode="contain"
            />
          ) : null}
        </View>
      );
    }

    const creatorId = item.creator?.id;
    const isFollowingCreator = creatorId
      ? followingCreatorIds.includes(creatorId) || !!item.isFollowingCreator
      : !!item.isFollowingCreator;

    return (
      <View style={{ height: viewportHeight, width: '100%', overflow: 'hidden' }}>
        <ReelCard
          reel={item}
          itemHeight={viewportHeight}
          layoutMode={layoutMode}
          actionRailPosition={actionRailPosition}
          isActive={shouldMountReelVideo(index, activeIndex, isTabFocused)}
          isLiked={likedReelIds.includes(item.id) || !!item.isLiked}
          isFollowingCreator={isFollowingCreator}
          currentUserId={currentUserId}
          onLike={onLike}
          onComment={onComment}
          onShare={onShare}
          onFollow={onFollow}
          onPressAuthor={onPressAuthor}
          onReport={onReport}
          onVendorDirections={onVendorDirections}
        />
      </View>
    );
  }, [
    viewportHeight, activeIndex, isTabFocused, likedReelIds, followingCreatorIds,
    currentUserId, layoutMode, actionRailPosition, onLike, onComment, onShare, onFollow,
    onPressAuthor, onReport, onVendorDirections,
  ]);

  const getItemType = useCallback((_: Reel, index: number) => (
    isReelNearActive(index, activeIndex) ? 'card' : 'poster'
  ), [activeIndex]);

  const keyExtractor = useCallback((item: Reel, index: number) => item.id || `reel-${index}`, []);

  const renderFooter = useCallback(() => {
    if (!hasMore && reels.length > 0) return null;
    if (loading && reels.length > 0) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }
    return null;
  }, [loading, hasMore, reels.length]);

  if (error && reels.length === 0) {
    return <ReelErrorView message={error} onRetry={onRetry} />;
  }

  if (loading && reels.length === 0) {
    return <ReelSkeleton />;
  }

  if (!loading && reels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Moments yet</Text>
        <Text style={styles.emptyMessage}>Check back soon for travel stories and adventures.</Text>
      </View>
    );
  }

  if (viewportHeight <= 0) {
    return <ReelSkeleton />;
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      <FlashList
        style={styles.list}
        data={reels}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={listExtraData}
        getItemType={getItemType}
        estimatedItemSize={viewportHeight}
        overrideItemLayout={(layout) => {
          layout.size = viewportHeight;
        }}
        initialScrollIndex={initialScrollIndex > 0 ? initialScrollIndex : undefined}
        estimatedFirstItemOffset={initialScrollIndex > 0 ? viewportHeight * initialScrollIndex : undefined}
        drawDistance={viewportHeight}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        onEndReached={hasMore && !loading ? onLoadMore : undefined}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  list: {
    flex: 1,
  },
  footerLoader: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyMessage: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
});
