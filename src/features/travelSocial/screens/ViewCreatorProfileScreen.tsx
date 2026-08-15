import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Share,
  Alert,
  RefreshControl,
  Platform,
  useWindowDimensions,
  ScrollView,
  Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TravelSocialTheme as T } from '../theme';
import { formatSocialCount } from '../utils/formatCount';
import { travelSocialQueryKeys } from '../api/queryClient';
import { socialApi } from '../../../services/api';
import { getReelThumbnail } from '../../../services/reelService';
import { useUserContext } from '../../../context/UserContext';
import { useDataContext } from '../../../context/DataContext';
import { collaborationsApi } from '../../../services/api/collaborations';
import { DEV_FLAGS } from '../../../config/devFlags';
import { CreatorProfile, Reel } from '../../../types';
import { RootStackParamList } from '../../../navigation/types';
import { GridSkeleton } from '../../../components/reels/GridSkeleton';

const INTEREST_ICONS: Record<string, string> = {
  Adventure: 'compass-outline',
  Nature: 'leaf-outline',
  Food: 'restaurant-outline',
  Photography: 'camera-outline',
  'Hidden Gems': 'diamond-outline',
};

const ACHIEVEMENT_ICONS: Record<string, { icon: string; color: string }> = {
  'Top Creator': { icon: 'trophy', color: T.secondary },
  'Verified Creator': { icon: 'checkmark-circle', color: T.secondary },
  Explorer: { icon: 'map', color: T.primary },
  'Hidden Gem Hunter': { icon: 'diamond', color: T.secondary },
  'PalSafar Ambassador': { icon: 'ribbon', color: T.primary },
  'Adventure Creator': { icon: 'trail-sign', color: T.primary },
  Traveler: { icon: 'airplane', color: T.textSecondary },
};

type Props = {
  username: string;
  onBack?: () => void;
};

async function fetchCreatorProfile(username: string): Promise<CreatorProfile> {
  const res = await socialApi.getCreatorProfile(username);
  const data = (res as { data?: CreatorProfile })?.data;
  if (!data?.id) throw new Error('Creator not found');
  return data;
}

function resolveCover(profile: CreatorProfile): string | null {
  if (profile.coverImageUrl) return profile.coverImageUrl;
  const first = profile.reels?.[0];
  if (first?.thumbnail) return first.thumbnail;
  return profile.avatar;
}

function resolveThumb(reel: Reel, index: number): string {
  try {
    return getReelThumbnail(reel, index);
  } catch {
    return reel.thumbnail || '';
  }
}

