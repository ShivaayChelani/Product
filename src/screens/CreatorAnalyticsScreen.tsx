import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useNavigation } from '@react-navigation/native';
import { socialApi } from '../services/api/social';
import type { CreatorAnalytics } from '../types';
import { CreatorUI, useCreatorScreenInsets } from '../features/creator/theme';

const C = CreatorUI.colors;

const PERIOD_LABELS: Record<'7d' | '30d' | 'all', string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  all: 'All time',
};

const compact = (v: number) =>
  v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v);

export default function CreatorAnalyticsScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const insets = useCreatorScreenInsets({ withTabBar: false });
  const safeAreaInsets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('7d');
  const [data, setData] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else if (navigation.canGoBack()) navigation.goBack();
  }, [onBack, navigation]);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setData((await socialApi.getCreatorAnalytics(period)).data);
      } catch (e: any) {
        setError(e?.message || 'Could not load analytics.');
        if (!refresh) setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period],
  );

  useEffect(() => {
    load();
  }, [load]);

  const showKpiDetail = (label: string, value: string, hint?: string) => {
    Alert.alert(label, `${value} in ${PERIOD_LABELS[period]}.${hint ? `\n\n${hint}` : ''}`);
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(safeAreaInsets.top, 16) }]}>
        <ActivityIndicator color={C.bronze} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(safeAreaInsets.top, 16) }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => load()}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const kpis = data?.kpis;

  return (
    <View style={[styles.safe, { paddingTop: Math.max(safeAreaInsets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <FlatList
        data={data?.topReels || []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, { paddingBottom: contentPadBottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.bronze} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                <Icon name="arrow-back" size={24} color={C.deep} />
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
                <Text style={styles.title}>Creator Analytics</Text>
                <Text style={styles.subtitle}>Track your performance and growth</Text>
              </View>
            </View>

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}

            <View style={styles.chips}>
              {(['7d', '30d', 'all'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, period === p && styles.chipActive]}
                  onPress={() => setPeriod(p)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, period === p && styles.chipTextActive]}>
                    {p === 'all' ? 'All time' : p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Chart Area Removed - showing empty state instead if real API has no daily data */}
            <View style={styles.chartEmptyCard}>
              <Icon name="bar-chart-outline" size={32} color={C.textMuted} />
              <Text style={styles.chartEmptyTitle}>Not enough data yet</Text>
              <Text style={styles.chartEmptySub}>Publish more Reels to see your performance insights.</Text>
            </View>

            <View style={styles.grid}>
              {[
                { l: 'Views', v: compact(kpis?.views || 0), i: 'eye-outline', bg: C.surface, hint: 'Total reel views across your content.' },
                { l: 'Likes', v: compact(kpis?.likes || 0), i: 'heart-outline', bg: C.surface, hint: 'Hearts received on your reels.' },
                { l: 'Comments', v: compact(kpis?.comments || 0), i: 'chatbubble-outline', bg: C.surface, hint: 'Comments left on your reels.' },
                { l: 'Saves', v: compact(kpis?.saves || 0), i: 'bookmark-outline', bg: C.surface, hint: 'Times travelers saved your reels.' },
              ].map((x) => (
                <TouchableOpacity
                  key={x.l}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => showKpiDetail(x.l, x.v, x.hint)}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.cardIcon}>
                      <Icon name={x.i} size={18} color={C.bronze} />
                    </View>
                    <Icon name="information-circle-outline" size={14} color={C.textMuted} />
                  </View>
                  <Text style={styles.value}>{x.v}</Text>
                  <Text style={styles.label}>{x.l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.engagement}
              activeOpacity={0.85}
              onPress={() =>
                showKpiDetail(
                  'Engagement rate',
                  `${kpis?.engagementRate || 0}%`,
                  'Likes, comments, and saves relative to views.',
                )
              }
            >
              <Text style={styles.engagementLabel}>Engagement rate</Text>
              <Text style={styles.engagementValue}>{kpis?.engagementRate || 0}%</Text>
            </TouchableOpacity>

            {data?.note ? <Text style={styles.note}>{data.note}</Text> : null}
            <Text style={styles.section}>Top Performing Reels</Text>
          </>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.reel}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ReelDetail', { reelId: item.id })}
          >
            <Text style={styles.rank}>#{index + 1}</Text>
            <View style={styles.play}>
              <Icon name="play" color="#fff" size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.reelTitleItem}>
                {item.title?.trim() || item.description?.trim() || 'Untitled reel'}
              </Text>
              <Text style={styles.meta}>
                {compact(item.views || 0)} views · {compact(item.likes || 0)} likes
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Icon name="videocam-outline" size={40} color={C.textMuted} />
            <Text style={styles.empty}>Publish reels to see your best performers.</Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => navigation.navigate('CreateReel')}
            >
              <Text style={styles.emptyCtaText}>Create a reel</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: { color: C.textSecondary, textAlign: 'center', marginBottom: 14, fontWeight: '600' },
  inlineError: { color: C.danger, fontSize: 12, fontWeight: '600', marginTop: 8 },
  retry: {
    backgroundColor: C.bronze,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: { color: '#fff', fontWeight: '800' },
  list: { paddingHorizontal: CreatorUI.space.screen, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  backBtn: {
    width: CreatorUI.headerBtnSize,
    height: CreatorUI.headerBtnSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '800', color: C.deep, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 4, fontWeight: '500' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 16 },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: CreatorUI.radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.deep, borderColor: C.deep },
  chipText: { fontWeight: '600', fontSize: 13, color: C.textSecondary },
  chipTextActive: { color: '#fff' },
  
  chartEmptyCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.deep,
    marginTop: 12,
    marginBottom: 4,
  },
  chartEmptySub: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '48%',
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF1E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 22, fontWeight: '800', color: C.deep, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '500', color: C.textSecondary, marginTop: 4 },
  engagement: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  engagementLabel: { color: C.deep, fontWeight: '700', fontSize: 16 },
  engagementValue: { color: C.bronze, fontWeight: '800', fontSize: 22 },
  note: { fontSize: 11, color: C.textMuted, lineHeight: 16, marginTop: 12 },
  section: { color: C.deep, fontWeight: '800', fontSize: 18, marginTop: 32, marginBottom: 16, marginLeft: 4 },
  reel: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  rank: { color: C.bronze, fontWeight: '800', width: 24, fontSize: 16, textAlign: 'center' },
  play: {
    height: 44,
    width: 44,
    borderRadius: 10,
    backgroundColor: C.deep,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reelTitleItem: { fontWeight: '700', color: C.deep, fontSize: 14, marginBottom: 4 },
  meta: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  empty: { color: C.textSecondary, textAlign: 'center', fontSize: 14 },
  emptyCta: {
    marginTop: 8,
    backgroundColor: C.deep,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
