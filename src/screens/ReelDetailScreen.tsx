import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, StatusBar, TouchableOpacity, BackHandler, Share, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reel } from '../types';
import { ReelFeed } from '../components/reels/ReelFeed';
import { ReelCommentsBottomSheet } from '../components/reels/ReelCommentsBottomSheet';
import { useUserContext } from '../context/UserContext';
import { commitReelLikeToggle, applyReelLikeResult, mergeLikedIds, isReelCurrentlyLiked } from '../services/reels/reelLike';
import { buildReelShareMessage } from '../services/sharing/shareLinks';

interface ReelDetailScreenProps {
  reel: Reel;
  reels?: Reel[];
  initialIndex?: number;
  onBack: () => void;
  onLike: (reelId: string) => void;
  onAddComment: (text: string) => void;
  isLiked: boolean;
}

export default function ReelDetailScreen({
  reel,
  reels,
  initialIndex = 0,
  onBack,
  onLike: _onLike,
  onAddComment: _onAddComment,
  isLiked,
}: ReelDetailScreenProps) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { user, isGuest, onLogout, setUser } = useUserContext();
  const [commentReelId, setCommentReelId] = useState<string | null>(null);
  const [feedData, setFeedData] = useState<Reel[]>(reels && reels.length > 0 ? reels : [reel]);
  const [likedReelIds, setLikedReelIds] = useState<string[]>(() => {
    const seeded = (reels && reels.length > 0 ? reels : [reel])
      .filter(r => r.isLiked)
      .map(r => r.id);
    if (isLiked && !seeded.includes(reel.id)) seeded.push(reel.id);
    return seeded;
  });

  const promptGuestAuth = useCallback((actionName: string) => {
    const { Alert } = require('react-native');
    Alert.alert(
      'Sign In Required',
      `Please sign in to your account to ${actionName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => onLogout() },
      ],
    );
  }, [onLogout]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const handleLike = useCallback(async (targetReelId: string) => {
    if (isGuest || user?.uid === 'guest-user' || !user) {
      promptGuestAuth('like reels');
      return;
    }
    const target = feedData.find(r => r.id === targetReelId);
    const currentlyLiked = isReelCurrentlyLiked(targetReelId, likedReelIds, target?.isLiked);
    try {
      const result = await commitReelLikeToggle(targetReelId, currentlyLiked, user.uid);
      setLikedReelIds(prev => mergeLikedIds(prev, targetReelId, result.isLiked));
      setFeedData(prev => applyReelLikeResult(prev, targetReelId, result));
      setUser(prev => prev ? {
        ...prev,
        likedReels: mergeLikedIds(prev.likedReels || [], targetReelId, result.isLiked),
      } : prev);
    } catch {
      /* keep last confirmed state */
    }
  }, [isGuest, user, promptGuestAuth, feedData, likedReelIds, setUser]);

  const handleShare = useCallback(async (target: Reel) => {
    const message = buildReelShareMessage(target);
    if (!message) {
      Alert.alert('Unavailable', 'This reel cannot be shared.');
      return;
    }
    try {
      await Share.share({ message, title: 'PalSafar Reel' });
    } catch { /* cancelled */ }
  }, []);

  const handleCommentAdded = useCallback((targetReelId: string, newComment: any) => {
    setFeedData(prev => prev.map(r => {
      if (r.id === targetReelId) {
        const existingComments = Array.isArray(r.comments) ? r.comments : [];
        const currentCount = typeof (r as any).commentsCount === 'number'
          ? (r as any).commentsCount
          : (r as any).commentCount || existingComments.length;
        const nextCount = currentCount + 1;
        return {
          ...r,
          comments: [newComment, ...existingComments],
          commentsCount: nextCount,
          commentCount: nextCount,
        };
      }
      return r;
    }));
  }, []);

  const handleOpenComment = useCallback((targetReelId: string) => {
    if (isGuest || user?.uid === 'guest-user') {
      promptGuestAuth('comment on reels');
      return;
    }
    setCommentReelId(targetReelId);
  }, [isGuest, user, promptGuestAuth]);

  const topPad = Math.max(insets.top, 44);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onBack}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          accessibilityLabel="Close reel"
          accessibilityRole="button"
        >
          <Icon name="close" size={28} color="#fff" />
        </TouchableOpacity>
        {reel.creatorId === user?.uid && (
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => {
              const { Alert } = require('react-native');
              Alert.alert('Delete Reel', 'Are you sure you want to delete this reel?', [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Delete', 
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { creatorApi } = require('../features/creator/api/creatorApi');
                      await creatorApi.deleteReel(reel.id);
                      onBack();
                    } catch (e) {
                      Alert.alert('Error', 'Failed to delete reel');
                    }
                  }
                }
              ]);
            }}
          >
            <Icon name="trash-outline" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ReelFeed
        reels={feedData}
        loading={false}
        error={null}
        hasMore={false}
        likedReelIds={likedReelIds}
        savedReelIds={[]}
        followingCreatorIds={[]}
        onLoadMore={() => {}}
        onRefresh={() => {}}
        refreshing={false}
        onLike={handleLike}
        onComment={handleOpenComment}
        onShare={handleShare}
        onSave={() => {}}
        isTabFocused={isFocused}
        layoutMode="fullscreen"
        initialScrollIndex={initialIndex}
      />

      <ReelCommentsBottomSheet
        reelId={commentReelId}
        visible={!!commentReelId}
        onClose={() => setCommentReelId(null)}
        onCommentAdded={handleCommentAdded}
      />
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
    zIndex: 50,
    elevation: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 22,
    zIndex: 51,
    elevation: 51,
  },
});