export default function ViewCreatorProfileScreen({ username, onBack }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colWidth = Math.floor((width - 4) / 3);
  const { user, isGuest, onLogout } = useUserContext();
  const { currentVendor } = useDataContext();
  const queryClient = useQueryClient();
  const [bioExpanded, setBioExpanded] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  const { data: profile, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: travelSocialQueryKeys.creatorProfile(username),
    queryFn: () => fetchCreatorProfile(username),
    enabled: DEV_FLAGS.USE_SERVER_API && !!username,
  });

  React.useEffect(() => {
    if (profile) {
      setFollowing(!!profile.isFollowing);
      setFollowersCount(profile.followerCount ?? 0);
    }
  }, [profile]);

  const coverUri = profile ? resolveCover(profile) : null;
  const displayName = profile?.fullName || profile?.username || username;
  const locationLabel =
    profile?.locationLabel ||
    profile?.reels?.find(r => r.place?.city)?.place?.city ||
    null;

  const stats = useMemo(
    () => [
      { key: 'followers', label: 'Followers', value: followersCount },
      { key: 'following', label: 'Following', value: profile?.followingCount ?? 0 },
      { key: 'reels', label: 'Reels', value: profile?.reelCount ?? profile?.reels?.length ?? 0 },
      { key: 'cities', label: 'Cities', value: profile?.citiesCount ?? 0 },
      { key: 'likes', label: 'Likes', value: profile?.totalLikes ?? profile?.totalViews ?? 0 },
    ],
    [profile, followersCount],
  );

  const interests = profile?.travelCategories?.length ? profile.travelCategories : [];

  const achievements = profile?.badges?.length
    ? profile.badges
    : profile?.verified
      ? ['Verified Creator']
      : [];

  const isSelf =
    profile &&
    ((profile.userId && profile.userId === user?.uid) ||
      user?.creatorProfile?.username?.toLowerCase() === profile.username.toLowerCase());

  const hasVendorRole =
    user?.roles?.includes('VENDOR') ||
    user?.permission === 'VENDOR' ||
    !!user?.vendor;
  const vendorActive = currentVendor?.verificationStatus === 'approved';
  const canShowCollaborate = !isSelf && hasVendorRole && profile?.id;

  const { data: collabGate } = useQuery({
    queryKey: ['can-collaborate', profile?.id],
    queryFn: async () => {
      const res = await collaborationsApi.canCollaborate(profile!.id);
      return (res as any)?.data?.data ?? (res as any)?.data;
    },
    enabled: DEV_FLAGS.USE_SERVER_API && !!canShowCollaborate && vendorActive,
  });

  const handleCollaborate = () => {
    if (!profile) return;
    if (isGuest) {
      Alert.alert('Sign in required', 'Sign in as a vendor to collaborate with creators.');
      return;
    }
    if (collabGate && collabGate.allowed === false) {
      if (collabGate.needsSubscription) {
        Alert.alert(
          'Subscription required',
          collabGate.reason || 'Subscribe to a vendor plan to send collaboration requests.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Subscribe', onPress: () => navigation.navigate('VendorSubscription') },
          ],
        );
        return;
      }
      Alert.alert('Unavailable', collabGate.reason || 'Cannot collaborate with this creator right now.');
      return;
    }
    navigation.navigate('CollaborationRequest', {
      creatorProfileId: profile.id,
      creatorName: profile.fullName || profile.username,
    });
  };

  const handleBack = () => (onBack ? onBack() : navigation.goBack());

  const handleFollow = async () => {
    if (!profile || isSelf) return;
    if (isGuest) {
      Alert.alert('Sign in required', 'Sign in to follow creators.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => onLogout() },
      ]);
      return;
    }
    const next = !following;
    setFollowing(next);
    setFollowersCount(c => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) await socialApi.followCreator(profile.id);
      else await socialApi.unfollowCreator(profile.id);
      queryClient.invalidateQueries({ queryKey: travelSocialQueryKeys.creatorProfile(username) });
    } catch {
      setFollowing(!next);
      setFollowersCount(c => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  const handleShareProfile = async () => {
    if (!profile) return;
    const url = `https://palsafar.com/creator/${profile.username}`;
    try {
      await Share.share({ message: `Follow @${profile.username} on PalSafar\n${url}`, url });
    } catch {
      /* cancelled */
    }
  };

  const openMoreMenu = () => {
    setOptionsModalVisible(true);
  };

  const openReel = useCallback(
    (reelId: string, index: number) => {
      navigation.navigate('ReelDetail', {
        reelId,
        reels: profile?.reels || [],
        initialIndex: index,
      });
    },
    [navigation, profile?.reels],
  );

  const renderGridItem = useCallback(
    ({ item, index }: { item: Reel; index: number }) => {
      const thumb = resolveThumb(item, index);
      return (
        <TouchableOpacity
          style={[styles.gridCell, { width: colWidth, height: colWidth * 1.35 }]}
          onPress={() => openReel(item.id, index)}
          accessibilityLabel={`Open reel ${index + 1}`}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.gridImage} />
          ) : (
            <View style={[styles.gridImage, styles.gridPlaceholder]}>
              <Icon name="videocam-outline" size={28} color={T.textSecondary} />
            </View>
          )}
          <View style={styles.viewsBadge}>
            <Icon name="play" size={10} color="#fff" />
            <Text style={styles.viewsText}>{formatSocialCount(item.views ?? 0)}</Text>
          </View>
          <View style={styles.reelIconBadge}>
            <Icon name="film-outline" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    },
    [colWidth, openReel],
  );

  if (!DEV_FLAGS.USE_SERVER_API) {
    return (
      <View style={[styles.centered, { backgroundColor: T.background }]}>
        <Text style={styles.emptyTitle}>Connect to PalSafar</Text>
        <Text style={styles.emptyBody}>Creator profiles require a live server connection.</Text>
      </View>
    );
  }

  if (isLoading && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: T.background, paddingTop: insets.top }}>
        <GridSkeleton count={12} />
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View style={[styles.centered, { backgroundColor: T.background }]}>
        <Icon name="person-circle-outline" size={64} color={T.textSecondary} />
        <Text style={styles.emptyTitle}>Creator not found</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => refetch()}>
          <Text style={styles.primaryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const reels = profile.reels ?? [];

  const listHeader = (
    <>
      <View style={styles.heroWrap}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: T.border }]} />
        )}
        <View style={styles.heroOverlay} />
        <View style={[styles.heroNav, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.heroNavBtn}>
            <Icon name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroNavRight}>
            <TouchableOpacity onPress={handleShareProfile} style={styles.heroNavBtn}>
              <Icon name="share-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={openMoreMenu} style={styles.heroNavBtn}>
              <Icon name="ellipsis-horizontal" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.profileCard, styles.profileCardShadow]}>
        <View style={styles.avatarWrap}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}>
              <Text style={styles.avatarLetter}>{profile.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {profile.verified ? (
            <View style={styles.verifiedBadge}>
              <Icon name="checkmark" size={12} color="#fff" />
            </View>
          ) : null}
        </View>

        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{displayName}</Text>
            {profile.verified ? <Icon name="checkmark-circle" size={20} color={T.secondary} /> : null}
          </View>
          <Text style={styles.handle}>@{profile.username}</Text>
          {locationLabel ? (
            <View style={styles.locationRow}>
              <Icon name="location-outline" size={14} color={T.textSecondary} />
              <Text style={styles.locationText}>{locationLabel}</Text>
            </View>
          ) : null}
          <View style={styles.creatorPill}>
            <Icon name="compass" size={14} color={T.primary} />
            <Text style={styles.creatorPillText}>Adventure Creator</Text>
          </View>
        </View>

        {isSelf ? (
          <View style={styles.actionRow}>
            <View style={styles.selfBadge}>
              <Text style={styles.selfBadgeText}>Your profile</Text>
            </View>
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.followBtn, following && styles.followBtnOutline]}
                onPress={handleFollow}
              >
                <Text style={[styles.followBtnText, following && styles.followBtnTextOutline]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.messageBtn} onPress={() => Alert.alert('Messages', 'Coming soon')}>
                <Text style={styles.messageBtnText}>Message</Text>
              </TouchableOpacity>
            </View>
            {canShowCollaborate ? (
              <TouchableOpacity
                style={[styles.collaborateBtn, collabGate?.allowed === false && { opacity: 0.6 }]}
                onPress={handleCollaborate}
                disabled={collabGate?.allowed === false}
              >
                <Text style={styles.collaborateBtnText}>
                  {collabGate?.allowed === false ? '🤝 Collaborated' : `🤝 Collaborate with ${profile.fullName || profile.username}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={styles.statsRow}>
          {stats.map(s => (
            <TouchableOpacity key={s.key} style={styles.statCell} accessibilityLabel={`${s.label} ${s.value}`}>
              <Text style={styles.statValue}>{formatSocialCount(s.value)}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {profile.bio ? (
          <TouchableOpacity onPress={() => setBioExpanded(v => !v)} activeOpacity={0.9}>
            <Text style={styles.bio} numberOfLines={bioExpanded ? undefined : 2}>
              {profile.bio}
            </Text>
          </TouchableOpacity>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {interests.map(item => (
            <View key={item} style={styles.chip}>
              <Icon name={(INTEREST_ICONS[item] || 'pricetag-outline') as any} size={14} color={T.primary} />
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </ScrollView>

        {achievements.length > 0 ? (
          <View style={styles.achieveRow}>
            {achievements.slice(0, 5).map(badge => {
              const meta = ACHIEVEMENT_ICONS[badge] || { icon: 'star', color: T.secondary };
              return (
                <View key={badge} style={styles.achieveChip}>
                  <Icon name={meta.icon as any} size={16} color={meta.color} />
                  <Text style={styles.achieveText} numberOfLines={1}>
                    {badge}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: T.background }]}>
      <FlashList
        data={reels}
        numColumns={3}
        renderItem={renderGridItem}
        keyExtractor={item => item.id}
        estimatedItemSize={colWidth * 1.35}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.tabEmpty}>
            <Icon name="videocam-outline" size={48} color={T.textSecondary} />
            <Text style={styles.emptyBody}>No reels yet</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={T.primary} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
      
      <Modal
        visible={optionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setOptionsModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(insets.bottom, 24),
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 }}>
                  Profile options
                </Text>
                <Text style={{ fontSize: 14, color: '#666666' }}>
                  Manage this creator profile
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setOptionsModalVisible(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#F5F5F5',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={20} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => {
                  setOptionsModalVisible(false);
                  Alert.alert('Copied', `https://palsafar.com/creator/${username}`);
                }}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: '#EEF4FF' }]}>
                  <Icon name="link" size={22} color="#2563EB" />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>Copy profile link</Text>
                  <Text style={styles.optionSub}>Copy the public profile URL</Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#999999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => {
                  setOptionsModalVisible(false);
                  handleShareProfile();
                }}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: '#E8F5E9' }]}>
                  <Icon name="share-social-outline" size={22} color="#059669" />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>Share profile</Text>
                  <Text style={styles.optionSub}>Share this creator profile</Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#999999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => {
                  setOptionsModalVisible(false);
                  Alert.alert('Reported', 'Thanks. Our team will review this profile.');
                }}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: '#FFF0ED' }]}>
                  <Icon name="flag-outline" size={22} color="#DC2626" />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>Report profile</Text>
                  <Text style={styles.optionSub}>Report inappropriate content</Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#999999" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  heroWrap: { height: 200, width: '100%' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(45,36,29,0.25)',
  },
  heroNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  heroNavRight: { flexDirection: 'row' },
  heroNavBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: T.card,
    marginTop: -T.radiusCard,
    borderTopLeftRadius: T.radiusCard,
    borderTopRightRadius: T.radiusCard,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: T.border,
  },
  profileCardShadow: {
    shadowColor: '#2D241D',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: -56,
    marginBottom: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: T.card,
  },
  avatarPh: {
    backgroundColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 36, fontWeight: '700', color: T.primary },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: T.card,
  },
  nameBlock: { alignItems: 'center', marginBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: T.textPrimary,
    letterSpacing: -0.3,
  },
  handle: { fontSize: 14, color: T.textSecondary, marginTop: 4 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  locationText: { fontSize: 13, color: T.textSecondary },
  creatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: T.radiusPill,
    backgroundColor: '#F3EBE0',
  },
  creatorPillText: { fontSize: 12, fontWeight: '600', color: T.primary },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  followBtn: {
    flex: 1,
    maxWidth: 160,
    backgroundColor: T.primary,
    paddingVertical: 12,
    borderRadius: T.radiusButton,
    alignItems: 'center',
  },
  followBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: T.primary,
  },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followBtnTextOutline: { color: T.primary },
  messageBtn: {
    flex: 1,
    maxWidth: 160,
    backgroundColor: T.background,
    paddingVertical: 12,
    borderRadius: T.radiusButton,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  messageBtnText: { color: T.textPrimary, fontWeight: '700', fontSize: 15 },
  actionsContainer: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  collaborateBtn: {
    backgroundColor: '#FAF5EE',
    borderWidth: 1,
    borderColor: '#E6D3B8',
    paddingVertical: 14,
    borderRadius: T.radiusButton,
    alignItems: 'center',
    marginTop: -8, // Slightly pull up to reduce gap from actionRow
  },
  collaborateBtnText: {
    color: '#8B5A2B',
    fontWeight: '700',
    fontSize: 15,
  },
  selfBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: T.radiusPill,
    backgroundColor: '#E8F5EE',
  },
  selfBadgeText: { color: '#2E7D4F', fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 8,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: T.textPrimary },
  statLabel: { fontSize: 11, color: T.textSecondary, marginTop: 2 },
  bio: {
    fontSize: 14,
    lineHeight: 20,
    color: T.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  chipsScroll: { paddingVertical: 4, paddingRight: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.radiusPill,
    backgroundColor: T.background,
    borderWidth: 1,
    borderColor: T.border,
    marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: T.textPrimary },
  achieveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    justifyContent: 'center',
  },
  achieveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: T.border,
    maxWidth: '48%',
  },
  achieveText: { fontSize: 11, fontWeight: '600', color: T.textPrimary, flexShrink: 1 },
  tabEmpty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  gridCell: { margin: 1, overflow: 'hidden', backgroundColor: '#000' },
  gridImage: { width: '100%', height: '100%' },
  gridPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: T.border },
  viewsBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  viewsText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  reelIconBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 4,
    borderRadius: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: T.textPrimary, marginTop: 12 },
  emptyBody: { fontSize: 14, color: T.textSecondary, textAlign: 'center', marginTop: 8 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: T.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: T.radiusButton,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  optionSub: {
    fontSize: 13,
    color: '#666666',
  },
});
