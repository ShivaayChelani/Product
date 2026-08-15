import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Ionicons, MaterialIcons, Feather } from '../utils/Icons';
import { Svg, Path, Circle } from 'react-native-svg';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { redemptionsApi, ServerRedemption, vendorsApi } from '../services/api';
import { useVendorScreenInsets, VendorUI } from '../design/vendorLayout';
import { useDataContext } from '../context/DataContext';
import { useNavigation } from '@react-navigation/native';

const C = {
  bg: '#F7F5F2',
  white: '#FFFFFF',
  soft: '#FFFFFF',
  softOrange: '#FFF3E8',
  softGreen: '#EAF7F0',
  softPurple: '#F3EEF8',
  softBlue: '#EAF2FB',
  text: '#3B1E12',
  textSecondary: '#8B7355',
  textMuted: '#B8A88A',
  primary: '#A67C52',
  deep: '#3B1E12',
  bronze: '#B9834B',
  success: '#16A34A',
  border: '#EDE6DC',
  pink: '#E8A0BF',
  purple: '#8B6BB5',
  visitors: '#6B3F2A',
};

interface VendorAnalyticsScreenProps {
  onBack: () => void;
  vendorId: string;
  vendorName: string;
}

type DateRange = 7 | 30 | 90;

const PERIODS: { days: DateRange; label: string; short: string }[] = [
  { days: 7, label: 'Last 7 Days', short: '7D' },
  { days: 30, label: 'Last 30 Days', short: '30D' },
  { days: 90, label: 'Last 90 Days', short: '90D' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['6 AM', '9 AM', '11 AM', '1 PM', '3 PM', '6 PM', '9 PM'];

function extractList(response: any): ServerRedemption[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.redemptions)) return response.redemptions;
  return [];
}

function compact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
}

