import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { vendorsApi } from '../services/api/vendors';
import { useDataContext } from '../context/DataContext';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';
import { useVendorScreenInsets } from '../design/vendorLayout';

const GRID_GAP = 10;
const GRID_H_PAD = 16;
const gridCellWidth = (Dimensions.get('window').width - GRID_H_PAD * 2 - GRID_GAP) / 2;

function archiveStorageKey(vendorId: string) {
  return `vendor_reels_archived_${vendorId}`;
}

async function loadArchivedIds(vendorId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(archiveStorageKey(vendorId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

async function persistArchivedIds(vendorId: string, ids: Set<string>) {
  try {
    await AsyncStorage.setItem(archiveStorageKey(vendorId), JSON.stringify([...ids]));
  } catch {
    /* best-effort local persistence */
  }
}

const C = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  soft: '#F7F0E8',
  peach: '#F8E8D8',
  deep: '#3B1E12',
  muted: '#8B7355',
  mutedLight: '#A89880',
  border: '#EDE6DC',
  bronze: '#A67C52',
  green: '#16A34A',
  greenBg: '#E8F7EE',
};

type SortKey = 'latest' | 'oldest' | 'views' | 'likes';
type StatusTab = 'published' | 'drafts' | 'archived';

const SORT_LABELS: Record<SortKey, string> = {
  latest: 'Latest',
  oldest: 'Oldest',
  views: 'Most views',
  likes: 'Most likes',
};

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v));

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:30';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getReelStatus(reel: any, archivedIds: Set<string>): StatusTab {
  if (archivedIds.has(String(reel.id))) return 'archived';
  const status = String(reel.status || reel.moderationStatus || 'published').toLowerCase();
  if (status.includes('draft')) return 'drafts';
  if (reel.isActive === false) return 'drafts';
  return 'published';
}

