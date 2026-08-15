import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext } from '../context/UserContext';
import CreatorStudioSidebar from '../components/CreatorStudioSidebar';
import { applyWalletPalPoints } from '../utils/syncPalPoints';
import { useCreatorDashboard, creatorDashboardKey } from '../features/creator/hooks/useCreatorDashboard';
import { useCreatorAnalytics } from '../features/creator/hooks/useCreatorAnalytics';
import { compactNumber } from '../features/creator/utils/format';
import { collaborationsApi, type CollaborationItem } from '../services/api/collaborations';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';
import {
  CreatorHeader,
  StatCard,
  QuickTool,
  MetricPill,
} from '../features/creator/components/DashboardWidgets';
import { CollaborationCard } from '../features/creator/components/CollaborationCard';
import { ReelUploadStatusCard } from '../features/creator/components/ReelUploadStatusCard';
import { creatorUploadManager, isUploadJobVisible, type ReelUploadJob } from '../services/creator/creatorUploadManager';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useWindowDimensions } from 'react-native';

const COLORS = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  textPrimary: '#202020',
  textSecondary: '#6F6F6F',
  gold: '#D9A441',
  border: '#ECE3D7',
};

type Period = '7d' | '30d' | '90d';

function unwrapCollabs(payload: unknown): CollaborationItem[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const p = payload as { data?: CollaborationItem[] };
  if (Array.isArray(p.data)) return p.data;
  return [];
}

