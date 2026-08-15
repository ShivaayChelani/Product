import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import { redemptionsApi, vendorsApi } from '../services/api';
import { DEV_FLAGS } from '../config/devFlags';
import { useVendorScreenInsets } from '../design/vendorLayout';
import type { RootStackParamList } from '../navigation/types';
import { copyToClipboard } from '../utils/clipboard';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';

type PeriodDays = 7 | 30 | 90;

const PERIOD_OPTIONS: { days: PeriodDays; label: string }[] = [
  { days: 7, label: 'Last 7 Days' },
  { days: 30, label: 'Last 30 Days' },
  { days: 90, label: 'Last 90 Days' },
];

const C = {
  bg: '#F7F5F2',
  white: '#FFFFFF',
  soft: '#F7F0E8',
  text: '#3B1E12',
  muted: '#8B7355',
  textMuted: '#B8A88A',
  primary: '#A67C52',
  deep: '#3B1E12',
  border: '#EDE6DC',
  success: '#16A34A',
  orange: '#E8A04A',
  pink: '#E07A9A',
  purple: '#8B6BB5',
  green: '#3D9B6E',
};

function extractList(response: any): any[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 1 : 1)}K`.replace('.0K', 'K');
  return n.toLocaleString('en-IN');
}

function redemptionDate(r: { redeemedAt?: string; createdAt?: string }): Date {
  const raw = r.redeemedAt || r.createdAt;
  return raw ? new Date(raw) : new Date(0);
}

function filterRedemptionsByPeriod<T extends { redeemedAt?: string; createdAt?: string }>(
  list: T[],
  days: PeriodDays,
): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return list.filter((r) => redemptionDate(r) >= cutoff);
}

export default function VendorStudioProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const vendorInsets = useVendorScreenInsets();
  const contentPadBottom = vendorInsets.scrollPadBottom + 60;
  const { currentVendor, redemptions, vendorOffers, refreshVendorData, logoutVendor } = useDataContext();
  const { user, onLogout, setActiveMode } = useUserContext();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());
  const [pointsReceived, setPointsReceived] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);
  const [reelCount, setReelCount] = useState(0);

  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.days === periodDays)?.label ?? 'Last 30 Days';

  const loadStats = useCallback(async () => {
    if (!currentVendor) return;
    const localReds = filterRedemptionsByPeriod(
      redemptions.filter((r) => r.vendorId === currentVendor.id),
      periodDays,
    );
    const localPoints = localReds.reduce((s, r) => s + (r.pointsSpent || 0), 0);

    if (!DEV_FLAGS.USE_SERVER_API) {
      setPointsReceived(localPoints);
      setVisitorCount(localReds.length);
      setReelCount(0);
      return;
    }

    try {
      const [redRes, reelsRes] = await Promise.all([
        redemptionsApi.vendorRedemptions(1, 200),
        vendorsApi.getVendorReels(currentVendor.id).catch(() => []),
      ]);
      const list = filterRedemptionsByPeriod(extractList(redRes), periodDays);
      const points = list.reduce((s, r) => s + (Number(r.pointsSpent) || 0), 0);
      const reelsList = Array.isArray((reelsRes as any)?.data)
        ? (reelsRes as any).data
        : Array.isArray(reelsRes)
          ? reelsRes
          : [];
      setPointsReceived(points || localPoints);
      setVisitorCount(list.length || localReds.length);
      setReelCount(reelsList.length);
    } catch {
      setPointsReceived(localPoints);
      setVisitorCount(localReds.length);
    }
  }, [currentVendor, redemptions, periodDays]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
      const unsub = subscribeUnreadBadge(setUnreadCount);

      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          if (DEV_FLAGS.USE_SERVER_API) {
            await refreshVendorData().catch(() => {});
          }
          if (!cancelled) await loadStats();
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
        unsub();
      };
    }, [loadStats, refreshVendorData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (DEV_FLAGS.USE_SERVER_API) await refreshVendorData().catch(() => {});
      await loadStats();
    } finally {
      setRefreshing(false);
    }
  }, [loadStats, refreshVendorData]);

  const vendor = currentVendor;
  const approved = String(vendor?.verificationStatus || '').toLowerCase() === 'approved';
  const category = String(vendor?.category || 'business').replace(/_/g, ' ');
  const displayName = vendor?.businessName || 'Your Business';
  const addressShort = [vendor?.city, vendor?.state].filter(Boolean).join(', ') || 'Location not set';
  const addressFull = [vendor?.address, vendor?.city, vendor?.state]
    .filter(Boolean)
    .join(', ') || 'Address not set';
  const phone = vendor?.phone || user?.phoneNumber || '—';
  const email = vendor?.email || user?.email || '—';
  const hours = vendor?.openingHours || (vendor as any)?.operatingHours || 'Hours not set';
  const vendorCode = vendor?.vendorCode || '—';
  const rating = Number((vendor as any)?.rating || (vendor as any)?.avgRating || 0);
  const reviewCount = Number((vendor as any)?.reviewCount || (vendor as any)?.totalReviews || 0);
  const activeOffers = vendorOffers.filter((o: any) => o.isActive).length;
  const coverUri = (vendor as any)?.coverImageUrl || vendor?.imageUrl || null;
  const logoUri = vendor?.imageUrl || null;
  const isPremium = String((vendor as any)?.subscriptionTier || (vendor as any)?.plan || '')
    .toLowerCase()
    .includes('premium')
    || String((vendor as any)?.subscriptionStatus || '').toLowerCase() === 'active';

  const copyCode = async () => {
    const ok = await copyToClipboard(vendorCode, 'Vendor Code');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          logoutVendor();
          await onLogout();
        },
      },
    ]);
  };

  const openPeriodPicker = () => {
    Alert.alert('Select Period', 'Choose a time range for your business stats', [
      ...PERIOD_OPTIONS.map((p) => ({
        text: p.label,
        onPress: () => setPeriodDays(p.days),
      })),
    ]);
  };

  const handleSwitchBusiness = () => {
    Alert.alert('Switch Business', 'Switch to traveller mode?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: () => setActiveMode('USER') },
    ]);
  };

  const infoRows = [
    { icon: 'storefront-outline', label: 'Business Name', value: displayName },
    { icon: 'pricetag-outline', label: 'Category', value: category },
    { icon: 'call-outline', label: 'Phone', value: phone },
    { icon: 'mail-outline', label: 'Email', value: email },
    { icon: 'location-outline', label: 'Address', value: addressFull },
    { icon: 'time-outline', label: 'Opening Hours', value: hours },
  ];




  if (!vendor && loading) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 16) }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Business</Text>
            <Text style={styles.subtitle}>Manage your business profile and settings</Text>
          </View>
        </View>

        {/* Hero card */}
        <View style={styles.heroCard}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.heroBg} />
          ) : (
            <View style={[styles.heroBg, styles.heroBgFallback]} />
          )}
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <View style={styles.heroTop}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoFallback]}>
                  <Text style={styles.logoLetter}>{(displayName[0] || 'V').toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.heroName} numberOfLines={1}>{displayName}</Text>
                  {approved ? (
                    <MaterialCommunityIcons name="check-decagram" size={16} color="#F5C542" />
                  ) : null}
                </View>
                <View style={styles.locRow}>
                  <Icon name="location-sharp" size={12} color="rgba(255,249,242,0.85)" />
                  <Text style={styles.locText} numberOfLines={1}>{addressShort}</Text>
                </View>
                {(rating > 0 || reviewCount > 0) ? (
                  <View style={styles.ratingRow}>
                    <Icon name="star" size={12} color="#F5C542" />
                    <Text style={styles.ratingText}>
                      {rating > 0 ? rating.toFixed(1) : '—'}
                      {reviewCount > 0 ? ` (${reviewCount.toLocaleString('en-IN')} Reviews)` : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <TouchableOpacity
              style={styles.editBizBtn}
              onPress={() => navigation.navigate('VendorSettings')}
              activeOpacity={0.85}
            >
              <Icon name="pencil" size={13} color="#FFF9F2" />
              <Text style={styles.editBizText}>Edit Business</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          {[
            {
              key: 'offers',
              label: 'Active Offers',
              value: String(activeOffers),
              link: 'View All →',
              color: C.orange,
              bg: '#FFF3E4',
              icon: 'gift-outline' as const,
              onPress: () => navigation.navigate('VendorTabs', { screen: 'Offers' }),
            },
            {
              key: 'reels',
              label: 'Promotion Reels',
              value: String(reelCount),
              link: 'View All →',
              color: C.pink,
              bg: '#FCEAF1',
              icon: 'film-outline' as const,
              onPress: () => navigation.navigate('VendorTabs', { screen: 'Promotions' }),
            },
            {
              key: 'points',
              label: 'PalPoints Redeemed',
              value: compact(pointsReceived),
              link: 'View Details →',
              color: C.purple,
              bg: '#F3EEF8',
              palPoints: true,
              onPress: () =>
                navigation.navigate('VendorAnalytics', {
                  vendorId: vendor?.id || '',
                  vendorName: displayName,
                }),
            },
            {
              key: 'visitors',
              label: 'Total Visitors',
              value: compact(visitorCount),
              link: 'View Insights →',
              color: C.green,
              bg: '#EAF7F0',
              icon: 'people-outline' as const,
              onPress: () => navigation.navigate('VendorTabs', { screen: 'Statistics' }),
            },
          ].map((s) => (
            <TouchableOpacity key={s.key} style={styles.statCard} onPress={s.onPress} activeOpacity={0.85}>
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                {s.palPoints ? (
                  <PalPointsIcon size={16} />
                ) : (
                  <Icon name={s.icon!} size={16} color={s.color} />
                )}
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={[styles.statLink, { color: s.color }]}>{s.link}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Business Information */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <Icon name="storefront-outline" size={16} color={C.primary} />
              <Text style={styles.cardTitle}>Business Information</Text>
            </View>
            <TouchableOpacity
              style={styles.editLink}
              onPress={() => navigation.navigate('VendorSettings')}
            >
              <Icon name="pencil" size={12} color={C.primary} />
              <Text style={styles.editLinkText}>Edit Details</Text>
            </TouchableOpacity>
          </View>
          {infoRows.map((row, i) => (
            <View key={row.label} style={[styles.infoRow, i === infoRows.length - 1 && { borderBottomWidth: 0 }]}>
              <Icon name={row.icon as any} size={15} color={C.textMuted} />
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
          <View style={styles.codeRow}>
            <Icon name="shield-checkmark" size={16} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.codeLabel}>Vendor Code</Text>
              <Text style={styles.codeValue}>{vendorCode}</Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
              <Icon name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? C.success : C.deep} />
              <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Premium banner */}
        <TouchableOpacity
          style={styles.premiumBanner}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('VendorSubscription')}
        >
          <View style={styles.crownWrap}>
            <MaterialCommunityIcons name="crown" size={18} color="#F5C542" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.premiumTitleRow}>
              <Text style={styles.premiumTitle}>Premium Business</Text>
              {isPremium ? (
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>Active</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.premiumSub}>
              {isPremium
                ? 'Your Premium plan is active.'
                : 'Upgrade to Premium to unlock growth tools.'}
            </Text>
          </View>
          <View style={styles.manageBtn}>
            <Text style={styles.manageBtnText}>Manage Plan →</Text>
          </View>
        </TouchableOpacity>




        {/* Switch + Logout */}
        <TouchableOpacity
          style={styles.switchRow}
          onPress={handleSwitchBusiness}
          activeOpacity={0.8}
        >
          <Icon name="business-outline" size={18} color={C.deep} />
          <Text style={styles.switchText}>Switch Business</Text>
          <Icon name="chevron-forward" size={16} color={C.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Icon name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  title: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 3, fontWeight: '500' },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: C.white,
  },
  notifBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  periodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 4,
  },
  periodText: { fontSize: 11, fontWeight: '700', color: C.deep },

  heroCard: {
    height: 168,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#3B2418',
  },
  heroBg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroBgFallback: { backgroundColor: '#3B2418' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 14, 8, 0.55)',
  },
  heroContent: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,249,242,0.35)',
    backgroundColor: '#5A3A28',
  },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 22, fontWeight: '800', color: '#FFF9F2' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroName: { fontSize: 18, fontWeight: '800', color: '#FFF9F2', flexShrink: 1 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locText: { fontSize: 12, color: 'rgba(255,249,242,0.85)', flexShrink: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  ratingText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,249,242,0.9)' },
  editBizBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,249,242,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,249,242,0.25)',
  },
  editBizText: { fontSize: 12, fontWeight: '700', color: '#FFF9F2' },

  statsRow: { gap: 10, paddingBottom: 4, marginBottom: 10 },
  statCard: {
    width: 132,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: { fontSize: 11, fontWeight: '600', color: C.muted },
  statValue: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 4, letterSpacing: -0.4 },
  statLink: { fontSize: 11, fontWeight: '700', marginTop: 8 },

  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLinkText: { fontSize: 12, fontWeight: '700', color: C.primary },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  infoLabel: { width: 100, fontSize: 12, fontWeight: '600', color: C.muted, paddingTop: 1 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'right' },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.soft,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  codeLabel: { fontSize: 11, fontWeight: '600', color: C.muted },
  codeValue: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 1 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.white,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
  },
  copyBtnText: { fontSize: 11, fontWeight: '700', color: C.deep },

  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#3B2418',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  crownWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245,197,66,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  premiumTitle: { fontSize: 14, fontWeight: '800', color: '#FFF9F2' },
  activePill: {
    backgroundColor: 'rgba(22,163,74,0.2)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activePillText: { fontSize: 10, fontWeight: '800', color: '#4ADE80' },
  premiumSub: { fontSize: 11, color: 'rgba(255,249,242,0.75)', marginTop: 3 },
  manageBtn: {
    backgroundColor: 'rgba(255,249,242,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  manageBtnText: { fontSize: 11, fontWeight: '800', color: '#FFF9F2' },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  payRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  payIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  paySub: { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: '500' },

  prefsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  prefItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  prefIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  prefLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    lineHeight: 14,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  switchText: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: '#DC2626' },
});
