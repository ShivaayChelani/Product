import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { socialApi } from '../services/api';
import { extractCreatorHandle, creatorAtHandle } from '../utils/creatorHandle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

interface AdminReelsScreenProps {
  onBack: () => void;
}

interface AdminReel {
  id: string;
  title?: string;
  description?: string;
  videoUrl: string;
  thumbnail?: string;
  isFeatured: boolean;
  viewCount: number;
  createdAt: string;
  creator?: {
    id: string;
    username: string;
    fullName?: string;
    avatarUrl?: string;
  };
  place?: { id: string; name: string; city: string };
  _count?: { likes: number; comments: number };
}

export default function AdminReelsScreen({ onBack }: AdminReelsScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [reels, setReels] = useState<AdminReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [featuringId, setFeaturingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalReels, setTotalReels] = useState(0);
  const LIMIT = 30;

  const fetchReels = useCallback(async (pageNum = 1, q = '', reset = false) => {
    try {
      const res = await socialApi.getAdminReels({ page: pageNum, limit: LIMIT, q: q || undefined });
      const items: AdminReel[] = Array.isArray(res) ? res : res?.data || res?.items || [];
      const total = (res as any)?.pagination?.total ?? items.length;
      setTotalReels(total);
      if (reset || pageNum === 1) {
        setReels(items);
      } else {
        setReels(prev => [...prev, ...items]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load Moments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchReels(1, searchQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchReels]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchReels(1, searchQuery, true);
  }, [fetchReels, searchQuery]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setPage(1);
    setLoading(true);
    fetchReels(1, q, true);
  }, [fetchReels]);

  const handleLoadMore = () => {
    if (reels.length < totalReels) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchReels(nextPage, searchQuery, false);
    }
  };

  const handleDeleteReel = (reel: AdminReel) => {
    Alert.alert(
      'Delete Moment',
      `Delete "${reel.title || 'this Moment'}" by ${creatorAtHandle(reel.creator?.username, reel.creator?.fullName || 'unknown')}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(reel.id);
            try {
              await socialApi.adminDeleteReel(reel.id);
              setReels(prev => prev.filter(r => r.id !== reel.id));
              setTotalReels(prev => Math.max(0, prev - 1));
              Alert.alert('Deleted', 'Moment has been removed.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete Moment');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const handleToggleFeature = async (reel: AdminReel) => {
    setFeaturingId(reel.id);
    try {
      await socialApi.adminToggleFeatureReel(reel.id);
      setReels(prev =>
        prev.map(r => r.id === reel.id ? { ...r, isFeatured: !r.isFeatured } : r)
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to toggle feature');
    } finally {
      setFeaturingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>All Moments</Text>
          <Text style={styles.subtitle}>{totalReels} total Moments in database</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Icon name="search-outline" size={18} color="#68756D" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title, creator…"
          placeholderTextColor="#68756D"
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => handleSearch('')} hitSlop={8}>
            <Icon name="close-circle" size={18} color="#68756D" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FFFFFF']} />}
        onScrollEndDrag={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) {
            handleLoadMore();
          }
        }}
      >
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={styles.loaderText}>Loading Moments…</Text>
          </View>
        )}

        {!loading && reels.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="videocam-outline" size={56} color="#68756D" />
            <Text style={styles.emptyTitle}>No Moments found</Text>
            <Text style={styles.emptySub}>
              {searchQuery ? `No results for "${searchQuery}"` : 'No Moments have been uploaded yet.'}
            </Text>
          </View>
        ) : null}

        {reels.map((reel) => (
          <View key={reel.id} style={styles.reelCard}>
            {/* Thumbnail */}
            <View style={styles.thumbWrap}>
              {reel.thumbnail ? (
                <Image source={{ uri: reel.thumbnail }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Icon name="play-circle-outline" size={32} color="#68756D" />
                </View>
              )}
              {reel.isFeatured ? (
                <View style={styles.featuredBadge}>
                  <Icon name="star" size={11} color="#FFF" />
                  <Text style={styles.featuredText}>Featured</Text>
                </View>
              ) : null}
            </View>

            {/* Info */}
            <View style={styles.reelInfo}>
              <Text style={styles.reelTitle} numberOfLines={2}>
                {reel.title || 'Untitled Moment'}
              </Text>

              <View style={styles.creatorRow}>
                {reel.creator?.avatarUrl ? (
                  <Image source={{ uri: reel.creator.avatarUrl }} style={styles.avatarSmall} />
                ) : (
                  <View style={[styles.avatarSmall, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>
                      {(extractCreatorHandle(reel.creator?.username) || reel.creator?.fullName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.creatorName} numberOfLines={1}>
                  {creatorAtHandle(reel.creator?.username, reel.creator?.fullName || 'unknown')}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <Icon name="eye-outline" size={11} color="#68756D" />
                  <Text style={styles.statText}>{(reel.viewCount || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.statChip}>
                  <Icon name="heart-outline" size={11} color="#68756D" />
                  <Text style={styles.statText}>{(reel._count?.likes || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.statChip}>
                  <Icon name="chatbubble-outline" size={11} color="#68756D" />
                  <Text style={styles.statText}>{(reel._count?.comments || 0).toLocaleString('en-IN')}</Text>
                </View>
              </View>

              {reel.place ? (
                <Text style={styles.placeName} numberOfLines={1}>
                  📍 {reel.place.name}, {reel.place.city}
                </Text>
              ) : null}

              <Text style={styles.dateText}>{formatDate(reel.createdAt)}</Text>

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, reel.isFeatured ? styles.unfeaturedBtn : styles.featureBtn]}
                  onPress={() => handleToggleFeature(reel)}
                  disabled={featuringId === reel.id}
                >
                  {featuringId === reel.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Icon
                        name={reel.isFeatured ? 'star' : 'star-outline'}
                        size={13}
                        color="#FFF"
                      />
                      <Text style={styles.actionBtnText}>
                        {reel.isFeatured ? 'Unfeature' : 'Feature'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteReel(reel)}
                  disabled={deletingId === reel.id}
                >
                  {deletingId === reel.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Icon name="trash-outline" size={13} color="#FFF" />
                      <Text style={styles.actionBtnText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {reels.length > 0 && reels.length < totalReels ? (
          <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
            <Text style={styles.loadMoreText}>Load more ({totalReels - reels.length} remaining)</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  subtitle: { fontSize: 11, color: '#68756D', marginTop: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#D9E0DB',
  },
  content: { flex: 1, paddingHorizontal: 16 },
  loader: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loaderText: { color: '#68756D', fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { color: '#D9E0DB', fontSize: 16, fontWeight: '700' },
  emptySub: { color: '#68756D', fontSize: 13, textAlign: 'center', maxWidth: 260 },
  reelCard: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbWrap: { width: 100, position: 'relative' },
  thumb: { width: 100, height: '100%', minHeight: 130 },
  thumbFallback: { backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 4,
    backgroundColor: '#B7791F',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  featuredText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  reelInfo: { flex: 1, padding: 12, gap: 6 },
  reelTitle: { color: '#F7F6F1', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarSmall: { width: 20, height: 20, borderRadius: 10 },
  avatarFallback: { backgroundColor: '#68756D', justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#68756D', fontSize: 10, fontWeight: '800' },
  creatorName: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', flex: 1 },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: '#68756D', fontSize: 11 },
  placeName: { color: '#68756D', fontSize: 11 },
  dateText: { color: '#68756D', fontSize: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 72,
    justifyContent: 'center',
  },
  featureBtn: { backgroundColor: '#B7791F' },
  unfeaturedBtn: { backgroundColor: '#68756D' },
  deleteBtn: { backgroundColor: '#C94A4A' },
  actionBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#000000',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loadMoreText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
