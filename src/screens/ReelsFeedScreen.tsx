import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
  Pressable,
  Alert,
  Share,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useUserContext } from '../context/UserContext';
import { Reel } from '../types';
import { getReelsFeed, trackReelView, incrementReelShares } from '../services/reelService';
import { commitReelLikeToggle, applyReelLikeResult, mergeLikedIds, isReelCurrentlyLiked } from '../services/reels/reelLike';
import { buildReelShareMessage } from '../services/sharing/shareLinks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReelFeed } from '../components/reels/ReelFeed';
import { ReelCommentsBottomSheet } from '../components/reels/ReelCommentsBottomSheet';
import { ReelsTopBar } from '../features/travelSocial/components/ReelsTopBar';
import { ReelActionRailPosition } from '../components/reels/reelLayout';
import Icon from 'react-native-vector-icons/Ionicons';
import { DEV_FLAGS } from '../config/devFlags';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socialApi } from '../services/api/social';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const SAVED_KEY = 'PALSAFAR_SAVED_REELS';

const CATEGORIES = ['BUSINESS', 'TRAVEL', 'Following'] as const;
type ReelFilterCategory = (typeof CATEGORIES)[number];

const GOLD = '#B9834B';

/** Tune action rail vertical position: increase bottomAdjust to move rail up */
const REEL_ACTION_RAIL: ReelActionRailPosition = {
  bottomAdjust: 0,
  right: 14,
};

interface ReelsFeedScreenProps {
  onCreateReel?: () => void;
}

