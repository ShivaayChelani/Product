import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { creatorApi } from '../features/creator/api/creatorApi';
import { socialApi } from '../services/api/social';
import { getReelThumbnail } from '../services/reelService';
import { hasValidImageUrl } from '../utils/imageUrl';
import { useUserContext } from '../context/UserContext';
import type { Reel } from '../types';
import { useStudioTabScreenInsets } from '../design/tabBarLayout';
import { CreatorUI } from '../features/creator/theme';
import { CreatorReelMenuModal } from '../features/creator/components/CreatorReelMenuModal';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';
import { useBottomSafePadding } from '../design/responsive';

const C = CreatorUI.colors;
const GRID_GAP = 10;
const GRID_H_PAD = 20;
const gridCellWidth = (Dimensions.get('window').width - GRID_H_PAD * 2 - GRID_GAP) / 2;

type SortKey = 'latest' | 'oldest' | 'views' | 'likes';
type TabKey = 'APPROVED' | 'DRAFT' | 'ARCHIVED';

const SORT_LABELS: Record<SortKey, string> = {
  latest: 'Latest',
  oldest: 'Oldest',
  views: 'Most views',
  likes: 'Most likes',
};

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'APPROVED', label: 'Published', icon: 'play-circle-outline' },
  { key: 'DRAFT', label: 'Drafts', icon: 'document-text-outline' },
  { key: 'ARCHIVED', label: 'Archived', icon: 'archive-outline' },
];

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v));

type CreatorReelRow = Reel & { commentsCount?: number };

function archiveStorageKey(userId: string) {
  return `creator_reels_archived_${userId}`;
}

