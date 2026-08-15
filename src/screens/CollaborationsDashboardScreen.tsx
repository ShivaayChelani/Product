import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collaborationsApi, type CollaborationItem } from '../services/api/collaborations';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';
import { hasValidImageUrl } from '../utils/imageUrl';

type CreatorFilter = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed';
type SortOption = 'recent' | 'oldest' | 'reward_high' | 'reward_low';

const COLORS = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  textMain: '#1F1A17',
  textSub: '#5E544C',
  textMuted: '#A0968C',
  border: '#F0EBE1',
  primary: '#7B5E43',
  primarySoft: '#F5EDE2',
  accent: '#E5A041',
  success: '#10B981',
  successSoft: '#E8F5EE',
  pending: '#F59E0B',
  pendingSoft: '#FFF4E5',
  progress: '#3B82F6',
  progressSoft: '#E8F4E9', // Using soft green for progress in screenshot
  purple: '#8B5CF6',
  purpleSoft: '#F3E8FF',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
};

function unwrapCollabs(payload: unknown): CollaborationItem[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const p = payload as { data?: CollaborationItem[] };
  if (Array.isArray(p.data)) return p.data;
  return [];
}

export default function CollaborationsDashboardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useUserContext();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(100);

  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());
  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
      return subscribeUnreadBadge(setUnreadCount);
    }, [])
  );

  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('recent');

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['collaborations', 'creator', 'all'],
    queryFn: async () => {
      const res = await collaborationsApi.listCreator({ sortBy: 'createdAt', sortOrder: 'desc' });
      return unwrapCollabs(res.data ?? res);
    },
  });

  const items = data ?? [];

  const pendingCount = items.filter(i => i.status === 'PENDING').length;
  const activeCount = items.filter(i => ['IN_PROGRESS', 'REVISION_REQUESTED', 'REEL_UPLOADED', 'ACCEPTED'].includes(i.status)).length;
  const completedCount = items.filter(i => ['COMPLETED', 'APPROVED'].includes(i.status)).length;
  const totalCount = items.length;

  const filteredItems = useMemo(() => {
    let res = items;
    
    if (creatorFilter !== 'all') {
      res = res.filter(i => {
        if (creatorFilter === 'pending') return i.status === 'PENDING';
        if (creatorFilter === 'accepted') return i.status === 'ACCEPTED';
        if (creatorFilter === 'in_progress') return ['IN_PROGRESS', 'REVISION_REQUESTED', 'REEL_UPLOADED'].includes(i.status);
        if (creatorFilter === 'completed') return ['COMPLETED', 'APPROVED'].includes(i.status);
        return true;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter(i => 
        (i.businessName && i.businessName.toLowerCase().includes(q)) || 
        (i.campaignCategory && i.campaignCategory.toLowerCase().includes(q)) ||
        (i.businessLocation && i.businessLocation.toLowerCase().includes(q)) ||
        (i.campaignTitle && i.campaignTitle.toLowerCase().includes(q))
      );
    }
    
    res = res.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (sortOption === 'recent') return dateB - dateA;
      if (sortOption === 'oldest') return dateA - dateB;
      if (sortOption === 'reward_high') return (b.budgetPaise || 0) - (a.budgetPaise || 0);
      if (sortOption === 'reward_low') return (a.budgetPaise || 0) - (b.budgetPaise || 0);
      return 0;
    });
    
    return res;
  }, [items, creatorFilter, searchQuery, sortOption]);

  const toggleSort = () => {
    setSortOption(prev => prev === 'recent' ? 'oldest' : 'recent');
  };

  const getStatusDisplay = (status: string) => {
    switch(status) {
      case 'PENDING': return { text: 'New Request', color: '#D97706', bg: '#FEF3C7' }; // Amber
      case 'ACCEPTED': return { text: 'Accepted', color: '#2563EB', bg: '#DBEAFE' }; // Blue
      case 'IN_PROGRESS': 
      case 'REEL_UPLOADED':
      case 'REVISION_REQUESTED': return { text: 'In Progress', color: '#059669', bg: '#D1FAE5' }; // Green
      case 'COMPLETED': 
      case 'APPROVED': return { text: 'Completed', color: '#7C3AED', bg: '#EDE9FE' }; // Purple
      case 'REJECTED': 
      case 'CANCELLED': return { text: 'Cancelled', color: '#DC2626', bg: '#FEE2E2' }; // Red
      default: return { text: status, color: COLORS.textSub, bg: COLORS.border };
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown date';
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.abs(now.getTime() - d.getTime()) / 36e5;
    
    if (diffHours < 24) {
      return `Requested ${Math.max(1, Math.floor(diffHours))}h ago`;
    } else if (diffHours < 168) {
      return `Requested ${Math.floor(diffHours / 24)} days ago`;
    }
    return `Requested on ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  const renderCard = useCallback(({ item }: { item: CollaborationItem }) => {
    const disp = getStatusDisplay(item.status);
    const isNew = item.status === 'PENDING';
    const pp = item.budgetPaise ? Math.floor(item.budgetPaise / 10) : (item.budgetFormatted ? parseInt(item.budgetFormatted.replace(/\D/g, ''), 10) * 10 : 1000);
    const ppFormatted = pp.toLocaleString();

    return (
      <TouchableOpacity 
        style={styles.collabCard} 
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CollaborationDetail', { collaborationId: item.id })}
      >
        <View style={styles.cardLeft}>
          <View style={styles.imageWrap}>
            {hasValidImageUrl(item.vendor?.avatar) ? (
              <Image source={{ uri: item.vendor!.avatar }} style={styles.cardImage} />
            ) : (
              <View style={[styles.cardImage, styles.cardImageFallback]}>
                <Text style={styles.cardImageInitial}>{item.businessName?.charAt(0) || 'B'}</Text>
              </View>
            )}
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardMiddle}>
          <Text style={styles.businessName} numberOfLines={1}>{item.businessName || 'Business'}</Text>
          <Text style={styles.businessCategory} numberOfLines={1}>
            {(item.campaignCategory || 'Business')} • {item.businessLocation || 'Location'}
          </Text>
          <View style={styles.dateRow}>
            <Icon name="calendar-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.statusBadge, { backgroundColor: disp.bg }]}>
            <Text style={[styles.statusBadgeText, { color: disp.color }]}>{disp.text}</Text>
          </View>
          <View style={styles.rewardContainer}>
            <Text style={styles.rewardAmount}>{ppFormatted}</Text>
            <Text style={styles.rewardLabel}>PalPoints</Text>
          </View>
        </View>
        
        <View style={styles.chevronWrap}>
          <Icon name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  const listHeader = (
    <View style={styles.headerContainer}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.pageTitle}>Collaborations</Text>
          <Text style={styles.pageSub}>Work with local businesses & earn from your content.</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
          <Icon name="notifications-outline" size={20} color={COLORS.textMain} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryScroll}>
        <View style={styles.summaryCard}>
          <View style={[styles.summaryIconWrap, { backgroundColor: COLORS.pendingSoft }]}>
            <Icon name="mail-outline" size={18} color={COLORS.pending} />
          </View>
          <Text style={styles.summaryLabel}>New Requests</Text>
          <Text style={styles.summaryCount}>{pendingCount}</Text>
          <View style={styles.summaryDotRow}>
            <View style={[styles.summaryDot, { backgroundColor: COLORS.accent }]} />
            <Text style={styles.summaryDotText}>New</Text>
          </View>
        </View>
        
        <View style={styles.summaryCard}>
          <View style={[styles.summaryIconWrap, { backgroundColor: COLORS.primarySoft }]}>
            <Icon name="play-outline" size={18} color={COLORS.primary} />
          </View>
          <Text style={styles.summaryLabel}>Active</Text>
          <Text style={styles.summaryCount}>{activeCount}</Text>
          <View style={styles.summaryDotRow}>
            <View style={[styles.summaryDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.summaryDotText}>Ongoing</Text>
          </View>
        </View>
        
        <View style={styles.summaryCard}>
          <View style={[styles.summaryIconWrap, { backgroundColor: COLORS.successSoft }]}>
            <Icon name="checkmark-circle-outline" size={18} color={COLORS.success} />
          </View>
          <Text style={styles.summaryLabel}>Completed</Text>
          <Text style={styles.summaryCount}>{completedCount}</Text>
          <View style={styles.summaryDotRow}>
            <View style={[styles.summaryDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.summaryDotText}>Finished</Text>
          </View>
        </View>
        
        <View style={styles.summaryCard}>
          <View style={[styles.summaryIconWrap, { backgroundColor: '#F3F4F6' }]}>
            <Icon name="list-outline" size={18} color="#4B5563" />
          </View>
          <Text style={styles.summaryLabel}>All Collabs</Text>
          <Text style={styles.summaryCount}>{totalCount}</Text>
          <View style={styles.summaryDotRow}>
            <View style={[styles.summaryDot, { backgroundColor: '#9CA3AF' }]} />
            <Text style={styles.summaryDotText}>Total</Text>
          </View>
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {(['all', 'pending', 'accepted', 'in_progress', 'completed'] as CreatorFilter[]).map(filter => {
          const isActive = creatorFilter === filter;
          const labels: Record<string, string> = {
            all: 'All', pending: 'Pending', accepted: 'Accepted', in_progress: 'In Progress', completed: 'Completed'
          };
          return (
            <TouchableOpacity 
              key={filter}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setCreatorFilter(filter)}
            >
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {labels[filter]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Icon name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search collaborations..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity style={styles.filterBtn}>
          <Icon name="options-outline" size={20} color={COLORS.textMain} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.sortBtn} onPress={toggleSort}>
        <Text style={styles.sortText}>Sort by: <Text style={styles.sortTextBold}>{sortOption === 'recent' ? 'Recent' : 'Oldest'}</Text></Text>
        <Icon name="chevron-down" size={14} color={COLORS.textMain} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );

  const emptyState = (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIllustration}>
        <Icon name="briefcase-outline" size={48} color={COLORS.primary} />
      </View>
      <View style={styles.emptyContent}>
        <Text style={styles.emptyTitle}>No more collaborations</Text>
        <Text style={styles.emptySub}>You're all caught up! New opportunities will appear here.</Text>
      </View>
      <TouchableOpacity style={styles.exploreBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Map' })}>
        <Text style={styles.exploreBtnText}>Explore Businesses</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 8) }]}>
      {isLoading && !items.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          renderItem={renderCard}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyState}
          contentContainerStyle={{ paddingBottom: contentPadBottom, paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerContainer: {
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    marginTop: 8,
  },
  titleWrap: {
    flex: 1,
    paddingRight: 16,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  pageSub: {
    fontSize: 14,
    color: COLORS.textSub,
    lineHeight: 20,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    borderWidth: 1,
    borderColor: COLORS.card,
  },
  summaryScroll: {
    gap: 12,
    paddingBottom: 20,
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    width: 110,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSub,
    marginBottom: 8,
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  summaryDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryDotText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  filterScroll: {
    gap: 8,
    marginBottom: 20,
  },
  filterPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  filterPillTextActive: {
    color: COLORS.card,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textMain,
    height: '100%',
  },
  filterBtn: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  sortText: {
    fontSize: 13,
    color: COLORS.textSub,
  },
  sortTextBold: {
    fontWeight: '700',
    color: COLORS.textMain,
  },
  collabCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  cardLeft: {
    marginRight: 14,
  },
  imageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  cardImageFallback: {
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  newBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.card,
  },
  cardMiddle: {
    flex: 1,
    justifyContent: 'center',
  },
  businessName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  businessCategory: {
    fontSize: 12,
    color: COLORS.textSub,
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rewardContainer: {
    alignItems: 'flex-end',
  },
  rewardAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  rewardLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  chevronWrap: {
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 12,
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  emptyIllustration: {
    width: 80,
    height: 80,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContent: {
    flex: 1,
    minWidth: 150,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSub,
    lineHeight: 18,
    marginBottom: 12,
  },
  exploreBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  exploreBtnText: {
    color: COLORS.card,
    fontSize: 13,
    fontWeight: '700',
  },
});