export default function ReelsFeedScreen({ onCreateReel: _onCreateReel }: ReelsFeedScreenProps) {
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, setUser, isGuest, onLogout } = useUserContext();

  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ReelFilterCategory>('TRAVEL');
  const [error, setError] = useState<string | null>(null);
  const [commentReelId, setCommentReelId] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [savedReelIds, setSavedReelIds] = useState<string[]>([]);
  const [followingCreatorIds, setFollowingCreatorIds] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadingMoreRef = useRef(false);
  const fetchGenRef = useRef(0);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      try {
        const savedRaw = await AsyncStorage.getItem(SAVED_KEY);
        if (savedRaw) setSavedReelIds(JSON.parse(savedRaw));
      } catch { /* offline */ }
    })();
  }, []);

  const persistSaved = useCallback(async (ids: string[]) => {
    setSavedReelIds(ids);
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  }, []);

  const loadFeed = useCallback(async (reset = false, customCategory = activeCategory) => {
    if (!reset && (loadingMoreRef.current || !hasMore || loading)) return;
    const gen = reset ? ++fetchGenRef.current : fetchGenRef.current;
    if (reset) {
      setLoading(true);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    } else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }

    const targetPage = reset ? 1 : page;
    try {
      const result = await getReelsFeed(
        reset ? undefined : (targetPage - 1) * 5,
        5,
        customCategory,
      );

      if (fetchGenRef.current !== gen) return;

      if (reset) {
        setReels(result.items || []);
      } else {
        setReels(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const newItems = (result.items || []).filter(r => !existingIds.has(r.id));
          return [...prev, ...newItems];
        });
      }
      setPage(targetPage + 1);
      setHasMore(result.hasMore);
      if (reset) setError(null);
    } catch {
      if (fetchGenRef.current !== gen) return;
      if (reset) setError('Failed to load reels. Check your connection and try again.');
    } finally {
      if (fetchGenRef.current === gen) {
        if (reset) setLoading(false);
        else {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      } else if (!reset) {
        loadingMoreRef.current = false;
      }
    }
  }, [page, hasMore, activeCategory, loading]);

  useEffect(() => {
    loadFeed(true, activeCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed(true, activeCategory);
    setRefreshing(false);
  }, [loadFeed, activeCategory]);

  useEffect(() => {
    const fromFeed = reels
      .filter(r => r.isFollowingCreator && r.creator?.id)
      .map(r => r.creator!.id);
    if (fromFeed.length === 0) return;
    setFollowingCreatorIds(prev => [...new Set([...prev, ...fromFeed])]);
  }, [reels]);

  const promptGuestAuth = useCallback((actionName: string) => {
    Alert.alert(
      'Sign In Required',
      `Please sign in to your account to ${actionName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => onLogout() },
      ],
    );
  }, [onLogout]);

  const handleLike = useCallback(async (reelId: string) => {
    if (isGuest || user?.uid === 'guest-user' || !user) {
      promptGuestAuth('like reels');
      return;
    }
    const target = reels.find(r => r.id === reelId);
    const currentlyLiked = isReelCurrentlyLiked(reelId, user.likedReels || [], target?.isLiked);
    try {
      const result = await commitReelLikeToggle(reelId, currentlyLiked, user.uid);
      setUser(prev => prev ? {
        ...prev,
        likedReels: mergeLikedIds(prev.likedReels || [], reelId, result.isLiked),
      } : prev);
      setReels(prev => applyReelLikeResult(prev, reelId, result));
    } catch {
      /* UI stays on last confirmed server state */
    }
  }, [user, setUser, isGuest, promptGuestAuth, reels]);

  const handleSave = useCallback(async (reelId: string) => {
    if (isGuest || user?.uid === 'guest-user') {
      promptGuestAuth('save reels');
      return;
    }
    const isSaved = savedReelIds.includes(reelId);
    const next = isSaved
      ? savedReelIds.filter(id => id !== reelId)
      : [...savedReelIds, reelId];
    await persistSaved(next);
    setReels(prev => prev.map(r =>
      r.id === reelId ? { ...r, saves: Math.max(0, r.saves + (isSaved ? -1 : 1)) } : r,
    ));

    if (DEV_FLAGS.USE_SERVER_API) {
      try {
        const { socialApi } = require('../services/api/social') as typeof import('../services/api/social');
        if (isSaved) await socialApi.unsaveReel(reelId);
        else await socialApi.saveReel(reelId);
      } catch { /* local state kept */ }
    }
  }, [savedReelIds, persistSaved, isGuest, user, promptGuestAuth]);

  const handleShare = useCallback(async (reel: Reel) => {
    const message = buildReelShareMessage(reel);
    if (!message) {
      Alert.alert('Unavailable', 'This reel cannot be shared.');
      return;
    }
    try {
      await Share.share({
        message,
        title: 'PalSafar Reel',
      });
      setReels(prev => prev.map(r =>
        r.id === reel.id ? { ...r, shares: (r.shares || 0) + 1 } : r,
      ));
      void incrementReelShares(reel.id);
    } catch { /* cancelled */ }
  }, []);

  const handleReelViewed = useCallback((reelId: string) => {
    void trackReelView(reelId).then((recorded) => {
      if (!recorded) return;
      setReels(prev => prev.map(r =>
        r.id === reelId ? { ...r, views: (r.views || 0) + 1 } : r,
      ));
    });
  }, []);

  const handleReport = useCallback(async (reelId: string) => {
    if (DEV_FLAGS.USE_SERVER_API) {
      try {
        const { socialApi } = require('../services/api/social') as typeof import('../services/api/social');
        await socialApi.reportReel(reelId, 'Inappropriate content');
        Alert.alert('Reported', 'Thank you. Our team will review this reel.');
        return;
      } catch { /* fall through */ }
    }
    Alert.alert('Reported', 'Thank you for helping keep PalSafar safe.');
  }, []);

  const handleFollow = useCallback(async (creatorProfileId: string, currentlyFollowing: boolean) => {
    if (isGuest || user?.uid === 'guest-user' || !user) {
      promptGuestAuth('follow creators');
      return;
    }

    setFollowingCreatorIds(prev => (
      currentlyFollowing
        ? prev.filter(id => id !== creatorProfileId)
        : [...new Set([...prev, creatorProfileId])]
    ));

    if (!DEV_FLAGS.USE_SERVER_API) return;

    try {
      if (currentlyFollowing) await socialApi.unfollowCreator(creatorProfileId);
      else await socialApi.followCreator(creatorProfileId);
    } catch {
      setFollowingCreatorIds(prev => (
        currentlyFollowing
          ? [...new Set([...prev, creatorProfileId])]
          : prev.filter(id => id !== creatorProfileId)
      ));
      Alert.alert('Error', 'Could not update follow status. Please try again.');
    }
  }, [isGuest, user, promptGuestAuth]);

  const handlePressAuthor = useCallback((reel: Reel) => {
    const username = reel.creator?.username;
    if (!username) return;
    navigation.navigate('CreatorProfile', { username });
  }, [navigation]);

  const handleCommentAdded = useCallback((reelId: string, newComment: any) => {
    setReels(prev => prev.map(r => {
      if (r.id === reelId) {
        const existingComments = Array.isArray(r.comments) ? r.comments : [];
        const currentCount = typeof (r as any).commentsCount === 'number'
          ? (r as any).commentsCount
          : existingComments.length;
        return {
          ...r,
          comments: [newComment, ...existingComments],
          commentsCount: currentCount + 1,
        };
      }
      return r;
    }));
  }, []);

  const handleCategorySelect = (cat: ReelFilterCategory) => {
    setCategoryOpen(false);
    if (cat === 'Following' && (isGuest || user?.uid === 'guest-user' || !user)) {
      promptGuestAuth('see reels from creators you follow');
      return;
    }
    setActiveCategory(cat);
  };

  const topPad = Math.max(insets.top, 44);
  const filterLabel = activeCategory;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ReelsTopBar
        paddingTop={topPad}
        variant="feed"
        filterLabel={filterLabel}
        onFilter={() => setCategoryOpen(true)}
      />

      <ReelFeed
        reels={reels}
        loading={loading || loadingMore}
        error={error}
        hasMore={hasMore}
        likedReelIds={Array.from(new Set([
          ...(user?.likedReels || []),
          ...reels.filter(r => r.isLiked).map(r => r.id),
        ]))}
        savedReelIds={savedReelIds}
        followingCreatorIds={followingCreatorIds}
        currentUserId={user?.uid}
        onLoadMore={() => loadFeed(false)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onLike={handleLike}
        onComment={reelId => {
          if (isGuest || user?.uid === 'guest-user') {
            promptGuestAuth('comment on reels');
            return;
          }
          setCommentReelId(reelId);
        }}
        onShare={handleShare}
        onSave={handleSave}
        onFollow={handleFollow}
        onPressAuthor={handlePressAuthor}
        onReport={handleReport}
        onRetry={() => loadFeed(true)}
        isTabFocused={isFocused}
        onReelViewed={handleReelViewed}
        actionRailPosition={REEL_ACTION_RAIL}
      />

      <ReelCommentsBottomSheet
        reelId={commentReelId}
        visible={!!commentReelId}
        onClose={() => setCommentReelId(null)}
        onCommentAdded={handleCommentAdded}
      />

      {/* Category picker */}
      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryOpen(false)}>
          <View style={[styles.categorySheet, { marginTop: topPad + 48 }]}>
            <Text style={styles.sheetTitle}>Filter reels</Text>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.sheetRow, cat === activeCategory && styles.sheetRowActive]}
                onPress={() => handleCategorySelect(cat)}
              >
                <Text style={[styles.sheetRowText, cat === activeCategory && styles.sheetRowTextActive]}>
                  {cat}
                </Text>
                {cat === activeCategory && <Icon name="checkmark" size={18} color={GOLD} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 100,
  },
  backHit: {
    padding: 4,
  },
  topTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginHorizontal: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cameraBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  categorySheet: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8B7355',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetRowActive: {
    backgroundColor: 'rgba(185,131,75,0.1)',
  },
  sheetRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C1810',
  },
  sheetRowTextActive: {
    color: '#63300E',
    fontWeight: '800',
  },
});