async function loadArchivedIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(archiveStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

async function persistArchivedIds(userId: string, ids: Set<string>) {
  try {
    await AsyncStorage.setItem(archiveStorageKey(userId), JSON.stringify([...ids]));
  } catch {
    /* best-effort local persistence */
  }
}

function unwrapMyReels(payload: unknown): CreatorReelRow[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as CreatorReelRow[];
  const page = payload as { items?: CreatorReelRow[]; data?: CreatorReelRow[] };
  if (Array.isArray(page.items)) return page.items;
  if (Array.isArray(page.data)) return page.data;
  return [];
}

function filterOwnReels(items: CreatorReelRow[], creatorProfileId?: string | null, userId?: string | null) {
  return items.filter(reel => {
    if (userId && reel.creator?.userId && reel.creator.userId !== userId) return false;
    if (
      creatorProfileId &&
      reel.creatorId &&
      reel.creatorId !== creatorProfileId &&
      reel.creator?.id &&
      reel.creator.id !== creatorProfileId
    ) {
      return false;
    }
    return true;
  });
}

function reelDisplayTitle(reel: Pick<Reel, 'title' | 'description'>): string {
  return reel.title?.trim() || reel.description?.trim() || 'Untitled reel';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getReelDuration(item: CreatorReelRow): string | null {
  const raw = (item as { duration?: number; durationSeconds?: number }).duration
    ?? (item as { duration?: number; durationSeconds?: number }).durationSeconds;
  return formatDuration(raw);
}

function getCreatorReelTab(reel: CreatorReelRow, archivedIds: Set<string>): TabKey {
  if (archivedIds.has(String(reel.id))) return 'ARCHIVED';
  const status = String(reel.status || 'APPROVED').toUpperCase();
  if (['DRAFT', 'HIDDEN'].includes(status)) return 'DRAFT';
  return 'APPROVED';
}

function sortReels(items: CreatorReelRow[], sort: SortKey): CreatorReelRow[] {
  const copy = [...items];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case 'views':
      return copy.sort((a, b) => b.views - a.views);
    case 'likes':
      return copy.sort((a, b) => b.likes - a.likes);
    default:
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export default function CreatorReelsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useUserContext();
  const studioInsets = useStudioTabScreenInsets();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(110);
  const creatorProfileId = user?.creatorProfile?.id;
  const userId = user?.uid;

  const initialTab: TabKey =
    route.params?.initialTab === 'DRAFT' || route.params?.initialTab === 'HIDDEN'
      ? 'DRAFT'
      : route.params?.initialTab === 'ARCHIVED'
        ? 'ARCHIVED'
        : 'APPROVED';

  const [reels, setReels] = useState<CreatorReelRow[]>([]);
  const [allReels, setAllReels] = useState<CreatorReelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuReel, setMenuReel] = useState<CreatorReelRow | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('latest');
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());

  useEffect(() => {
    if (route.params?.initialTab) {
      const t =
        route.params.initialTab === 'DRAFT' || route.params.initialTab === 'HIDDEN'
          ? 'DRAFT'
          : route.params.initialTab === 'ARCHIVED'
            ? 'ARCHIVED'
            : 'APPROVED';
      setActiveTab(t);
    }
  }, [route.params?.initialTab]);

  useEffect(() => subscribeUnreadBadge(setUnreadCount), []);


  useEffect(() => {
    if (!userId) {
      setArchivedIds(new Set());
      return;
    }
    loadArchivedIds(userId).then(setArchivedIds);
  }, [userId]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { APPROVED: 0, DRAFT: 0, ARCHIVED: 0 };
    allReels.forEach(r => {
      counts[getCreatorReelTab(r, archivedIds)] += 1;
    });
    return counts;
  }, [allReels, archivedIds]);

  const filtered = useMemo(() => {
    const byTab = reels.filter(r => getCreatorReelTab(r, archivedIds) === activeTab);
    return sortReels(byTab, sort);
  }, [reels, activeTab, sort, archivedIds]);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await creatorApi.listReels({ page: 1, limit: 50 });
        const items = filterOwnReels(unwrapMyReels(res.data), creatorProfileId, userId);
        setAllReels(items);
        setReels(items);
        setError('');
      } catch (e: any) {
        setReels([]);
        setAllReels([]);
        setError(e?.message || 'Could not load your reels.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [creatorProfileId, userId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const updateArchivedIds = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      if (!userId) return;
      setArchivedIds(prev => {
        const next = updater(prev);
        void persistArchivedIds(userId, next);
        return next;
      });
    },
    [userId],
  );

  const toggleArchive = useCallback(
    (reel: CreatorReelRow) => {
      const id = String(reel.id);
      updateArchivedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [updateArchivedIds],
  );

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
      load(true);
    }, [load]),
  );

  const openEdit = (reel: CreatorReelRow) => {
    navigation.navigate('CreateReel', { editReel: reel });
  };

  const remove = (reel: Reel) =>
    Alert.alert('Delete reel?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await creatorApi.deleteReel(reel.id);
            setReels(prev => prev.filter(r => r.id !== reel.id));
            setAllReels(prev => prev.filter(r => r.id !== reel.id));
            updateArchivedIds(prev => {
              const next = new Set(prev);
              next.delete(String(reel.id));
              return next;
            });
          } catch (e: any) {
            Alert.alert('Could not delete reel', e?.message || 'Please try again.');
          }
        },
      },
    ]);

  const onReelMenu = (reel: CreatorReelRow) => {
    setMenuReel(reel);
  };

  const openSortMenu = () => {
    Alert.alert('Sort reels', undefined, [
      ...(Object.keys(SORT_LABELS) as SortKey[]).map(key => ({
        text: SORT_LABELS[key],
        onPress: () => setSort(key),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const openReelDetail = (item: CreatorReelRow, index: number) => {
    navigation.navigate('ReelDetail', { reelId: item.id, reels: filtered, initialIndex: index });
  };

  const renderThumb = (item: CreatorReelRow, index: number, size: 'list' | 'grid') => {
    const thumbUri = getReelThumbnail(item, index);
    const durationLabel = getReelDuration(item);
    const thumbStyle = size === 'grid' ? styles.gridThumb : styles.reelThumb;
    const wrapStyle = size === 'grid' ? styles.gridThumbWrap : styles.reelThumbWrap;

    return (
      <View style={wrapStyle}>
        {hasValidImageUrl(thumbUri) ? (
          <Image source={{ uri: thumbUri }} style={thumbStyle} resizeMode="cover" />
        ) : (
          <View style={[thumbStyle, styles.thumbFallback]}>
            <Icon name="videocam-outline" size={size === 'grid' ? 28 : 24} color={C.textMuted} />
          </View>
        )}
        <View style={[styles.playBadge, size === 'grid' && styles.gridPlayBadge]}>
          {size === 'grid' ? (
            <View style={styles.gridPlayIcon}>
              <Icon name="play" size={14} color="#FFF" />
            </View>
          ) : (
            <Icon name="play" size={10} color="#FFF" />
          )}
        </View>
        {size === 'list' && durationLabel ? (
          <Text style={styles.duration}>{durationLabel}</Text>
        ) : null}
        {size === 'grid' ? (
          <View style={styles.gridViewsBadge}>
            <Icon name="eye-outline" size={10} color="#FFF" />
            <Text style={styles.gridViewsText}>{compact(item.views)}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderListCard = ({ item, index }: { item: CreatorReelRow; index: number }) => {
    const location = item.place?.name || item.vendor?.businessName || item.place?.city;
    const comments = item.commentsCount ?? 0;

    return (
      <TouchableOpacity
        style={styles.reelCard}
        activeOpacity={0.9}
        onPress={() => openReelDetail(item, index)}
      >
        <View style={styles.reelThumbWrap}>
          {hasValidImageUrl(getReelThumbnail(item, index)) ? (
            <Image source={{ uri: getReelThumbnail(item, index) }} style={styles.reelThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.reelThumb, styles.thumbFallback]}>
              <Icon name="videocam-outline" size={24} color={C.textMuted} />
            </View>
          )}
          <View style={styles.durationBadge}>
            <Icon name="play" size={10} color="#FFF" style={{ marginRight: 2 }} />
            <Text style={styles.durationText}>{getReelDuration(item) || 'Reel'}</Text>
          </View>
        </View>

        <View style={styles.reelInfo}>
          <View style={styles.creatorRow}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.creatorAvatar} />
            ) : (
              <View style={styles.creatorAvatarPlaceholder}>
                <Icon name="person" size={12} color="#FFF" />
              </View>
            )}
            <View style={styles.creatorNameWrap}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {(user as any)?.name || (user as any)?.username || 'Creator'}
              </Text>
              {(user as any)?.verified && (
                <Icon name="checkmark-circle" size={14} color="#F5B041" style={{ marginLeft: 4 }} />
              )}
            </View>
            <TouchableOpacity style={styles.cardMenuBtn} hitSlop={12} onPress={(e) => {
              e?.stopPropagation?.();
              onReelMenu(item);
            }}>
              <Icon name="ellipsis-vertical" size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.creatorHandle} numberOfLines={1}>
            @{(user as any)?.username?.toLowerCase().replace(/\s/g, '_') || 'creator'}
          </Text>

          <Text style={styles.reelCaption} numberOfLines={2}>
            {reelDisplayTitle(item)}
          </Text>

          {location ? (
            <View style={styles.reelLocationRow}>
              <Icon name="location-outline" size={12} color={C.textMuted} />
              <Text style={styles.reelLocationText} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : <View style={{ height: 12, marginBottom: 12 }} />}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Icon name="eye-outline" size={14} color={C.deep} />
              <Text style={styles.statText}>{compact(item.views)}</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="heart-outline" size={14} color={C.deep} />
              <Text style={styles.statText}>{compact(item.likes)}</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="chatbubble-outline" size={14} color={C.deep} />
              <Text style={styles.statText}>{compact(comments)}</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="arrow-redo-outline" size={14} color={C.deep} />
              <Text style={styles.statText}>{compact(item.shares || 0)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGridCard = ({ item, index }: { item: CreatorReelRow; index: number }) => (
    <TouchableOpacity
      style={styles.gridCell}
      activeOpacity={0.9}
      onPress={() => openReelDetail(item, index)}
    >
      <View style={styles.gridCardInner}>
        {renderThumb(item, index, 'grid')}
        <TouchableOpacity
          style={styles.gridMenuBtn}
          hitSlop={8}
          onPress={(e) => {
            e?.stopPropagation?.();
            onReelMenu(item);
          }}
        >
          <Icon name="ellipsis-vertical" size={14} color="#FFF" />
        </TouchableOpacity>
      </View>
      <Text style={styles.gridTitle} numberOfLines={2}>{reelDisplayTitle(item)}</Text>
    </TouchableOpacity>
  );

  const emptyMessage =
    activeTab === 'DRAFT'
      ? 'Save a reel as draft while editing.'
      : activeTab === 'ARCHIVED'
        ? 'Archived reels will appear here when you archive them from your library.'
        : 'Publish your first travel reel for your audience.';

  const emptyTitle =
    activeTab === 'DRAFT'
      ? 'No drafts yet'
      : activeTab === 'ARCHIVED'
        ? 'No archived reels'
        : 'Your story starts here';

  const listHeader = (
    <>
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>My Reels</Text>
          <Text style={styles.pageSub}>Manage and track all your reels.</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabChip, active && styles.tabChipActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Icon name={tab.icon as any} size={14} color={active ? '#FFF' : C.primary} />
              <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{tab.label}</Text>
              {count > 0 ? (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.tipBanner} onPress={() => navigation.navigate('CreateReel')}>
        <Icon name="bulb-outline" size={16} color={C.primary} />
        <Text style={styles.tipText}>Consistent creators grow 2.8x faster! Keep sharing your journey.</Text>
        <Icon name="chevron-forward" size={16} color={C.textMuted} />
      </TouchableOpacity>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {activeTab === 'APPROVED' ? 'All Published Reels' : activeTab === 'DRAFT' ? 'All Drafts' : 'Archived Reels'}
        </Text>
        <View style={styles.listControls}>
          <TouchableOpacity style={styles.sortBtn} onPress={openSortMenu}>
            <Icon name="funnel-outline" size={14} color={C.primary} />
            <Text style={styles.sortLabel}>Sort: {SORT_LABELS[sort]}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.viewToggle}
            onPress={() => setViewMode(v => (v === 'list' ? 'grid' : 'list'))}
          >
            <Icon name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={16} color={C.deep} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 16) }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <FlatList
        key={viewMode}
        data={filtered}
        keyExtractor={r => r.id}
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        renderItem={viewMode === 'grid' ? renderGridCard : renderListCard}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />}
        contentContainerStyle={[styles.list, { paddingBottom: contentPadBottom }]}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Icon name="videocam-outline" size={40} color={C.primary} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      <CreatorReelMenuModal
        visible={!!menuReel}
        reelTitle={menuReel ? reelDisplayTitle(menuReel) : undefined}
        reelStatus={menuReel ? getCreatorReelTab(menuReel, archivedIds) : undefined}
        onClose={() => setMenuReel(null)}
        onEdit={() => {
          if (menuReel) openEdit(menuReel);
          setMenuReel(null);
        }}
        onAnalytics={() => {
          setMenuReel(null);
          navigation.navigate('CreatorAnalytics');
        }}
        onArchiveToggle={() => {
          if (menuReel) toggleArchive(menuReel);
          setMenuReel(null);
        }}
        onDelete={() => {
          if (menuReel) remove(menuReel);
          setMenuReel(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: GRID_H_PAD },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 8, marginBottom: 14 },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.deep,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  pageSub: { fontSize: 13, color: C.textMuted, marginTop: 4 },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E05252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  notifBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  uploadBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  uploadBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabChipText: { fontSize: 12, fontWeight: '700', color: C.primary },
  tabChipTextActive: { color: '#FFF' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: C.primary },
  tabBadgeTextActive: { color: '#FFF' },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.soft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  tipText: { flex: 1, fontSize: 12, color: C.deep, lineHeight: 16 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  listTitle: { fontSize: 15, fontWeight: '800', color: C.deep },
  listControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  sortLabel: { fontSize: 11, fontWeight: '700', color: C.primary },
  viewToggle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  reelThumbWrap: {
    width: 100,
    height: 140,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F5EFE6',
    position: 'relative',
  },
  reelThumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5EFE6' },
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
    color: C.deep,
  },
  cardMenuBtn: {
    padding: 4,
  },
  creatorHandle: {
    fontSize: 11,
    color: C.textMuted,
    marginLeft: 32,
    marginTop: -4,
    marginBottom: 10,
  },
  reelCaption: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: C.deep,
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
    color: C.textMuted,
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
    color: C.deep,
    marginLeft: 4,
  },

  // Grid specific overrides (keeping grid styles intact but fixing references)
  playBadge: {
    position: 'absolute',
    left: 6,
    bottom: 22,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridPlayBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridPlayIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gridViewsBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  gridViewsText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridCell: { width: gridCellWidth, marginBottom: 4 },
  gridCardInner: { position: 'relative' },
  gridThumbWrap: {
    width: '100%',
    aspectRatio: 9 / 14,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5EFE6',
  },
  gridThumb: { width: '100%', height: '100%' },
  gridMenuBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: C.deep,
    lineHeight: 16,
  },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.deep, marginTop: 10 },
  emptyText: { color: C.textMuted, textAlign: 'center', marginTop: 5, fontSize: 12, lineHeight: 17 },
  emptyCta: { marginTop: 16, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  emptyCtaText: { color: '#FFF', fontWeight: '800' },
  errorBox: { alignItems: 'center', paddingVertical: 24 },
  errorText: { color: '#A84032', textAlign: 'center', fontSize: 12, marginBottom: 10 },
  retryBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(44,24,16,.42)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.bg, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.deep, fontSize: 20, fontWeight: '800', marginBottom: 14 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, color: C.deep, marginBottom: 10 },
  textarea: { height: 100, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, marginTop: 4 },
  cancel: { color: C.textMuted, fontWeight: '700' },
  save: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  saveText: { color: '#fff', fontWeight: '800' },
});