function sortReels(items: any[], sort: SortKey) {
  const copy = [...items];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case 'views':
      return copy.sort((a, b) => (b.views || 0) - (a.views || 0));
    case 'likes':
      return copy.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    default:
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

interface VendorReelsManagementScreenProps {
  onBack: () => void;
  onCreateReel: () => void;
}

export default function VendorReelsManagementScreen({
  onBack,
  onCreateReel,
}: VendorReelsManagementScreenProps) {
  const { currentVendor } = useDataContext();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(insets.bottom + 120, 140);
  const vendorInsets = useVendorScreenInsets({ withTabBar: true });

  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('latest');
  const [tab, setTab] = useState<StatusTab>('published');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());

  const vendorId = currentVendor?.id;
  const locationLabel = [currentVendor?.city, currentVendor?.state].filter(Boolean).join(', ')
    || currentVendor?.address
    || 'Your location';

  const counts = useMemo(() => {
    const c = { published: 0, drafts: 0, archived: 0 };
    reels.forEach((r) => { c[getReelStatus(r, archivedIds)] += 1; });
    return c;
  }, [reels, archivedIds]);

  const filtered = useMemo(
    () => sortReels(reels.filter((r) => getReelStatus(r, archivedIds) === tab), sort),
    [reels, sort, tab, archivedIds],
  );

  useEffect(() => subscribeUnreadBadge(setUnreadCount), []);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
    }, []),
  );

  useEffect(() => {
    if (!vendorId) {
      setArchivedIds(new Set());
      return;
    }
    loadArchivedIds(vendorId).then(setArchivedIds);
  }, [vendorId]);

  const load = useCallback(async (refresh = false) => {
    if (!vendorId) { setLoading(false); return; }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await vendorsApi.getVendorReels(vendorId);
      const list = (res as any)?.data || res || [];
      setReels(Array.isArray(list) ? list : []);
      setError('');
    } catch {
      setReels([]);
      setError('Failed to load reels.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (reel: any) => {
    setSelected(reel);
    setEditTitle(reel.title || '');
    setEditDescription(reel.description || '');
  };

  const save = async () => {
    if (!selected) return;
    try {
      await vendorsApi.updateVendorReel(selected.id, {
        title: editTitle.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      setReels((prev) => prev.map((r) =>
        r.id === selected.id ? { ...r, title: editTitle.trim(), description: editDescription.trim() } : r
      ));
      setSelected(null);
    } catch {
      Alert.alert('Error', 'Could not update reel.');
    }
  };

  const updateArchivedIds = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      if (!vendorId) return;
      setArchivedIds((prev) => {
        const next = updater(prev);
        void persistArchivedIds(vendorId, next);
        return next;
      });
    },
    [vendorId],
  );

  const toggleArchive = useCallback(
    (reel: any) => {
      const id = String(reel.id);
      const isArchived = archivedIds.has(id);
      updateArchivedIds((prev) => {
        const next = new Set(prev);
        if (isArchived) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [archivedIds, updateArchivedIds],
  );

  const remove = (reel: any) =>
    Alert.alert('Delete reel?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await vendorsApi.deleteVendorReel(reel.id);
            setReels((prev) => prev.filter((r) => r.id !== reel.id));
            updateArchivedIds((prev) => {
              const next = new Set(prev);
              next.delete(String(reel.id));
              return next;
            });
          } catch {
            Alert.alert('Error', 'Could not delete reel.');
          }
        },
      },
    ]);

  const onReelMenu = (reel: any) => {
    const isArchived = archivedIds.has(String(reel.id));
    Alert.alert(reel.title || 'Vendor reel', 'Choose an action', [
      { text: 'Edit', onPress: () => openEdit(reel) },
      {
        text: isArchived ? 'Unarchive' : 'Archive',
        onPress: () => toggleArchive(reel),
      },
      { text: 'Delete', style: 'destructive', onPress: () => remove(reel) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openSortMenu = () => {
    Alert.alert('Sort reels', undefined, [
      ...(Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
        text: SORT_LABELS[key],
        onPress: () => setSort(key),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const sectionLabel =
    tab === 'published' ? 'All Published Reels'
      : tab === 'drafts' ? 'All Draft Reels'
        : 'All Archived Reels';

  const renderThumb = (item: any, size: 'list' | 'grid') => {
    const thumbUri = item.thumbnail || null;
    const thumbStyle = size === 'grid' ? styles.gridThumb : styles.thumb;
    const wrapStyle = size === 'grid' ? styles.gridThumbWrap : styles.thumbWrap;
    return (
      <View style={wrapStyle}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={thumbStyle} resizeMode="cover" />
        ) : (
          <View style={[thumbStyle, styles.thumbFallback]}>
            <Icon name="videocam" size={size === 'grid' ? 28 : 22} color={C.bronze} />
          </View>
        )}
        <View style={[styles.playBadge, size === 'grid' && styles.gridPlayBadge]}>
          {size === 'grid' ? (
            <View style={styles.gridPlayIcon}>
              <Icon name="play" size={14} color="#fff" />
            </View>
          ) : (
            <Icon name="play" size={10} color="#fff" />
          )}
        </View>
        {size === 'list' ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration || item.durationSeconds)}</Text>
          </View>
        ) : (
          <View style={styles.gridViewsBadge}>
            <Icon name="eye-outline" size={10} color="#fff" />
            <Text style={styles.gridViewsText}>{compact(item.views || 0)}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderListCard = ({ item }: { item: any }) => {
    const status = getReelStatus(item, archivedIds);
    const statusLabel = status === 'published' ? 'Published' : status === 'drafts' ? 'Draft' : 'Archived';
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => openEdit(item)}
        onLongPress={() => onReelMenu(item)}
      >
        <View style={styles.cardTop}>
          {renderThumb(item, 'list')}

          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title || item.description || 'Promotional reel'}
              </Text>
              <TouchableOpacity hitSlop={8} onPress={() => onReelMenu(item)}>
                <Icon name="ellipsis-vertical" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.metaRow}>
              <Icon name="location-sharp" size={11} color={C.muted} />
              <Text style={styles.metaText} numberOfLines={1}>{locationLabel}</Text>
            </View>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>

            <View style={styles.statusRow}>
              <View style={[
                styles.statusPill,
                status === 'published' ? styles.statusPublished
                  : status === 'drafts' ? styles.statusDraft
                    : styles.statusArchived,
              ]}>
                <Text style={[
                  styles.statusText,
                  status === 'published' ? { color: C.green }
                    : status === 'drafts' ? { color: C.bronze }
                      : { color: C.muted },
                ]}>
                  {statusLabel}
                </Text>
              </View>
            </View>

            {item.description ? (
              <Text style={styles.caption} numberOfLines={1}>{item.description}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Icon name="play-outline" size={13} color={C.muted} />
            <Text style={styles.statText}>{compact(item.views || 0)} Views</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="heart-outline" size={13} color={C.muted} />
            <Text style={styles.statText}>{compact(item.likes || 0)} Likes</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="chatbubble-outline" size={12} color={C.muted} />
            <Text style={styles.statText}>{compact(item.comments || item.commentCount || 0)} Comments</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="arrow-redo-outline" size={13} color={C.muted} />
            <Text style={styles.statText}>{compact(item.shares || 0)} Shares</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGridCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.gridCell}
      activeOpacity={0.9}
      onPress={() => openEdit(item)}
      onLongPress={() => onReelMenu(item)}
    >
      <View style={styles.gridCardInner}>
        {renderThumb(item, 'grid')}
        <TouchableOpacity
          style={styles.gridMenuBtn}
          hitSlop={8}
          onPress={() => onReelMenu(item)}
        >
          <Icon name="ellipsis-vertical" size={14} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.gridTitle} numberOfLines={2}>
        {item.title || item.description || 'Promotional reel'}
      </Text>
    </TouchableOpacity>
  );

  const listHeader = (
    <View>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-back" size={22} color={C.deep} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>My Reels</Text>
          <Text style={styles.subtitle}>Manage and track all your promotional reels</Text>
        </View>

        <TouchableOpacity style={styles.uploadBtn} onPress={onCreateReel} activeOpacity={0.88}>
          <Icon name="add" size={16} color="#fff" />
          <Text style={styles.uploadBtnText}>Upload Reel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {([
          { key: 'published' as const, label: 'Published', icon: 'play-circle', count: counts.published },
          { key: 'drafts' as const, label: 'Drafts', icon: 'document-text-outline', count: counts.drafts },
          { key: 'archived' as const, label: 'Archived', icon: 'archive-outline', count: counts.archived },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <Icon name={t.icon as any} size={14} color={active ? '#fff' : C.deep} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label} ({t.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.ctaBanner} activeOpacity={0.9} onPress={onCreateReel}>
        <View style={styles.ctaIcon}>
          <MaterialCommunityIcons name="bullhorn-outline" size={16} color={C.bronze} />
        </View>
        <Text style={styles.ctaText}>
          Engaging reels bring more customers! Keep sharing your food, offers, ambience & more.
        </Text>
        <Icon name="chevron-forward" size={16} color={C.muted} />
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sectionLabel}</Text>
        <View style={styles.sectionActions}>
          <TouchableOpacity style={styles.sortBtn} onPress={openSortMenu}>
            <Text style={styles.sortLabel}>Sort: {SORT_LABELS[sort]}</Text>
            <Icon name="chevron-down" size={13} color={C.bronze} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.viewToggle}
            onPress={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
          >
            <Icon name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={16} color={C.deep} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 16) }]}>
        <ActivityIndicator color={C.bronze} />
      </View>
    );
  }

  if (!vendorId) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 16) }]}>
        <Icon name="storefront-outline" size={48} color={C.muted} />
        <Text style={styles.emptyTitle}>No vendor profile</Text>
        <Text style={styles.emptyText}>Complete your vendor setup to create reels.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <FlatList
        key={viewMode}
        data={filtered}
        keyExtractor={(r) => r.id}
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        renderItem={viewMode === 'grid' ? renderGridCard : renderListCard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.bronze} />
        }
        contentContainerStyle={[styles.list, { paddingBottom: contentPadBottom }]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            {error ? (
              <>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Icon name="videocam-outline" size={40} color={C.bronze} />
                <Text style={styles.emptyTitle}>No {tab} reels yet</Text>
                <Text style={styles.emptyText}>
                  {tab === 'published'
                    ? 'Upload your first promotional reel to showcase your business.'
                    : tab === 'drafts'
                      ? 'Save reels as drafts while you finish editing them.'
                      : 'Archived reels will appear here when you archive them from your library.'}
                </Text>
                <TouchableOpacity style={styles.emptyCta} onPress={onCreateReel}>
                  <Text style={styles.emptyCtaText}>+ Upload Reel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit reel</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
              placeholderTextColor={C.muted}
              style={styles.input}
            />
            <TextInput
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Description"
              placeholderTextColor={C.muted}
              multiline
              style={[styles.input, styles.textarea]}
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save}>
                <Text style={styles.saveText}>Save changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { paddingHorizontal: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
    marginTop: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: { fontSize: 24, fontWeight: '800', color: C.deep, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '500' },
  notifBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E05252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.deep,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
  uploadBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.soft,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  tabActive: { backgroundColor: C.deep },
  tabText: { fontSize: 11, fontWeight: '700', color: C.deep },
  tabTextActive: { color: '#fff' },

  ctaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.peach,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  ctaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { flex: 1, fontSize: 12, color: C.deep, fontWeight: '600', lineHeight: 17 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.deep },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sortLabel: { fontSize: 12, fontWeight: '700', color: C.bronze },
  viewToggle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.soft,
  },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: C.deep, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  metaText: { flex: 1, fontSize: 11, color: C.muted, fontWeight: '500' },
  dateText: { fontSize: 11, color: C.mutedLight, marginTop: 2, fontWeight: '500' },
  statusRow: { marginTop: 6 },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPublished: { backgroundColor: C.greenBg },
  statusDraft: { backgroundColor: C.soft },
  statusArchived: { backgroundColor: '#F3F0EB' },
  statusText: { fontSize: 10, fontWeight: '800' },
  caption: { fontSize: 12, color: C.muted, marginTop: 6, fontWeight: '500' },

  statsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    backgroundColor: C.soft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 11, fontWeight: '600', color: C.muted },

  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridCell: { width: gridCellWidth, marginBottom: 4 },
  gridCardInner: { position: 'relative' },
  gridThumbWrap: {
    width: '100%',
    aspectRatio: 9 / 14,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.soft,
  },
  gridThumb: { width: '100%', height: '100%' },
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
  gridViewsText: { color: '#fff', fontSize: 10, fontWeight: '700' },
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

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.deep, marginTop: 10 },
  emptyText: { color: C.muted, textAlign: 'center', marginTop: 5, fontSize: 12, lineHeight: 17 },
  emptyCta: {
    marginTop: 16,
    backgroundColor: C.deep,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  errorText: { color: '#A84032', textAlign: 'center', fontSize: 12, marginBottom: 10 },
  retryBtn: { backgroundColor: C.bronze, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '800' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,24,16,.42)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: { backgroundColor: C.bg, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.deep, fontSize: 20, fontWeight: '800', marginBottom: 14 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    color: C.deep,
    marginBottom: 10,
  },
  textarea: { height: 100, textAlignVertical: 'top' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  cancel: { color: C.muted, fontWeight: '700' },
  save: {
    backgroundColor: C.bronze,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  saveText: { color: '#fff', fontWeight: '800' },
});
