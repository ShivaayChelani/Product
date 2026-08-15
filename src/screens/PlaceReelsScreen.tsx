import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { placesApi } from '../services/api/places';
import { Reel } from '../types';
import { useUserContext } from '../context/UserContext';
import { useDataContext } from '../context/DataContext';
import { isVendorApproved } from '../utils/workspaceRoles';

type PlaceReelsRouteProp = RouteProp<RootStackParamList, 'PlaceReels'>;

const COLORS = {
  bg: '#FDFBF7',
  card: '#FFFFFF',
  text: '#2C1810',
  textMuted: '#5E544C',
  gold: '#A86C20',
  divider: '#F0EBE1',
  chipBg: '#FFFFFF',
  chipBgActive: '#63300E',
  chipText: '#2C1810',
  chipTextActive: '#FFFFFF',
};

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num || 0);
}

export default function PlaceReelsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<PlaceReelsRouteProp>();
  const { placeId, placeName, placeCity, placeState, placeImage } = route.params;
  const { user } = useUserContext();
  const { currentVendor } = useDataContext();
  const canCreateCreatorReel = !isVendorApproved(user, currentVendor?.verificationStatus);

  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchReels();
    }, [placeId])
  );

  const fetchReels = async () => {
    try {
      setLoading(true);
      const res = await placesApi.getReels(placeId);
      const data = (res as any)?.data || res;
      if (Array.isArray(data)) {
        setReels(data);
      }
    } catch (err) {
      console.warn('Failed to load place reels:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReel = () => {
    navigation.navigate('CreateReel', {
      prefillPlaceId: placeId,
      prefillPlaceName: placeName,
    });
  };

  const handleSharePlace = async () => {
    try {
      await Share.share({
        message: `Check out creator reels and experiences from ${placeName} on PalSafar! 🌍📸`,
      });
    } catch (error) {
      console.warn('Error sharing place', error);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
      >
        <Icon name="arrow-back" size={24} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Reels from {placeName}</Text>
      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={handleSharePlace}>
          <Icon name="arrow-redo-outline" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPlaceBanner = () => (
    <View style={styles.bannerWrap}>
      <View style={styles.bannerImageWrap}>
        {placeImage ? (
          <Image source={{ uri: placeImage }} style={styles.bannerImage} />
        ) : (
          <View style={[styles.bannerImage, styles.bannerImagePlaceholder]}>
            <Icon name="image-outline" size={24} color="#D0BFA5" />
          </View>
        )}
      </View>
      <View style={styles.bannerInfo}>
        <Text style={styles.bannerTitle} numberOfLines={1}>
          {placeName}
        </Text>
        <View style={styles.bannerLocationRow}>
          <Icon name="location-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.bannerLocation} numberOfLines={1}>
            {[placeCity, placeState].filter(Boolean).join(', ')}
          </Text>
        </View>
        <Text style={styles.bannerDesc} numberOfLines={2}>
          Discover the top creator reels and stories from this location.
        </Text>
      </View>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filtersScroll}>
      <View style={[styles.chip, styles.chipActive]}>
        <Icon name="play-outline" size={16} color={COLORS.chipTextActive} style={styles.chipIcon} />
        <Text style={[styles.chipText, styles.chipTextActive]}>All Reels</Text>
      </View>
      <View style={styles.chip}>
        <Icon name="flame-outline" size={16} color={COLORS.chipText} style={styles.chipIcon} />
        <Text style={styles.chipText}>Popular</Text>
      </View>
      <View style={styles.chip}>
        <Icon name="calendar-outline" size={16} color={COLORS.chipText} style={styles.chipIcon} />
        <Text style={styles.chipText}>Recent</Text>
      </View>
      <View style={styles.chip}>
        <Icon name="people-outline" size={16} color={COLORS.chipText} style={styles.chipIcon} />
        <Text style={styles.chipText}>Creators</Text>
      </View>
    </View>
  );

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderTitle}>Reels ({reels.length})</Text>
      <View style={styles.sortRow}>
        <View style={styles.sortBtn}>
          <Text style={styles.sortBtnText}>Sort: Latest</Text>
          <Icon name="chevron-down" size={16} color={COLORS.text} />
        </View>
      </View>
    </View>
  );

  const renderReelCard = ({ item }: { item: Reel }) => (
    <TouchableOpacity 
      style={styles.reelCard}
      activeOpacity={0.8}
      onPress={() => {
        // Navigate to Reel viewer passing context
        navigation.navigate('ReelDetail', { reelId: item.id, reels });
      }}
    >
      <View style={styles.reelThumbWrap}>
        <Image 
          source={{ uri: item.thumbnail || item.videoUrl }} 
          style={styles.reelThumb} 
          resizeMode="cover"
        />
        <View style={styles.durationBadge}>
          <Icon name="play" size={10} color="#FFF" style={{ marginRight: 2 }} />
          <Text style={styles.durationText}>Reel</Text>
        </View>
      </View>
      <View style={styles.reelInfo}>
        <View style={styles.creatorRow}>
          {item.creator?.avatar ? (
            <Image source={{ uri: item.creator.avatar }} style={styles.creatorAvatar} />
          ) : (
            <View style={styles.creatorAvatarPlaceholder}>
              <Icon name="person" size={12} color="#FFF" />
            </View>
          )}
          <View style={styles.creatorNameWrap}>
            <Text style={styles.creatorName} numberOfLines={1}>
              {item.creator?.username || 'Creator'}
            </Text>
            {item.creator?.verified && (
              <Icon name="checkmark-circle" size={14} color="#F5B041" style={{ marginLeft: 4 }} />
            )}
          </View>
          <TouchableOpacity style={styles.cardMenuBtn}>
            <Icon name="ellipsis-vertical" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.creatorHandle} numberOfLines={1}>
          @{item.creator?.username?.toLowerCase().replace(/\s/g, '_') || 'creator'}
        </Text>

        <Text style={styles.reelCaption} numberOfLines={2}>
          {item.description || item.title || `Exploring ${placeName}`}
        </Text>

        <View style={styles.reelLocationRow}>
          <Icon name="location-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.reelLocationText} numberOfLines={1}>
            {placeName}{placeCity ? `, ${placeCity}` : ''}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Icon name="eye-outline" size={14} color={COLORS.text} />
            <Text style={styles.statText}>{formatNumber(item.views || 0)}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="heart-outline" size={14} color={COLORS.text} />
            <Text style={styles.statText}>{formatNumber(item.likes || 0)}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="chatbubble-outline" size={14} color={COLORS.text} />
            <Text style={styles.statText}>{formatNumber(0)}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="arrow-redo-outline" size={14} color={COLORS.text} />
            <Text style={styles.statText}>{formatNumber(item.shares || 0)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Icon name="videocam-outline" size={48} color="#D0BFA5" />
        </View>
        <Text style={styles.emptyTitle}>No Reels from this place yet</Text>
        <Text style={styles.emptyDesc}>
          {canCreateCreatorReel
            ? 'Be the first creator to share your experience.'
            : 'Post promotion reels from your vendor dashboard to appear on your business listing.'}
        </Text>
        {canCreateCreatorReel ? (
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateReel}>
            <Icon name="videocam" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.createBtnText}>Create a Reel</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderHeader()}
      
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        ListHeaderComponent={
          <>
            {renderPlaceBanner()}
            {renderFilters()}
            {!loading && renderListHeader()}
          </>
        }
        ListEmptyComponent={renderEmpty}
        renderItem={renderReelCard}
        showsVerticalScrollIndicator={false}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      )}

      {!loading && reels.length > 0 && canCreateCreatorReel ? (
        <TouchableOpacity 
          style={[styles.fab, { bottom: insets.bottom + 24 }]} 
          onPress={handleCreateReel}
          activeOpacity={0.9}
        >
          <Icon name="videocam" size={20} color="#FFF" />
          <Text style={styles.fabText}>Create Reel</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 56,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    padding: 8,
  },
  bannerWrap: {
    flexDirection: 'row',
    backgroundColor: '#F7F3EC',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  bannerImageWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerImagePlaceholder: {
    backgroundColor: '#E8DDD0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerInfo: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  bannerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bannerLocation: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 4,
    flex: 1,
  },
  bannerDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  filtersScroll: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chipBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  chipActive: {
    backgroundColor: COLORS.chipBgActive,
    borderColor: COLORS.chipBgActive,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.chipText,
  },
  chipTextActive: {
    color: COLORS.chipTextActive,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  listHeaderTitle: {
    fontSize: 18,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.text,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBF9F6',
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 4,
  },
  filterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBF9F6',
  },
  listContent: {
    paddingBottom: 24,
  },
  reelCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  reelThumbWrap: {
    width: 110,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 16,
    position: 'relative',
    backgroundColor: '#E8DDD0',
  },
  reelThumb: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  durationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  reelInfo: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#E8DDD0',
  },
  creatorAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#63300E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardMenuBtn: {
    padding: 4,
  },
  creatorHandle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 32,
    marginTop: -4,
    marginBottom: 10,
  },
  reelCaption: {
    fontSize: 14,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  reelLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reelLocationText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 4,
  },
  emptyWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F7F3EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#63300E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: '#63300E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(253,251,247,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A86C20',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: '#A86C20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
});