function PerformanceChart({ data, height = 160 }: { data: number[]; height?: number }) {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = windowWidth - 64; // Padding
  const max = Math.max(...data, 1);
  const pad = { top: 20, bottom: 20 };
  const chartH = height - pad.top - pad.bottom;
  const step = chartWidth / Math.max(data.length - 1, 1);
  
  const points = data.map((v, i) => ({
    x: i * step,
    y: pad.top + chartH - (v / max) * chartH,
  }));
  
  // Smooth curve using bezier
  const linePath = points.reduce((path, p, i, a) => {
    if (i === 0) return `M ${p.x},${p.y}`;
    const prev = a[i - 1];
    const cp1x = prev.x + (p.x - prev.x) / 2;
    return `${path} C ${cp1x},${prev.y} ${cp1x},${p.y} ${p.x},${p.y}`;
  }, '');
  
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? 0},${pad.top + chartH} L 0,${pad.top + chartH} Z`;

  // Draw grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p, i) => {
    const y = pad.top + chartH - chartH * p;
    return (
      <Path key={i} d={`M 0,${y} L ${chartWidth},${y}`} stroke="#F1F1F1" strokeWidth={1} strokeDasharray="4,4" />
    );
  });

  return (
    <View style={{ width: chartWidth, height, alignSelf: 'center' }}>
      <Svg width={chartWidth} height={height}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.gold} stopOpacity="0.3" />
            <Stop offset="1" stopColor={COLORS.gold} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>
        {gridLines}
        <Path d={areaPath} fill="url(#areaGrad)" />
        <Path d={linePath} stroke={COLORS.gold} strokeWidth={2.5} fill="none" />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 3.5} fill={COLORS.gold} stroke="#fff" strokeWidth={2} />
        ))}
      </Svg>
    </View>
  );
}

export default function CreatorDashboardScreen() {
  const navigation = useNavigation<any>();
  const { user, setUser, setActiveMode, onLogout } = useUserContext();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(100);
  const queryClient = useQueryClient();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('30d');
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());
  const [uploadJobs, setUploadJobs] = useState<ReelUploadJob[]>([]);
  const [palPoints, setPalPoints] = useState(Number(user?.totalPoints) || 0);

  useEffect(() => {
    void creatorUploadManager.init();
    return creatorUploadManager.subscribe(setUploadJobs);
  }, []);

  const dashboardQuery = useCreatorDashboard();
  const analyticsQuery = useCreatorAnalytics(period);
  const refetchDashboard = dashboardQuery.refetch;
  const refetchAnalytics = analyticsQuery.refetch;

  useEffect(() => {
    setPalPoints(Number(user?.totalPoints) || 0);
  }, [user?.totalPoints]);

  const refreshPalPoints = useCallback(async () => {
    const pts = await applyWalletPalPoints(setUser);
    if (pts != null) setPalPoints(pts);
  }, [setUser]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
      const unsub = subscribeUnreadBadge(setUnreadCount);
      void refetchDashboard();
      void refetchAnalytics();
      void refreshPalPoints();
      return unsub;
    }, [refetchDashboard, refetchAnalytics, refreshPalPoints]),
  );

  useEffect(() => {
    if (sidebarOpen) void refreshPalPoints();
  }, [sidebarOpen, refreshPalPoints]);

  const { data: recentCollabs, refetch: refetchCollabs } = useQuery({
    queryKey: ['creator-dashboard-recent'],
    queryFn: async () => {
      // Fetch some active ones first, then completed if needed
      const active = await collaborationsApi.listCreator({ bucket: 'active', limit: '3' });
      const activeItems = unwrapCollabs(active.data);
      if (activeItems.length >= 2) return activeItems;
      const completed = await collaborationsApi.listCreator({ bucket: 'completed', limit: '3' });
      return [...activeItems, ...unwrapCollabs(completed.data)].slice(0, 3);
    },
  });

  const { data: collabCount } = useQuery({
    queryKey: ['creator-dashboard-collab-count'],
    queryFn: async () => {
      const res = await collaborationsApi.listCreator({ bucket: 'completed', limit: '50' });
      const items = unwrapCollabs(res.data);
      return items.length;
    },
  });

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: creatorDashboardKey });
    dashboardQuery.refetch();
    analyticsQuery.refetch();
    refetchCollabs();
  }, [queryClient, dashboardQuery, analyticsQuery, refetchCollabs]);

  const visibleUploadJobs = uploadJobs.filter((j) => isUploadJobVisible(j));

  const handleRetryUpload = useCallback((localUploadId: string) => {
    void creatorUploadManager.retryUpload(localUploadId);
  }, []);

  const handleDismissUpload = useCallback((localUploadId: string) => {
    void creatorUploadManager.clearFinished(localUploadId);
  }, []);

  const handleViewUploadedReel = useCallback((reelId: string) => {
    navigation.navigate('ReelDetail', { reelId });
  }, [navigation]);

  if (dashboardQuery.isLoading && !dashboardQuery.data) {
    return (
      <View style={[styles.center, { backgroundColor: COLORS.bg }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  const dashboard = dashboardQuery.data;
  if (!dashboard) {
    const loadError = dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : 'Could not load dashboard.';
    return (
      <View style={[styles.center, { backgroundColor: COLORS.bg }]}>
        <Text style={{ color: COLORS.textPrimary, textAlign: 'center', paddingHorizontal: 24 }}>
          {loadError || 'Could not load dashboard.'}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => dashboardQuery.refetch()}>
          <Text style={styles.retryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const o = dashboard.overview;
  const completedCollabsCount = collabCount ?? 0;
  const series = analyticsQuery.data?.dailySeries || [];
  const chartData = series.length ? series.map(d => d.views) : [0, 0, 0, 0, 0, 0, 0];
  const chartLabels = (() => {
    if (series.length < 2) return [] as string[];
    const fmt = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    };
    const picks = [0, Math.floor(series.length * 0.25), Math.floor(series.length * 0.5), Math.floor(series.length * 0.75), series.length - 1];
    return picks.map(i => fmt(series[i].date));
  })();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top, backgroundColor: COLORS.bg, zIndex: 10 }}>
        <CreatorHeader
          unreadCount={unreadCount}
          onOpenDrawer={() => setSidebarOpen(true)}
          onOpenNotifications={() => navigation.navigate('Notifications')}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={dashboardQuery.isRefetching} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        <View style={styles.heroSection}>
          <Text style={styles.heroSubtitle}>Create. Inspire. Earn.</Text>
        </View>

        {visibleUploadJobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uploading Reels</Text>
            {visibleUploadJobs.map((job) => (
              <ReelUploadStatusCard
                key={job.localUploadId}
                job={job}
                onRetry={handleRetryUpload}
                onDismiss={handleDismissUpload}
                onViewReel={handleViewUploadedReel}
              />
            ))}
          </View>
        )}

        {/* Performance Overview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Performance Overview</Text>
              <Icon name="information-circle-outline" size={16} color={COLORS.textSecondary} style={{ marginLeft: 6 }} />
            </View>
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation.navigate('CreatorAnalytics')}>
              <Text style={styles.viewAllText}>View All</Text>
              <Icon name="chevron-forward" size={14} color={COLORS.gold} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.filterRow}>
            {(['7d', '30d', '90d'] as Period[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.filterPill, period === p && styles.filterPillActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.filterText, period === p && styles.filterTextActive]}>
                  {p.replace('d', ' Days')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.chartWrap}>
            <PerformanceChart data={chartData} />
            <View style={styles.xLabels}>
              {(chartLabels.length ? chartLabels : ['', '', '', '', '']).map((label, i) => (
                <Text key={`${label}-${i}`} style={styles.xLabelText}>{label}</Text>
              ))}
            </View>
          </View>

          <View style={styles.metricsRow}>
            <MetricPill icon="play-outline" count={compactNumber(o.views)} label="Views" />
            <MetricPill icon="heart-outline" count={compactNumber(o.likes)} label="Likes" />
            <MetricPill icon="chatbubble-outline" count={compactNumber(o.comments)} label="Comments" />
            <MetricPill icon="arrow-redo-outline" count={compactNumber(o.shares)} label="Shares" />
            <MetricPill icon="bookmark-outline" count={compactNumber(o.saved)} label="Saves" />
          </View>
        </View>

        {/* Recent Collaborations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Collaborations</Text>
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation.navigate('Collaboration')}>
              <Text style={styles.viewAllText}>View All</Text>
              <Icon name="chevron-forward" size={14} color={COLORS.gold} />
            </TouchableOpacity>
          </View>

          {recentCollabs?.length ? (
            <View style={styles.collabList}>
              {recentCollabs.map((c, i) => {
                const statusMap: Record<string, any> = {
                  COMPLETED: 'Completed',
                  APPROVED: 'Approved',
                  IN_PROGRESS: 'In Progress',
                  REEL_UPLOADED: 'Pending',
                  PENDING: 'Pending',
                  REJECTED: 'Rejected',
                };
                return (
                  <CollaborationCard
                    key={c.id || i}
                    vendorName={c.businessName || c.vendor?.businessName || 'Local Vendor'}
                    vendorCategory={c.campaignCategory || 'Business'}
                    location={c.businessLocation || 'Unknown'}
                    status={statusMap[c.status] || 'Pending'}
                    dateStr={new Date(c.updatedAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    earningsStr="Collaboration Offer"
                    avatarUrl={c.vendor?.avatar || c.vendor?.imageUrl || undefined}
                    onViewDetails={() => navigation.navigate('CollaborationDetail', { collaborationId: c.id })}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No collaborations yet</Text>
              <Text style={styles.emptySub}>Start collaborating with travel businesses and earn rewards.</Text>
            </View>
          )}
        </View>


      </ScrollView>

      {/* Sidebar Overlay */}
      <CreatorStudioSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user!}
        creatorName={dashboard.profile.fullName || dashboard.profile.username || 'Creator'}
        creatorHandle={dashboard.profile.username || user?.creatorProfile?.username || ''}
        creatorAvatar={dashboard.profile.avatar || null}
        verified={dashboard.profile.verified}
        palPoints={palPoints}
        reelCount={o.reels}
        onNavigateReels={() => navigation.navigate('Reels')}
        onNavigateCreateReel={() => navigation.navigate('CreateReel')}
        onNavigateAnalytics={() => navigation.navigate('CreatorAnalytics')}
        onNavigateCollaborations={() => navigation.navigate('Collaboration')}
        onNavigateProfile={() => navigation.navigate('Profile')}
        onNavigateNotifications={() => navigation.navigate('Notifications')}
        onNavigateSettings={() => navigation.navigate('Settings')}
        onNavigateLegal={() => navigation.navigate('LegalDocument', { type: 'CREATOR_TERMS', title: 'Creator Terms & Conditions' })}
        onNavigateSubscription={() => navigation.navigate('CreatorSubscription')}
        onNavigateWallet={() => navigation.navigate('PalPointsScreen')}
        onSwitchToUser={() => {
          void setActiveMode('USER');
        }}
        onLogout={onLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 8,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  heroSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C58D33', // Adjusted gold for button
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#C58D33',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heroBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B6A3A',
    marginRight: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
  },
  filterPillActive: {
    backgroundColor: '#8B6A3A',
    borderColor: '#8B6A3A',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  chartWrap: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(236,227,215,0.4)',
    paddingVertical: 16,
    marginBottom: 16,
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    marginTop: 8,
  },
  xLabelText: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  collabList: {
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    padding: 10,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
