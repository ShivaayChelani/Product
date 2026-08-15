import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ViewToken,
  ActivityIndicator,
  Text,
  Image,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Reel } from '../../types';
import { ReelCard } from './ReelCard';
import { ReelErrorView } from './ReelErrorView';
import { ReelSkeleton } from './ReelSkeleton';
import { ReelLayoutMode, ReelActionRailPosition } from './reelLayout';

interface ReelFeedProps {
  reels: Reel[];
  loading: boolean;
  isTabFocused?: boolean;
  error: string | null;
  hasMore: boolean;
  likedReelIds: string[];
  savedReelIds: string[];
  followingCreatorIds: string[];
  currentUserId?: string;
  onLoadMore: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLike: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onShare: (reel: Reel) => void;
  onSave: (reelId: string) => void;
  onFollow?: (creatorProfileId: string, currentlyFollowing: boolean) => void;
  onPressAuthor?: (reel: Reel) => void;
  onReport?: (reelId: string) => void;
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
  savedReelIds,
  followingCreatorIds,
  currentUserId,
  onLoadMore,
  onRefresh,
  refreshing,
  onLike,
  onComment,
  onShare,
  onSave,
  onFollow,
  onPressAuthor,
  onReport,
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
    savedReelIds,
    followingCreatorIds,
    likeFlags: reels.map(r => `${r.id}:${r.isLiked ? 1 : 0}:${r.likes}`).join('|'),
  }), [activeIndex, isTabFocused, likedReelIds, savedReelIds, followingCreatorIds, reels]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const onReelViewedRef = useRef(onReelViewed);
  onReelViewedRef.current = onReelViewed;

  useEffect(() => {
    if (!isTabFocused) return;
    const reelId = reels[activeIndex]?.id;
    if (reelId) onReelViewedRef.current?.(reelId);
  }, [activeIndex, isTabFocused, reels]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
      onActiveIndexChange?.(idx);
    }
  }).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next > 0) setViewportHeight(next);
  }, []);

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => {
    const isNearbyWindow = Math.abs(index - activeIndex) <= 1;
    if (!isNearbyWindow) {
      return (
        <View style={{ height: viewportHeight, width: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
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
          isActive={index === activeIndex && isTabFocused}
          isLiked={likedReelIds.includes(item.id) || !!item.isLiked}
          isSaved={savedReelIds.includes(item.id) || !!item.isSaved}
          isFollowingCreator={isFollowingCreator}
          currentUserId={currentUserId}
          onLike={onLike}
          onComment={onComment}
          onShare={onShare}
          onSave={onSave}
          onFollow={onFollow}
          onPressAuthor={onPressAuthor}
          onReport={onReport}
        />
      </View>
    );
  }, [
    viewportHeight, activeIndex, isTabFocused, likedReelIds, savedReelIds, followingCreatorIds,
    currentUserId, layoutMode, actionRailPosition, onLike, onComment, onShare, onSave, onFollow,
    onPressAuthor, onReport,
  ]);

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
        <Text style={styles.emptyTitle}>No reels yet</Text>
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
        estimatedItemSize={viewportHeight}
        overrideItemLayout={(layout) => {
          layout.size = viewportHeight;
        }}
        initialScrollIndex={initialScrollIndex > 0 ? initialScrollIndex : undefined}
        estimatedFirstItemOffset={initialScrollIndex > 0 ? viewportHeight * initialScrollIndex : undefined}
        drawDistance={viewportHeight * 2}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
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