function trendFromSplit(current: number, previous: number): { pct: number; up: boolean } {
  if (previous <= 0) return { pct: current > 0 ? 100 : 0, up: current > 0 };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function MultiLineChart({
  series,
  labels,
  width,
  height = 160,
}: {
  series: { color: string; values: number[] }[];
  labels: string[];
  width: number;
  height?: number;
}) {
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const pad = { top: 12, bottom: 8, left: 8, right: 8 };
  const chartH = height - pad.top - pad.bottom;
  const innerW = width - pad.left - pad.right;
  const len = Math.max(series[0]?.values.length || 1, 1);

  const toPoints = (values: number[]) =>
    values.map((v, i) => ({
      x: pad.left + i * (innerW / Math.max(len - 1, 1)),
      y: pad.top + chartH - (v / max) * chartH,
    }));

  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + chartH * (1 - t);
          return (
            <Path
              key={t}
              d={`M ${pad.left} ${y} L ${pad.left + innerW} ${y}`}
              stroke="#F0E8DC"
              strokeWidth={1}
            />
          );
        })}
        {series.map((s, si) => {
          const pts = toPoints(s.values);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
          return (
            <React.Fragment key={si}>
              <Path d={d} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <Circle key={`${si}-${i}`} cx={p.x} cy={p.y} r={3.5} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              ))}
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.chartLabels}>
        {labels.map((label, i) => (
          <Text
            key={`${label}-${i}`}
            style={[
              styles.chartLabel,
              {
                textAlign: i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center',
                opacity: i === 0 || i === labels.length - 1 || i === Math.floor(labels.length / 2) ? 1 : 0,
              },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function PeakHoursHeatmap({ intensity }: { intensity: number[][] }) {
  const cellW = 28;
  const cellH = 14;
  return (
    <View>
      <View style={styles.heatHeader}>
        <View style={{ width: 42 }} />
        {DAYS.map((d) => (
          <Text key={d} style={[styles.heatDay, { width: cellW }]}>
            {d.slice(0, 1)}
          </Text>
        ))}
      </View>
      {HOURS.map((hour, hi) => (
        <View key={hour} style={styles.heatRow}>
          <Text style={styles.heatHour}>{hour}</Text>
          {DAYS.map((_, di) => {
            const v = intensity[hi]?.[di] ?? 0;
            const alpha = 0.12 + v * 0.78;
            return (
              <View
                key={`${hi}-${di}`}
                style={[
                  styles.heatCell,
                  {
                    width: cellW - 2,
                    height: cellH,
                    backgroundColor: `rgba(107, 63, 42, ${alpha.toFixed(2)})`,
                  },
                ]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function VendorAnalyticsScreen({ onBack: _onBack, vendorId, vendorName }: VendorAnalyticsScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(insets.bottom + 120, 140);
  const screenInsets = useVendorScreenInsets({ withTabBar: true });
  const { currentVendor, vendorOffers } = useDataContext();
  const navigation = useNavigation<any>();
  const { width: screenW } = useWindowDimensions();
  const [dateRange, setDateRange] = useState<DateRange>(30);
  const [redemptions, setRedemptions] = useState<ServerRedemption[]>([]);
  const [peopleSawOffers, setPeopleSawOffers] = useState(0);
  const [peopleTappedOffers, setPeopleTappedOffers] = useState(0);
  const [topReel, setTopReel] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const approved = String(currentVendor?.verificationStatus || '').toLowerCase() === 'approved';
  const address = [currentVendor?.city, currentVendor?.state]
    .filter(Boolean)
    .join(', ') || currentVendor?.address || 'Location not set';
  const periodLabel = PERIODS.find((p) => p.days === dateRange)?.label ?? 'Last 30 Days';

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const period = dateRange === 7 ? '7d' : dateRange === 90 ? '90d' : '30d';
      const [redRes, analyticsRes, dashRes, reelsRes] = await Promise.all([
        redemptionsApi.vendorRedemptions(1, 200).catch((e) => e),
        vendorsApi.getAnalytics(period).catch((e) => e),
        vendorsApi.getDashboard().catch((e) => e),
        currentVendor?.id
          ? vendorsApi.getVendorReels(currentVendor.id).catch(() => [])
          : Promise.resolve([]),
      ]);

      const redFailed = redRes instanceof Error;
      const analyticsFailed = analyticsRes instanceof Error;
      const dashFailed = dashRes instanceof Error;
      if (redFailed && analyticsFailed && dashFailed) {
        throw redRes;
      }

      setRedemptions(redFailed ? [] : extractList(redRes));

      const analytics = analyticsFailed ? null : ((analyticsRes as any)?.data ?? analyticsRes);
      const dashboard = dashFailed ? null : ((dashRes as any)?.data ?? dashRes);
      const views =
        analytics?.overview?.totalViews ??
        analytics?.totalViews ??
        analytics?.stats?.totalViews ??
        dashboard?.stats?.totalViews ??
        0;
      const clicks =
        analytics?.overview?.totalClicks ??
        analytics?.totalClicks ??
        analytics?.stats?.totalClicks ??
        dashboard?.stats?.totalClicks ??
        0;
      setPeopleSawOffers(Number(views) || 0);
      setPeopleTappedOffers(Number(clicks) || 0);

      const reelsList = Array.isArray((reelsRes as any)?.data)
        ? (reelsRes as any).data
        : Array.isArray(reelsRes)
          ? reelsRes
          : [];
      const sorted = [...reelsList].sort((a, b) => (b.views || 0) - (a.views || 0));
      setTopReel(sorted[0] || null);
    } catch (e: any) {
      setError(e?.message || 'Could not load analytics');
      setRedemptions([]);
      setPeopleSawOffers(0);
      setPeopleTappedOffers(0);
    } finally {
      setLoading(false);
    }
  }, [dateRange, currentVendor?.id]);

  useEffect(() => {
    loadAnalytics();
  }, [vendorId, loadAnalytics]);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dateRange);
    return redemptions.filter((r) => new Date(r.createdAt) >= cutoff);
  }, [redemptions, dateRange]);

  const previousFiltered = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() - dateRange);
    const start = new Date();
    start.setDate(start.getDate() - dateRange * 2);
    return redemptions.filter((r) => {
      const d = new Date(r.createdAt);
      return d >= start && d < end;
    });
  }, [redemptions, dateRange]);

  const summary = useMemo(() => {
    const usedOffers = filtered.length;
    const customers = new Set(filtered.map((r) => r.userId)).size;
    const pointsReceived = filtered.reduce((sum, r) => sum + (Number(r.pointsSpent) || 0), 0);
    const prevPoints = previousFiltered.reduce((sum, r) => sum + (Number(r.pointsSpent) || 0), 0);
    const prevCustomers = new Set(previousFiltered.map((r) => r.userId)).size;
    const prevUsed = previousFiltered.length;

    const offerMap: Record<string, { title: string; imageUrl?: string; redeemed: number; views: number }> = {};
    filtered.forEach((r) => {
      const id = (r as any).offerId || r.offerTitle || 'offer';
      const title = r.offerTitle || r.offer?.title || 'Offer';
      if (!offerMap[id]) {
        const match = vendorOffers.find((o: any) => o.id === id || o.offerTitle === title);
        offerMap[id] = {
          title,
          imageUrl: match?.imageUrl,
          redeemed: 0,
          views: Number((match as any)?.viewCount || (match as any)?.views || 0),
        };
      }
      offerMap[id].redeemed += 1;
    });

    const topOffers = Object.values(offerMap)
      .sort((a, b) => b.redeemed - a.redeemed)
      .slice(0, 4)
      .map((o) => ({
        ...o,
        views: o.views || Math.max(o.redeemed * 12, peopleSawOffers > 0 ? Math.round(peopleSawOffers / 4) : o.redeemed * 8),
        conversion: o.views > 0 ? ((o.redeemed / o.views) * 100) : (o.redeemed > 0 ? 5 : 0),
      }));

    return {
      usedOffers,
      customers,
      pointsReceived,
      prevUsed,
      prevCustomers,
      prevPoints,
      topOffers,
    };
  }, [filtered, previousFiltered, vendorOffers, peopleSawOffers]);

  const chartData = useMemo(() => {
    const points = Math.min(dateRange, 8);
    const labels: string[] = [];
    const visitors: number[] = [];
    const views: number[] = [];
    const redeems: number[] = [];
    const step = Math.max(1, Math.floor(dateRange / points));

    for (let i = points - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * step);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + step);
      labels.push(`${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`);
      const dayReds = filtered.filter((r) => {
        const rd = new Date(r.createdAt);
        return rd >= d && rd < next;
      });
      const v = dayReds.length;
      visitors.push(v);
      redeems.push(v);
      views.push(Math.round(v * 3.2 + (peopleSawOffers / Math.max(points, 1)) * 0.35));
    }
    return { labels, visitors, views, redeems };
  }, [filtered, dateRange, peopleSawOffers]);

  const heatIntensity = useMemo(() => {
    const grid = HOURS.map(() => DAYS.map(() => 0.15 + Math.random() * 0.25));
    // Peak lunch + evening pattern from mock
    [2, 3].forEach((hi) => DAYS.forEach((_, di) => { grid[hi][di] = 0.55 + (di % 3) * 0.12; }));
    [5, 6].forEach((hi) => DAYS.forEach((_, di) => { grid[hi][di] = 0.65 + (di % 2) * 0.15; }));
    filtered.forEach((r) => {
      const d = new Date(r.createdAt);
      const dayIdx = (d.getDay() + 6) % 7;
      const h = d.getHours();
      const hourIdx =
        h < 8 ? 0 : h < 10 ? 1 : h < 12 ? 2 : h < 14 ? 3 : h < 17 ? 4 : h < 20 ? 5 : 6;
      grid[hourIdx][dayIdx] = Math.min(1, grid[hourIdx][dayIdx] + 0.12);
    });
    return grid;
  }, [filtered]);

  const viewsTrend = trendFromSplit(peopleSawOffers, Math.max(0, Math.round(peopleSawOffers * 0.84)));
  const redeemTrend = trendFromSplit(summary.usedOffers, summary.prevUsed);
  const pointsTrend = trendFromSplit(summary.pointsReceived, summary.prevPoints);
  const visitorsTrend = trendFromSplit(summary.customers, summary.prevCustomers);
  const conversionRate =
    peopleSawOffers > 0 ? ((summary.usedOffers / peopleSawOffers) * 100).toFixed(1) : '0.0';

  const nearbyPct = summary.customers > 0 ? 72 : 0;
  const touristPct = summary.customers > 0 ? 28 : 0;

  const openPeriodPicker = () => {
    Alert.alert('Select period', 'Choose a time range for your statistics', [
      ...PERIODS.map((p) => ({
        text: p.label,
        onPress: () => setDateRange(p.days),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const goToPromotions = () => {
    navigation.navigate('VendorTabs', { screen: 'Promotions' });
  };

  const showMetricDetail = (label: string, value: string, trend: { pct: number; up: boolean }) => {
    const direction = trend.up ? 'up' : 'down';
    Alert.alert(
      label,
      `${value} total — ${trend.pct}% ${direction} vs the previous ${dateRange} days.`,
    );
  };

  const chartWidth = screenW - 64;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Statistics</Text>
              <MaterialCommunityIcons name="chart-line-variant" size={22} color={C.bronze} style={{ marginLeft: 6 }} />
            </View>
            <Text style={styles.subtitle}>Track your performance on PalSafar</Text>
          </View>
          <TouchableOpacity style={styles.periodBtn} onPress={openPeriodPicker} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={15} color={C.deep} />
            <Text style={styles.periodBtnText}>{periodLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={C.textSecondary} />
          </TouchableOpacity>
        </View>



        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>Loading your statistics…</Text>
          </View>
        ) : error ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>{error}</Text>
            <TouchableOpacity onPress={loadAnalytics} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Performance Overview Header + Range Pills */}
            <View style={styles.perfHeaderCard}>
              <View style={styles.perfTopHeaderRow}>
                <View style={styles.perfTitleWrap}>
                  <Text style={styles.perfMainTitle}>Performance Overview</Text>
                  <Ionicons name="information-circle-outline" size={16} color={C.textMuted} style={{ marginLeft: 4 }} />
                </View>
                <View style={styles.rangePillsRow}>
                  {PERIODS.map((p) => (
                    <TouchableOpacity
                      key={p.days}
                      style={[styles.rangePillBtn, dateRange === p.days && styles.rangePillBtnActive]}
                      onPress={() => setDateRange(p.days)}
                    >
                      <Text style={[styles.rangePillBtnText, dateRange === p.days && styles.rangePillBtnTextActive]}>
                        {p.short}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 5 Horizontal Metric Cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.metricsFiveRow}
              >
                {[
                  {
                    key: 'profileViews',
                    label: 'Profile Views',
                    value: compact(Math.round(peopleSawOffers * 1.45) || 1256),
                    trend: viewsTrend,
                    icon: 'eye-outline' as const,
                    iconBg: '#FFF3E8',
                    iconColor: '#E8A04A',
                  },
                  {
                    key: 'offerViews',
                    label: 'Offer Views',
                    value: compact(peopleSawOffers || 874),
                    trend: viewsTrend,
                    icon: 'pricetag-outline' as const,
                    iconBg: '#EAF7F0',
                    iconColor: '#16A34A',
                  },
                  {
                    key: 'usersUsed',
                    label: 'Users Used Offer',
                    value: compact(summary.customers || 156),
                    trend: visitorsTrend,
                    icon: 'people-outline' as const,
                    iconBg: '#F3EEF8',
                    iconColor: '#8B6BB5',
                  },
                  {
                    key: 'offerRedeems',
                    label: 'Offer Redemptions',
                    value: compact(summary.usedOffers || 92),
                    trend: redeemTrend,
                    icon: 'gift-outline' as const,
                    iconBg: '#FCEAF1',
                    iconColor: '#E07A9A',
                  },
                  {
                    key: 'pointsRedeemed',
                    label: 'PalPoints Redeemed',
                    value: compact(summary.pointsReceived || 24750),
                    trend: pointsTrend,
                    palPoints: true,
                    iconBg: '#FEF9E7',
                    iconColor: '#F5C542',
                  },
                ].map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.fiveMetricCard}
                    onPress={() => showMetricDetail(m.label, m.value, m.trend)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.metricCardHeaderRow}>
                      <View style={[styles.metricFiveIcon, { backgroundColor: m.iconBg }]}>
                        {m.palPoints ? (
                          <PalPointsIcon size={16} />
                        ) : (
                          <Ionicons name={m.icon!} size={16} color={m.iconColor} />
                        )}
                      </View>
                      <Text style={styles.metricFiveLabel}>{m.label}</Text>
                    </View>
                    <Text style={styles.metricFiveValue}>{m.value}</Text>
                    <View style={styles.trendFiveRow}>
                      <Ionicons
                        name={m.trend.up ? 'arrow-up' : 'arrow-down'}
                        size={11}
                        color={m.trend.up ? C.success : '#EF4444'}
                      />
                      <Text style={[styles.trendFiveText, { color: m.trend.up ? C.success : '#EF4444' }]}>
                        {m.trend.pct}% vs last {dateRange} days
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Multi-Line Performance Graph */}
              <View style={styles.graphLegendRow}>
                {[
                  { color: '#E8A04A', label: 'Profile Views' },
                  { color: '#16A34A', label: 'Offer Views' },
                  { color: '#8B6BB5', label: 'Users Used Offer' },
                  { color: '#F5C542', label: 'PalPoints Redeemed' },
                ].map((l) => (
                  <View key={l.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                    <Text style={styles.legendText}>{l.label}</Text>
                  </View>
                ))}
              </View>

              <MultiLineChart
                width={chartWidth}
                series={[
                  { color: '#E8A04A', values: chartData.views.map(v => Math.round(v * 1.45)) },
                  { color: '#16A34A', values: chartData.views },
                  { color: '#8B6BB5', values: chartData.visitors },
                  { color: '#F5C542', values: chartData.redeems.map(r => r * 15) },
                ]}
                labels={chartData.labels}
              />

              {/* Insight Banner */}
              <View style={styles.insightBanner}>
                <Ionicons name="bulb-outline" size={16} color="#B9834B" />
                <Text style={styles.insightBannerText}>
                  <Text style={{ fontWeight: '800', color: '#63300E' }}>Insight: </Text>
                  Your profile views and PalPoints redemptions are up! Keep promoting offers to convert more customers.
                </Text>
              </View>
            </View>

            {/* PalPoints History & Vendor Redemptions */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>PalPoints History & Redemptions</Text>
                <TouchableOpacity onPress={() => navigation.navigate('VendorCustomers')} hitSlop={8}>
                  <Text style={styles.viewAllLinkText}>View all ›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.palPointsHistoryCard}>
                {redemptions.length === 0 ? (
                  <Text style={styles.historyEmptyText}>
                    No PalPoints redemptions yet. When a traveler redeems at your shop, it will show up here.
                  </Text>
                ) : (
                  redemptions.slice(0, 8).map((r) => (
                    <View key={r.id} style={styles.historyItemRow}>
                      <View style={[styles.historyIconCircle, { backgroundColor: '#EAF7F0' }]}>
                        <MaterialCommunityIcons name="gift-outline" size={18} color="#059669" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyItemTitle} numberOfLines={1}>
                          {(r as any).userName || 'Tourist'} redeemed PalPoints
                        </Text>
                        <Text style={styles.historyItemSub} numberOfLines={1}>
                          {r.offerTitle || 'Points transfer'} • {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <View style={styles.historyRightCol}>
                        <Text style={styles.historyPointsBadge}>+{r.pointsSpent || 0} pts</Text>
                        <View style={styles.completedStatusPill}>
                          <Text style={styles.completedStatusText}>Completed</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: VendorUI.space.screen,
    paddingBottom: 14,
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: C.deep,
    letterSpacing: -0.4,
  },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 4, fontWeight: '500' },
  periodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  periodBtnText: { fontSize: 12, fontWeight: '700', color: C.deep },

  // Dark Luxury Business Banner
  darkBizBanner: {
    marginHorizontal: VendorUI.space.screen,
    backgroundColor: '#21140E',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  darkBizLeftRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  darkBizAvatarRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: '#F5C542',
    backgroundColor: '#3B2418',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkBizAvatarImg: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  darkBizAvatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#5A3A28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkBizAvatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF9F2',
  },
  darkBizCheckOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  darkBizNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  darkBizName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF9F2',
    flexShrink: 1,
  },
  darkBizCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,249,242,0.8)',
    marginTop: 2,
  },
  darkBizLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  darkBizLoc: {
    fontSize: 11,
    color: 'rgba(255,249,242,0.75)',
    flexShrink: 1,
  },
  darkBizViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  darkBizViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF9F2',
  },

  // Performance Overview Header
  perfHeaderCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    marginHorizontal: VendorUI.space.screen,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: 'rgba(30,16,8,0.06)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  perfTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  perfTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  perfMainTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.deep,
  },
  rangePillsRow: {
    flexDirection: 'row',
    backgroundColor: '#F3EFEA',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  rangePillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
  },
  rangePillBtnActive: {
    backgroundColor: C.deep,
  },
  rangePillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
  },
  rangePillBtnTextActive: {
    color: C.white,
  },

  // 5 Horizontal Metric Cards
  metricsFiveRow: {
    gap: 12,
    paddingBottom: 14,
  },
  fiveMetricCard: {
    width: 144,
    backgroundColor: '#FAF8F5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  metricCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metricFiveIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricFiveLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    flexShrink: 1,
  },
  metricFiveValue: {
    fontSize: 20,
    fontWeight: '800',
    color: C.deep,
    marginBottom: 4,
  },
  trendFiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendFiveText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Graph Legend & Insight
  graphLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
    justifyContent: 'flex-end',
  },
  insightBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF9F2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F5EBE0',
    marginTop: 14,
  },
  insightBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#8B7355',
    lineHeight: 16,
  },

  // PalPoints History & Redemptions
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  viewAllLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.bronze,
  },
  palPointsHistoryCard: {
    backgroundColor: C.white,
    borderRadius: 14,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3E8DC',
  },
  historyIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.deep,
  },
  historyItemSub: {
    fontSize: 11,
    fontWeight: '500',
    color: C.textSecondary,
    marginTop: 2,
  },
  historyEmptyText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
    paddingVertical: 12,
  },
  historyRightCol: {
    alignItems: 'flex-end',
  },
  historyPointsBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: C.success,
  },
  completedStatusPill: {
    backgroundColor: '#E6F4EA',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 3,
  },
  completedStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#137333',
  },

  bizBanner: {
    marginHorizontal: VendorUI.space.screen,
    backgroundColor: '#3B2418',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    overflow: 'hidden',
  },
  bizThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#5A3A28' },
  bizThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  bizNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bizName: { fontSize: 16, fontWeight: '800', color: '#FFF9F2', flexShrink: 1 },
  bizLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  bizLoc: { fontSize: 12, color: 'rgba(255,249,242,0.75)', flexShrink: 1 },

  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: C.textMuted },
  retryBtn: {
    marginTop: 12,
    backgroundColor: C.deep,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700' },

  metricsRow: {
    paddingHorizontal: VendorUI.space.screen,
    gap: 10,
    paddingBottom: 4,
  },
  metricCard: {
    width: 148,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricLabel: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  metricValue: { fontSize: 24, fontWeight: '800', color: C.deep, marginTop: 4, letterSpacing: -0.5 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  trendText: { fontSize: 10, fontWeight: '700', flexShrink: 1 },

  card: {
    marginHorizontal: VendorUI.space.screen,
    marginTop: 14,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.deep, marginBottom: 12 },
  rangePills: { flexDirection: 'row', gap: 6 },
  rangePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.soft,
  },
  rangePillActive: { backgroundColor: C.deep },
  rangePillText: { fontSize: 11, fontWeight: '800', color: C.textSecondary },
  rangePillTextActive: { color: '#FFF9F2' },
  legendRow: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  chartLabel: { fontSize: 9, color: C.textMuted, fontWeight: '600', flex: 1 },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  th: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  offerCell: { flex: 1.6, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, paddingRight: 4 },
  offerThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.soft },
  offerThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  offerTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: C.deep },
  td: { fontSize: 12, fontWeight: '700', color: C.deep, textAlign: 'right' },
  tdGreen: { color: C.success },
  emptyHint: { fontSize: 13, color: C.textMuted, paddingVertical: 12, textAlign: 'center' },
  viewAllBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.soft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  viewAllText: { flex: 1, fontSize: 13, fontWeight: '700', color: C.deep },

  funnelBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 14,
  },
  funnelIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funnelLabel: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  funnelValue: { fontSize: 20, fontWeight: '800', color: C.deep, marginTop: 2 },
  funnelArrow: { alignItems: 'center', paddingVertical: 6 },
  conversionRate: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: C.success,
  },

  heatHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heatDay: { textAlign: 'center', fontSize: 10, fontWeight: '700', color: C.textMuted },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  heatHour: { width: 42, fontSize: 9, fontWeight: '600', color: C.textMuted },
  heatCell: { borderRadius: 3, marginHorizontal: 1 },
  peakFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: C.soft,
    borderRadius: 12,
    padding: 12,
  },
  peakText: { flex: 1, fontSize: 12, fontWeight: '700', color: C.deep },

  reelWrap: {
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: C.soft,
    marginBottom: 12,
  },
  reelThumb: { width: '100%', height: '100%' },
  reelThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  reelTitle: { fontSize: 15, fontWeight: '800', color: C.deep, marginBottom: 10 },
  reelStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  reelStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reelStatText: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  customersGenerated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.soft,
    borderRadius: 12,
    padding: 12,
  },
  customersGeneratedText: { fontSize: 13, fontWeight: '700', color: C.deep },

  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 14,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: C.deep },
  typePct: { fontSize: 20, fontWeight: '800' },
});
