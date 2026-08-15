import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  RefreshControl, Animated, Platform, Alert, Image,
  LayoutAnimation, useWindowDimensions, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  MaterialIcons, Ionicons, MaterialCommunityIcons, Feather,
} from '../utils/Icons';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import { useEntitlements } from '../context/EntitlementContext';
import { notificationService } from '../services/notificationService';
import { InAppNotification } from '../services/api/notifications';
import { vendorsApi } from '../services/api/vendors';
import { DEV_FLAGS } from '../config/devFlags';
import { useVendorScreenInsets, VendorUI } from '../design/vendorLayout';
import { Svg, Circle, Path, Defs, Stop, LinearGradient } from 'react-native-svg';
import type { RootStackParamList } from '../navigation/types';
import { copyToClipboard } from '../utils/clipboard';
import VendorWorkspaceSidebar from '../components/VendorWorkspaceSidebar';
import { PalPointsIcon } from '../components/PalPointsIcon';
import OfferStatsModal from '../components/vendor/OfferStatsModal';
import { ReelUploadStatusCard } from '../features/creator/components/ReelUploadStatusCard';
import { creatorUploadManager, isUploadJobVisible, type ReelUploadJob } from '../services/creator/creatorUploadManager';
import { useQueryClient } from '@tanstack/react-query';
import TaggedReelReviewRow from '../components/TaggedReelReviewRow';
import type { TaggedCreatorReel, VendorReel } from '../services/api/vendors';
import { buildVendorRecentActivity } from '../features/vendor/vendorRecentActivity';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';

const _CARD_RADIUS = 22;
const _ICON_RADIUS = 18;
const _BANNER_RADIUS = 24;

const COLORS = {
  // Creator-aligned cream / bronze workspace chrome
  sky: '#A67C52',
  skyDark: '#8B6B3A',
  skyDeep: '#63300E',
  skyMedium: '#D4A87A',
  skyLight: '#D4A87A',
  skyPale: '#FFFFFF',
  skyVeryPale: '#FFFFFF',
  white: '#FFFFFF',
  bg: '#FFFFFF',
  textPrimary: '#4D3227',
  textSecondary: '#8B7355',
  textMuted: '#B8A88A',
  border: '#E9D4BE',
  shadow: 'rgba(99, 48, 14, 0.16)',
  success: '#059669',
  warning: '#B9834B',
  star: '#B9834B',
  cardBg: '#FFFFFF',
};

type ActivityMetric = 'redemptions' | 'views' | 'customers';

function ProfileRing({ percent, size = 72 }: { percent: number; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = circ * (1 - pct / 100);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cy} r={r} stroke="#FFFFFF" strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="#A67C52"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textPrimary }}>{pct}%</Text>
    </View>
  );
}

function ActivityLineChart({
  values,
  labels,
  width,
  height = 120,
}: {
  values: number[];
  labels: string[];
  width?: number;
  height?: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const chartW = width ?? (screenW - 32 - 88 - 28);
  const max = Math.max(...values, 1);
  const pad = { top: 8, bottom: 4, left: 4, right: 4 };
  const chartH = height - pad.top - pad.bottom;
  const innerW = chartW - pad.left - pad.right;
  const points = values.map((v, i) => ({
    x: pad.left + i * (innerW / Math.max(values.length - 1, 1)),
    y: pad.top + chartH - (v / max) * chartH,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + chartH).toFixed(1)} Z`;

  return (
    <View>
      <Svg width={chartW} height={height}>
        <Defs>
          <LinearGradient id="vendorArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#A67C52" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#A67C52" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#vendorArea)" />
        <Path d={linePath} stroke="#A67C52" strokeWidth={2.5} fill="none" />
        {points.map((p, i) => (
          <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3.5} fill="#A67C52" stroke="#fff" strokeWidth={1.5} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {labels.map((label, i) => (
          <Text key={`${label}-${i}`} style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: '600', width: 36, textAlign: i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center' }}>
            {i === 0 || i === labels.length - 1 || i === Math.floor(labels.length / 2) ? label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const NAV_ITEMS = [
  { key: 'Home', icon: 'home', iconSet: 'Ionicons' },
  { key: 'Offers', icon: 'local-offer', iconSet: 'MaterialIcons' },
  { key: 'Analytics', icon: 'bar-chart-2', iconSet: 'Feather' },
  { key: 'Profile', icon: 'person', iconSet: 'Ionicons' },
] as const;

interface VendorDashboardScreenProps {
  onBack: () => void;
  onLogout?: () => void;
  onCreateOffer: () => void;
  onEditOffer?: (offerId: string) => void;
  onViewMyOffers?: () => void;
  onViewAnalytics: () => void;
  onViewProfile?: () => void;
  canGoBack?: boolean;
  /** When set by VendorTabs, locks content to that section */
  forcedTab?: 'Home' | 'Offers';
  /** Hide legacy fake bottom nav when real VendorTabs are used */
  hideBottomNav?: boolean;
}

interface NotifItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  read: boolean;
  createdAt: string;
}

function NotificationsDropdown({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationService.getNotifications(1, 20);
      const mapped: NotifItem[] = (data || []).map((n: InAppNotification) => ({
        id: n.id,
        title: n.title,
        desc: n.body || '',
        time: formatNotifTime(n.createdAt),
        read: n.read,
        createdAt: n.createdAt,
      }));
      setNotifications(mapped);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) fetchNotifications();
  }, [visible, fetchNotifications]);

  const handleMarkRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await notificationService.markAsRead(id);
    } catch { }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await notificationService.markAllAsRead();
    } catch { }
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!visible) return null;

  return (
    <View style={s.notifDropdown}>
      <View style={s.notifHeaderRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.notifHeader}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={s.notifBadge}>
              <Text style={s.notifBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={s.notifCloseBtn}>
          <MaterialIcons name="close" size={20} color={COLORS.skyDeep} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Loading...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="notifications-off-outline" size={32} color={COLORS.textMuted} />
          <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8 }}>No notifications yet</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
          {notifications.slice(0, 10).map(n => (
            <TouchableOpacity
              key={n.id}
              style={[s.notifItem, !n.read && { backgroundColor: COLORS.skyPale }]}
              onPress={() => handleMarkRead(n.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.notifTitle, !n.read && { fontWeight: '700' }]}>{n.title}</Text>
                {n.desc ? <Text style={s.notifDesc}>{n.desc}</Text> : null}
                <Text style={s.notifTime}>{n.time}</Text>
              </View>
              {!n.read && <View style={s.notifUnreadDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!loading && notifications.length > 0 && (
        <>
          <View style={s.notifFooter}>
            {unreadCount > 0 && (
              <TouchableOpacity style={s.notifFooterBtn} onPress={handleMarkAllRead}>
                <Text style={s.notifFooterBtnText}>Mark all as read</Text>
              </TouchableOpacity>
            )}
            {notifications.length > 10 && (
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>+{notifications.length - 10} more</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function formatNotifTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const OFFER_FILTERS = ['All', 'Active', 'Scheduled', 'Drafts', 'Expired'] as const;
type OfferFilter = (typeof OFFER_FILTERS)[number];
type OfferLifecycle = 'Active' | 'Scheduled' | 'Expired' | 'Draft';

function getOfferLifecycleStatus(offer: any): OfferLifecycle {
  const now = Date.now();
  if (!offer.isActive) return 'Draft';
  if (offer.startDate) {
    const start = new Date(offer.startDate).getTime();
    if (!Number.isNaN(start) && start > now) return 'Scheduled';
  }
  if (offer.validTill) {
    const end = new Date(offer.validTill);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (end.getTime() < now) return 'Expired';
    }
  }
  return 'Active';
}

/** Drafts filter includes paused + admin-disabled; surface the real reason on badges. */
function getOfferLifecycleBadgeLabel(offer: any): string {
  const status = getOfferLifecycleStatus(offer);
  if (status !== 'Draft') return status;
  if (offer.rejectionReason) return 'Disabled';
  if (offer.pausedAt) return 'Paused';
  return 'Inactive';
}

function daysLeftNumber(offer: any, status: OfferLifecycle): string {
  if (status === 'Draft') return '—';
  if (status === 'Expired') return '0';
  if (!offer.validTill) return '—';
  const t = new Date(offer.validTill).getTime();
  if (Number.isNaN(t)) return '—';
  return String(Math.max(0, Math.floor((t - Date.now()) / (1000 * 60 * 60 * 24))));
}

function formatOfferDate(value?: string | null): string {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTimeLeft(offer: any, status: OfferLifecycle): string {
  if (status === 'Draft') return 'Not published';
  if (status === 'Expired') {
    if (!offer.validTill) return 'Expired';
    const end = new Date(offer.validTill).getTime();
    if (Number.isNaN(end)) return 'Expired';
    const days = Math.max(1, Math.floor((Date.now() - end) / (1000 * 60 * 60 * 24)));
    return `Expired ${days} day${days !== 1 ? 's' : ''} ago`;
  }
  const target = status === 'Scheduled' ? offer.startDate : offer.validTill;
  if (!target) return status === 'Scheduled' ? 'Scheduled' : 'No end date';
  const t = new Date(target).getTime();
  if (Number.isNaN(t)) return 'N/A';
  const days = Math.max(0, Math.floor((t - Date.now()) / (1000 * 60 * 60 * 24)));
  if (status === 'Scheduled') return `${days} day${days !== 1 ? 's' : ''}`;
  return `${days} day${days !== 1 ? 's' : ''} left`;
}

function formatOfferTimeRange(offer: any): string {
  const start = offer.startTime || offer.timeStart || offer.validFromTime;
  const end = offer.endTime || offer.timeEnd || offer.validToTime;
  if (start && end) return `${start} – ${end}`;
  return 'All day';
}

function discountLabel(offer: any): string {
  if (offer.discountType === 'percentage') return `${offer.discountValue}% OFF`;
  if (offer.discountType === 'flat') return `₹${offer.discountValue} OFF`;
  if (offer.discountType === 'freebie') return 'Freebie';
  return 'Special';
}

function OffersView({
  onCreateOffer,
  onEditOffer,
  totalOffers = 0,
  activeOffers = 0,
  totalRedemptions = 0,
  offerViews = 0,
  offers = [],
  refreshing = false,
  onRefresh,
  scrollPadBottom = 120,
  padTop = 0,
  vendor,
  onOpenMenu,
  onOpenNotifications,
}: {
  onCreateOffer: () => void;
  onEditOffer?: (offerId: string) => void;
  totalOffers?: number;
  activeOffers?: number;
  totalRedemptions?: number;
  offerViews?: number;
  offers?: any[];
  refreshing?: boolean;
  onRefresh?: () => void;
  scrollPadBottom?: number;
  padTop?: number;
  vendor?: any;
  onOpenMenu?: () => void;
  onOpenNotifications?: () => void;
}) {
  const { deleteVendorOffer, toggleVendorOffer, duplicateVendorOffer, refreshVendorData } = useDataContext();
  const [activeFilter, setActiveFilter] = useState<OfferFilter>('All');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMenuOffer, setActionMenuOffer] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [statsOffer, setStatsOffer] = useState<{ id: string; title: string } | null>(null);
  const [sortKey, setSortKey] = useState<'latest' | 'redeems' | 'views' | 'ending'>('latest');
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
      return subscribeUnreadBadge(setUnreadCount);
    }, []),
  );

  const approved = String(vendor?.verificationStatus || '').toLowerCase() === 'approved';
  const displayName = vendor?.businessName || 'Your Business';
  const address = [vendor?.city, vendor?.state].filter(Boolean).join(', ') || vendor?.address || 'Location not set';
  const vendorCode = vendor?.vendorCode || '—';

  const handleFilterChange = useCallback((filter: OfferFilter) => {
    LayoutAnimation.configureNext({
      duration: 400,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.7 },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setActiveFilter(filter);
  }, []);

  const openFilterSort = useCallback(() => {
    Alert.alert('Sort & Filter', 'Choose how to sort your offers', [
      { text: 'Latest first', onPress: () => setSortKey('latest') },
      { text: 'Most redeems', onPress: () => setSortKey('redeems') },
      { text: 'Most views', onPress: () => setSortKey('views') },
      { text: 'Ending soon', onPress: () => setSortKey('ending') },
      { text: 'Show All', onPress: () => setActiveFilter('All') },
      { text: 'Show Active only', onPress: () => setActiveFilter('Active') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const filterCounts = useMemo(() => {
    const counts: Record<OfferFilter, number> = {
      All: offers.length,
      Active: 0,
      Scheduled: 0,
      Drafts: 0,
      Expired: 0,
    };
    offers.forEach((o: any) => {
      const status = getOfferLifecycleStatus(o);
      if (status === 'Draft') counts.Drafts += 1;
      else counts[status] += 1;
    });
    return counts;
  }, [offers]);

  const displayCards = useMemo(() => {
    const mapped = offers
      .filter((o: any) => {
        if (activeFilter === 'All') return true;
        const status = getOfferLifecycleStatus(o);
        if (activeFilter === 'Drafts') return status === 'Draft';
        return status === activeFilter;
      })
      .map((offer: any) => {
        const status = getOfferLifecycleStatus(offer);
        return {
          id: offer.id,
          title: offer.offerTitle || offer.title || '',
          discount: discountLabel(offer),
          points: offer.pointsRequired ?? 0,
          minBill: offer.minBillAmount ? `₹${offer.minBillAmount}` : 'None',
          status,
          statusLabel: getOfferLifecycleBadgeLabel(offer),
          validUntil: formatOfferDate(offer.validTill),
          timeLeft: formatTimeLeft(offer, status),
          daysLeft: daysLeftNumber(offer, status),
          daysLeftNum: Number(daysLeftNumber(offer, status)) || 0,
          timeRange: formatOfferTimeRange(offer),
          imageUrl: offer.imageUrl || '',
          redemptions: offer.currentRedemptions ?? offer.redemptions ?? 0,
          views: offer.viewCount ?? offer.views ?? 0,
          isActive: !!offer.isActive,
          createdAt: offer.createdAt ? new Date(offer.createdAt).getTime() : 0,
          validTillTs: offer.validTill ? new Date(offer.validTill).getTime() : Number.MAX_SAFE_INTEGER,
        };
      });

    return mapped.sort((a, b) => {
      if (sortKey === 'redeems') return b.redemptions - a.redemptions;
      if (sortKey === 'views') return b.views - a.views;
      if (sortKey === 'ending') return a.validTillTs - b.validTillTs;
      return b.createdAt - a.createdAt;
    });
  }, [offers, activeFilter, sortKey]);

  const handleDelete = useCallback((offerId: string, title: string) => {
    Alert.alert('Delete offer', `Delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusyId(offerId);
            await deleteVendorOffer(offerId);
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to delete offer.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }, [deleteVendorOffer]);

  const handleToggle = useCallback(async (offerId: string, currentlyActive: boolean) => {
    try {
      setBusyId(offerId);
      await toggleVendorOffer(offerId);
    } catch (err: any) {
      Alert.alert('Error', err?.message || `Failed to ${currentlyActive ? 'pause' : 'resume'} offer.`);
    } finally {
      setBusyId(null);
    }
  }, [toggleVendorOffer]);

  const handleDuplicate = useCallback((offerId: string, title: string) => {
    Alert.alert('Duplicate offer', `Create a copy of "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Duplicate',
        onPress: async () => {
          try {
            setBusyId(offerId);
            const created = await duplicateVendorOffer(offerId);
            await refreshVendorData().catch(() => {});
            if (created?.id) {
              Alert.alert('Offer duplicated', 'A draft copy was created. Edit and publish when ready.');
            }
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to duplicate offer.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }, [duplicateVendorOffer, refreshVendorData]);

  const openStats = useCallback((offerId: string, title: string) => {
    setStatsOffer({ id: offerId, title });
  }, []);

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(vendorCode, 'Business Code');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const onOfferMenu = (offer: any) => {
    setActionMenuOffer(offer);
  };

  return (
    <>
    <ScrollView
      style={s.scrollView}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: scrollPadBottom, paddingTop: padTop }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.sky} />
        ) : undefined
      }
    >
      {/* Top chrome */}
      <View style={s.OvTopBar}>
        <TouchableOpacity style={s.OvTopIcon} onPress={onOpenMenu} hitSlop={8}>
          <Ionicons name="menu" size={22} color={COLORS.skyDeep} />
        </TouchableOpacity>
        <Text style={s.OvBrand}>PalSafar Vendor</Text>
        <TouchableOpacity style={s.OvTopIcon} onPress={onOpenNotifications} hitSlop={8}>
          <Ionicons name="notifications-outline" size={20} color={COLORS.skyDeep} />
          {unreadCount > 0 ? (
            <View style={s.OvNotifBadge}>
              <Text style={s.OvNotifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Business profile card */}
      <View style={s.OvBizCard}>
        {vendor?.imageUrl ? (
          <Image source={{ uri: vendor.imageUrl }} style={s.OvBizThumb} />
        ) : (
          <View style={[s.OvBizThumb, s.OvBizThumbFallback]}>
            <MaterialCommunityIcons name="storefront" size={20} color="#FFFFFF" />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.OvBizNameRow}>
            <Text style={s.OvBizName} numberOfLines={1}>{displayName}</Text>
            {approved ? (
              <MaterialCommunityIcons name="check-decagram" size={15} color="#F5C542" />
            ) : null}
          </View>
          <View style={s.OvBizLocRow}>
            <Ionicons name="location-sharp" size={11} color="rgba(255,249,242,0.75)" />
            <Text style={s.OvBizLoc} numberOfLines={1}>{address}</Text>
          </View>
          <TouchableOpacity style={s.OvCodePill} onPress={handleCopyCode} activeOpacity={0.85}>
            <Text style={s.OvCodeText}>Business Code: {vendorCode}</Text>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={12} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <MaterialCommunityIcons name="storefront-outline" size={48} color="rgba(255,249,242,0.12)" />
      </View>

      <View style={s.OvHeader}>
        <View style={s.OvHeaderLeft}>
          <Text style={s.OvTitle}>Offers</Text>
          <Text style={s.OvSubtitle}>Create and manage offers to attract more tourists.</Text>
        </View>
        <TouchableOpacity style={s.OvCreateBtn} onPress={onCreateOffer} activeOpacity={0.85}>
          <MaterialIcons name="add" size={18} color="#F4A216" />
          <Text style={s.OvCreateBtnText}>Create Offer</Text>
        </TouchableOpacity>
      </View>

      <View style={s.OvStatsGrid}>
        {[
          { label: 'Total Offers', sub: 'All time', value: String(totalOffers), icon: 'local-offer' as const, color: '#E8A04A', active: false },
          { label: 'Active Offers', sub: 'Live now', value: String(activeOffers), icon: 'check-circle' as const, color: '#059669', active: true },
          { label: 'Offer Views', sub: 'Last 30 days', value: offerViews >= 1000 ? `${(offerViews / 1000).toFixed(1)}K` : String(offerViews), icon: 'visibility' as const, color: '#8B6BB5', active: false },
          { label: 'Total Redeems', sub: 'Last 30 days', value: String(totalRedemptions), icon: 'card-giftcard' as const, color: '#E07A4A', active: false },
        ].map((item) => (
          <View key={item.label} style={[s.OvStatCard, item.active && s.OvStatCardActive]}>
            <View style={[s.OvStatIcon, { backgroundColor: item.color + '18' }]}>
              <MaterialIcons name={item.icon} size={16} color={item.color} />
            </View>
            <Text style={[s.OvStatValue, item.active && { color: '#059669' }]}>{item.value}</Text>
            <Text style={[s.OvStatLabel, item.active && { color: '#059669' }]}>{item.label}</Text>
            <Text style={s.OvStatSub}>{item.sub}</Text>
          </View>
        ))}
      </View>

      <View style={s.OvFilterChipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.OvFilterRow}>
          {OFFER_FILTERS.map((f) => {
            const isActive = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => handleFilterChange(f)}
                style={[s.OvFilterChip, isActive && s.OvFilterChipActive]}
                activeOpacity={0.85}
              >
                <Text style={[s.OvFilterChipText, isActive && s.OvFilterChipTextActive]}>
                  {f} ({filterCounts[f]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={s.OvFilterIconBtn} onPress={openFilterSort} activeOpacity={0.85}>
          <Ionicons name="options-outline" size={16} color={COLORS.skyDeep} />
        </TouchableOpacity>
      </View>

      <Text style={s.OvSectionLabel}>Your Offers</Text>

      {displayCards.length === 0 ? (
        <View style={s.emptyRedemptions}>
          <MaterialIcons name="local-offer" size={40} color={COLORS.skyLight} />
          <Text style={s.emptyText}>No {activeFilter.toLowerCase()} offers</Text>
          <Text style={s.emptySubtext}>
            {activeFilter === 'Active' || activeFilter === 'All'
              ? 'Create an offer to start attracting tourists.'
              : `You have no ${activeFilter.toLowerCase()} offers right now.`}
          </Text>
          {(activeFilter === 'Active' || activeFilter === 'All' || activeFilter === 'Drafts') ? (
            <TouchableOpacity style={[s.OvCreateBtn, { marginTop: 16 }]} onPress={onCreateOffer}>
              <MaterialIcons name="add" size={18} color="#F4A216" />
              <Text style={s.OvCreateBtnText}>Create Offer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {displayCards.map((offer) => {
        const statusColors: Record<string, string> = {
          Active: '#059669', Scheduled: '#B9834B', Expired: '#EF4444', Draft: COLORS.textMuted,
        };
        const sc = statusColors[offer.status] || COLORS.textMuted;
        const isBusy = busyId === offer.id;

        return (
          <View key={offer.id} style={s.OvCard}>
            <View style={s.OvCardMain}>
              <View style={s.OvImgWrap}>
                {offer.imageUrl ? (
                  <Image source={{ uri: offer.imageUrl }} style={s.OvImg} resizeMode="cover" />
                ) : (
                  <View style={s.OvImgPlaceholder}>
                    <MaterialIcons name="local-offer" size={28} color={COLORS.sky} />
                  </View>
                )}
                <View style={s.OvBadge}>
                  <Text style={s.OvBadgeText}>{offer.discount}</Text>
                </View>
              </View>

              <View style={s.OvCardBody}>
                <View style={s.OvTitleRow}>
                  <Text style={s.OvCardTitle} numberOfLines={1}>{offer.title}</Text>
                  <View style={[s.OvChip, { backgroundColor: sc + '18' }]}>
                    <View style={[s.OvDot, { backgroundColor: sc }]} />
                    <Text style={[s.OvChipText, { color: sc }]}>{offer.statusLabel || offer.status}</Text>
                  </View>
                  <TouchableOpacity hitSlop={8} onPress={() => onOfferMenu(offer)} disabled={isBusy}>
                    <Ionicons name="ellipsis-vertical" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={s.OvMetaRow}>
                  <PalPointsIcon size={13} />
                  <Text style={s.OvMetaText}>{offer.points} pts</Text>
                  <Text style={s.OvMetaSep}>·</Text>
                  <MaterialIcons name="shopping-cart" size={12} color={COLORS.textMuted} />
                  <Text style={s.OvMetaText}>Min. {offer.minBill}</Text>
                </View>
                <View style={s.OvMetaRow}>
                  <MaterialIcons name="event" size={12} color={COLORS.textMuted} />
                  <Text style={s.OvMetaText}>Valid till: {offer.validUntil}</Text>
                  <Text style={s.OvMetaSep}>·</Text>
                  <MaterialIcons name="access-time" size={12} color={COLORS.textMuted} />
                  <Text style={s.OvMetaText}>{offer.timeRange}</Text>
                </View>

                {offer.status !== 'Draft' ? (
                  <View style={s.OvRedeemBar}>
                    <View style={s.OvStatMiniItem}>
                      <Ionicons name="eye-outline" size={12} color={COLORS.textMuted} />
                      <Text style={s.OvRedeemBarText}>{offer.views || 0} Views</Text>
                    </View>
                    <View style={s.OvStatMiniItem}>
                      <MaterialIcons name="card-giftcard" size={12} color={COLORS.textMuted} />
                      <Text style={s.OvRedeemBarText}>{offer.redemptions} Redeems</Text>
                    </View>
                    <View style={s.OvStatMiniItem}>
                      <MaterialIcons name="access-time" size={12} color={COLORS.textMuted} />
                      <Text style={s.OvRedeemBarText}>{offer.daysLeft} Days Left</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={s.OvActionRow}>
              {offer.status !== 'Expired' ? (
                <TouchableOpacity
                  style={s.OvActionBtn}
                  activeOpacity={0.7}
                  disabled={isBusy}
                  onPress={() => handleToggle(offer.id, offer.isActive)}
                >
                  <MaterialIcons name={offer.isActive ? 'pause' : 'play-arrow'} size={15} color={COLORS.skyDeep} />
                  <Text style={s.OvActionText}>{offer.isActive ? 'Pause' : 'Resume'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={s.OvActionBtn}
                activeOpacity={0.7}
                disabled={isBusy}
                onPress={() => onEditOffer?.(offer.id)}
              >
                <MaterialIcons name="edit" size={15} color={COLORS.skyDeep} />
                <Text style={s.OvActionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.OvActionBtn}
                activeOpacity={0.7}
                disabled={isBusy}
                onPress={() => openStats(offer.id, offer.title)}
              >
                <MaterialIcons name="equalizer" size={14} color="#3B1E12" />
                <Text style={s.OvActionText}>Stats</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.OvActionBtn, { borderRightWidth: 0 }]}
                activeOpacity={0.7}
                disabled={isBusy}
                onPress={() => handleDelete(offer.id, offer.title)}
              >
                <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
                <Text style={[s.OvActionText, { color: '#EF4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>

    <OfferStatsModal
      visible={!!statsOffer}
      offerId={statsOffer?.id || null}
      offerTitle={statsOffer?.title}
      onClose={() => setStatsOffer(null)}
      onEdit={() => {
        const id = statsOffer?.id;
        setStatsOffer(null);
        if (id) onEditOffer?.(id);
      }}
    />

    {/* Custom Offer Action Modal (3-Dots Menu) */}
    <Modal
      visible={!!actionMenuOffer}
      transparent
      animationType="fade"
      onRequestClose={() => setActionMenuOffer(null)}
    >
      <View style={s.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setActionMenuOffer(null)}
        />
        <View style={s.actionModalContainer}>
          {/* Top Close Button */}
          <TouchableOpacity
            style={s.actionModalCloseBtn}
            onPress={() => setActionMenuOffer(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color="#21140E" />
          </TouchableOpacity>

          {/* Offer Info Header */}
          <View style={s.actionModalHeader}>
            {actionMenuOffer?.imageUrl ? (
              <Image source={{ uri: actionMenuOffer.imageUrl }} style={s.actionModalThumb} />
            ) : (
              <View style={[s.actionModalThumb, s.actionModalThumbFallback]}>
                <MaterialIcons name="local-offer" size={24} color="#B9834B" />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.actionModalTitle} numberOfLines={2}>
                {actionMenuOffer?.title || 'Offer'}
              </Text>
              <View style={s.actionModalSubRow}>
                <View style={s.actionModalStatusDotRow}>
                  <View
                    style={[
                      s.actionModalStatusDot,
                      { backgroundColor: actionMenuOffer?.isActive ? '#059669' : '#B9834B' },
                    ]}
                  />
                  <Text
                    style={[
                      s.actionModalStatusText,
                      { color: actionMenuOffer?.isActive ? '#059669' : '#B9834B' },
                    ]}
                  >
                    {actionMenuOffer?.isActive ? 'Active' : 'Paused'}
                  </Text>
                </View>
                <Text style={s.actionModalSubSep}>|</Text>
                <Ionicons name="calendar-outline" size={12} color="#8B7355" />
                <Text style={s.actionModalSubText}>
                  Valid till: {actionMenuOffer?.validUntil || 'No expiry'}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.actionModalDashedLine} />

          <Text style={s.actionModalSectionTitle}>Choose an action for this offer</Text>

          {/* Card 1: View Statistics */}
          <TouchableOpacity
            style={s.actionCardStats}
            activeOpacity={0.8}
            onPress={() => {
              const offer = actionMenuOffer;
              setActionMenuOffer(null);
              if (offer) openStats(offer.id, offer.title);
            }}
          >
            <View style={s.actionIconWrapStats}>
              <MaterialCommunityIcons name="trending-up" size={22} color="#0F5B37" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.actionCardTitleStats}>View Statistics</Text>
              <Text style={s.actionCardSubStats}>See performance and redemption details</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#0F5B37" />
          </TouchableOpacity>

          {/* Card 2: Edit Offer */}
          <TouchableOpacity
            style={s.actionCardEdit}
            activeOpacity={0.8}
            onPress={() => {
              const offer = actionMenuOffer;
              setActionMenuOffer(null);
              if (offer) onEditOffer?.(offer.id);
            }}
          >
            <View style={s.actionIconWrapEdit}>
              <MaterialCommunityIcons name="square-edit-outline" size={22} color="#4A2B11" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.actionCardTitleEdit}>Edit Offer</Text>
              <Text style={s.actionCardSubEdit}>Update offer details, price, validity and more</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#4A2B11" />
          </TouchableOpacity>

          {/* Card 3: Pause / Resume Offer */}
          {actionMenuOffer?.status !== 'Expired' ? (
            <TouchableOpacity
              style={s.actionCardToggle}
              activeOpacity={0.8}
              onPress={() => {
                const offer = actionMenuOffer;
                setActionMenuOffer(null);
                if (offer) handleToggle(offer.id, offer.isActive);
              }}
            >
              <View style={s.actionIconWrapToggle}>
                <Ionicons
                  name={actionMenuOffer?.isActive ? 'pause-outline' : 'play-outline'}
                  size={20}
                  color="#1E429F"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionCardTitleToggle}>
                  {actionMenuOffer?.isActive ? 'Pause Offer' : 'Resume Offer'}
                </Text>
                <Text style={s.actionCardSubToggle}>
                  {actionMenuOffer?.isActive
                    ? 'Temporarily hide this offer from users'
                    : 'Make this offer active and visible to users'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#1E429F" />
            </TouchableOpacity>
          ) : null}

          {/* Card 4: Delete Offer */}
          <TouchableOpacity
            style={s.actionCardDelete}
            activeOpacity={0.8}
            onPress={() => {
              const offer = actionMenuOffer;
              setActionMenuOffer(null);
              if (offer) handleDelete(offer.id, offer.title);
            }}
          >
            <View style={s.actionIconWrapDelete}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#D93838" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.actionCardTitleDelete}>Delete Offer</Text>
              <Text style={s.actionCardSubDelete}>Permanently delete this offer</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D93838" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

export default function VendorDashboardScreen({
  onBack: _onBack, onLogout, onCreateOffer, onEditOffer,
  onViewMyOffers,
  onViewAnalytics, onViewProfile,
  canGoBack: _canGoBack = true,
  forcedTab,
  hideBottomNav = false,
}: VendorDashboardScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { currentVendor, vendorOffers, redemptions, refreshVendorData } = useDataContext();
  const { user, setActiveMode, onLogout: contextLogout } = useUserContext();
  const { entitlements, refreshEntitlements } = useEntitlements();
  const screenInsets = useVendorScreenInsets({ withTabBar: hideBottomNav });
  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(insets.bottom + 120, 140);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showVendorCode, setShowVendorCode] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState<'Home' | 'Offers' | 'Analytics' | 'Profile'>(forcedTab || 'Home');
  const [showSidebar, setShowSidebar] = useState(false);
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());
  const [uploadJobs, setUploadJobs] = useState<ReelUploadJob[]>([]);
  const visibleVendorUploadJobs = useMemo(
    () => uploadJobs.filter((j) => j.kind === 'VENDOR' && isUploadJobVisible(j)),
    [uploadJobs],
  );

  useEffect(() => {
    void creatorUploadManager.init();
    const unsubJobs = creatorUploadManager.subscribe(setUploadJobs);
    const unsubPosted = creatorUploadManager.onPosted((job) => {
      if (job.kind !== 'VENDOR') return;
      queryClient.invalidateQueries({ queryKey: ['vendor-reels'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-map-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-stats'] });
      queryClient.invalidateQueries({ queryKey: ['map-feed'] });
    });
    return () => {
      unsubJobs();
      unsubPosted();
    };
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(getUnreadBadgeCount());
      void refreshEntitlements();
      return subscribeUnreadBadge(setUnreadCount);
    }, [refreshEntitlements]),
  );
  const [activityMetric, setActivityMetric] = useState<ActivityMetric>('redemptions');
  const [dashStats, setDashStats] = useState<{
    todayRedemptions?: number;
    todayRevenue?: number;
    todayPalPoints?: number;
    totalViews?: number;
    totalClicks?: number;
    conversionRate?: number;
    pendingApproval?: number;
    activeOffers?: number;
    pausedOffers?: number;
    expiredOffers?: number;
    reelCount?: number;
  } | null>(null);
  const [pendingTaggedReels, setPendingTaggedReels] = useState<TaggedCreatorReel[]>([]);
  const [reviewingTaggedId, setReviewingTaggedId] = useState<string | null>(null);
  const [vendorPromoReels, setVendorPromoReels] = useState<VendorReel[]>([]);

  const visibleTab = forcedTab || activeTab;

  const loadDashboardStats = useCallback(async () => {
    if (!DEV_FLAGS.USE_SERVER_API) return;
    try {
      const res = await vendorsApi.getDashboard();
      const data = (res as any)?.data ?? res;
      const stats = data?.stats || {};
      setDashStats({
        todayRedemptions: Number(stats.todayRedemptions) || 0,
        todayRevenue: Number(stats.todayRevenue) || 0,
        todayPalPoints: Number(stats.todayPalPoints) || 0,
        totalViews: Number(stats.totalViews) || 0,
        totalClicks: Number(stats.totalClicks) || 0,
        conversionRate: Number(stats.conversionRate) || 0,
        pendingApproval: Number(stats.pendingApproval) || 0,
        activeOffers: Number(stats.activeOffers) || 0,
        pausedOffers: Number(stats.pausedOffers) || 0,
        expiredOffers: Number(stats.expiredOffers) || 0,
        reelCount: Number(stats.reelCount) || 0,
      });
      const pending = Array.isArray(data?.pendingTaggedReels) ? data.pendingTaggedReels : [];
      setPendingTaggedReels(pending);
    } catch {
      /* keep local fallbacks */
    }
  }, []);

  // Load once per tab mount — do NOT depend on refreshVendorData/loadDashboardStats
  // identity or currentVendor, or setCurrentVendor creates an infinite getMe loop (429).
  useEffect(() => {
    if (visibleTab !== 'Offers' && visibleTab !== 'Home') return;
    let cancelled = false;
    (async () => {
      try {
        await refreshVendorData();
        if (!cancelled && visibleTab === 'Home') {
          await loadDashboardStats();
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mount / forcedTab only
  }, [visibleTab]);

  const scrollY = useRef(new Animated.Value(0)).current;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshVendorData(), loadDashboardStats()]);
    } catch (err) {
    } finally {
      setRefreshing(false);
    }
  }, [refreshVendorData, loadDashboardStats]);

  const reviewTaggedReel = useCallback(async (reelId: string, action: 'allow' | 'reject') => {
    setReviewingTaggedId(reelId);
    try {
      if (action === 'allow') await vendorsApi.allowTaggedCreatorReel(reelId);
      else await vendorsApi.rejectTaggedCreatorReel(reelId);
      setPendingTaggedReels((prev) => prev.filter((r) => r.id !== reelId));
      queryClient.invalidateQueries({ queryKey: ['vendor-map-detail'] });
    } catch {
      Alert.alert('Could not update reel', 'Please try again.');
    } finally {
      setReviewingTaggedId(null);
    }
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (!DEV_FLAGS.USE_SERVER_API) return;
      void vendorsApi.listMyPendingTaggedReels()
        .then(setPendingTaggedReels)
        .catch(() => undefined);
    }, []),
  );

  const myOffers = useMemo(() => {
    if (!currentVendor) return [];
    const offerList = vendorOffers.filter(o => o.vendorId === currentVendor.id);
    return offerList.map(o => {
      const reds = redemptions.filter(r => r.offerId === o.id);
      return {
        ...o,
        currentRedemptions: o.currentRedemptions ?? reds.length,
        redemptions: o.currentRedemptions ?? reds.length,
        pointsRedeemed: reds.reduce((sum, r) => sum + (r.pointsSpent || 0), 0),
      };
    });
  }, [currentVendor, vendorOffers, redemptions]);

  const myRedemptions = useMemo(() => {
    if (!currentVendor) return [];
    return redemptions.filter(r => r.vendorId === currentVendor.id);
  }, [currentVendor, redemptions]);

  useEffect(() => {
    if (!currentVendor?.id || visibleTab !== 'Home' || !DEV_FLAGS.USE_SERVER_API) return;
    let cancelled = false;
    vendorsApi.getVendorReels(currentVendor.id)
      .then((reelsRes) => {
        if (cancelled) return;
        const list = (reelsRes as any)?.data ?? reelsRes;
        setVendorPromoReels(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setVendorPromoReels([]);
      });
    return () => { cancelled = true; };
  }, [currentVendor?.id, visibleTab]);

  const recentActivity = useMemo(
    () => buildVendorRecentActivity({
      redemptions: myRedemptions,
      offers: myOffers,
      reels: vendorPromoReels,
      limit: 8,
    }),
    [myRedemptions, myOffers, vendorPromoReels],
  );

  const verifiedRedemptions = useMemo(() => myRedemptions.filter(r => r.status === 'verified'), [myRedemptions]);
  const activeOffers = useMemo(
    () => myOffers.filter(o => getOfferLifecycleStatus(o) === 'Active'),
    [myOffers],
  );
  const pausedOffersCount = useMemo(
    () => myOffers.filter(o => getOfferLifecycleBadgeLabel(o) === 'Paused').length,
    [myOffers],
  );
  const expiredOffersCount = useMemo(
    () => myOffers.filter(o => getOfferLifecycleStatus(o) === 'Expired').length,
    [myOffers],
  );
  const totalPointsFromUsers = useMemo(
    () => myRedemptions.reduce((sum, r) => sum + (r.pointsSpent || 0), 0),
    [myRedemptions],
  );
  const uniqueVisitors = useMemo(() => {
    const ids = new Set(myRedemptions.map(r => r.userId));
    return ids.size;
  }, [myRedemptions]);

  const todayRedemptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return myRedemptions.filter(r => r.redeemedAt.slice(0, 10) === today).length;
  }, [myRedemptions]);

  const todayVisitors = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const ids = new Set(myRedemptions.filter(r => r.redeemedAt.slice(0, 10) === today).map(r => r.userId));
    return ids.size;
  }, [myRedemptions]);

  const repeatVisitors = useMemo(() => {
    const counts: Record<string, number> = {};
    myRedemptions.forEach(r => { counts[r.userId] = (counts[r.userId] || 0) + 1; });
    return Object.values(counts).filter(c => c > 1).length;
  }, [myRedemptions]);

  const _redemptionRate = useMemo(() => {
    if (myRedemptions.length === 0) return '0%';
    const pct = Math.round((verifiedRedemptions.length / myRedemptions.length) * 100);
    return `${pct}%`;
  }, [myRedemptions, verifiedRedemptions]);

  const _avgConversion = useMemo(() => {
    if (activeOffers.length === 0) return '0%';
    const perOffer = activeOffers.map(o => {
      const reds = myRedemptions.filter(r => r.offerId === o.id).length;
      return reds;
    });
    const avg = perOffer.reduce((a, b) => a + b, 0) / perOffer.length;
    return avg < 1 ? '<1' : Math.round(avg).toString();
  }, [activeOffers, myRedemptions]);

  const profileChecks = useMemo(() => {
    if (!currentVendor) {
      return { percent: 0, items: [] as { label: string; done: boolean; pending?: number }[] };
    }
    const hasProfile = !!(currentVendor.businessName && currentVendor.address && currentVendor.phone);
    const hasDocs = currentVendor.verificationStatus === 'approved';
    const amenityMissing = [
      !currentVendor.description,
      !currentVendor.openingHours && !(currentVendor as any).operatingHours,
      !currentVendor.website,
    ].filter(Boolean).length;
    const hasPhotos = !!currentVendor.imageUrl;
    const items = [
      { label: 'Business Profile', done: hasProfile },
      { label: 'Documents', done: hasDocs },
      { label: 'Amenities', done: amenityMissing === 0, pending: amenityMissing || undefined },
      { label: 'Photos & Media', done: hasPhotos },
    ];
    const doneCount = items.filter((i) => i.done).length;
    const percent = Math.round((doneCount / items.length) * 100);
    return { percent, items };
  }, [currentVendor]);

  const handleCopyId = async () => {
    if (!currentVendor) return;
    const code =
      currentVendor.vendorCode ||
      `VND-${currentVendor.id.slice(0, 8).toUpperCase()}`;
    const ok = await copyToClipboard(code, 'Vendor Code');
    if (ok) {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  const chartDateLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 6; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.getDate();
      const month = d.toLocaleString('en-US', { month: 'short' });
      labels.push(`${day} ${month}`);
    }
    labels.push('Today');
    return labels;
  }, []);

  const chartVisitorsData = useMemo(() => {
    const _today = new Date();
    return chartDateLabels.map((label, idx) => {
      const targetDate = new Date();
      if (label === 'Today') {
        targetDate.setHours(0, 0, 0, 0);
      } else {
        targetDate.setDate(targetDate.getDate() - (6 - idx));
        targetDate.setHours(0, 0, 0, 0);
      }
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const dayRedemptions = myRedemptions.filter(r => {
        const rd = new Date(r.redeemedAt);
        return rd >= targetDate && rd < nextDate;
      });
      const visitors = dayRedemptions.length;
      const unique = new Set(dayRedemptions.map(r => r.userId)).size;
      return { visitors, unique };
    });
  }, [myRedemptions, chartDateLabels]);

  const activitySeries = useMemo(() => {
    if (activityMetric === 'customers') {
      return chartVisitorsData.map((d) => d.unique);
    }
    if (activityMetric === 'views') {
      const totalViews = dashStats?.totalViews ?? 0;
      if (totalViews <= 0) return chartVisitorsData.map((d) => Math.max(0, d.visitors));
      const sumR = chartVisitorsData.reduce((s, d) => s + d.visitors, 0) || 1;
      return chartVisitorsData.map((d) => Math.round((d.visitors / sumR) * totalViews));
    }
    return chartVisitorsData.map((d) => d.visitors);
  }, [activityMetric, chartVisitorsData, dashStats?.totalViews]);

  const chartMaxY = useMemo(() => {
    const max = Math.max(...chartVisitorsData.map(d => Math.max(d.visitors, d.unique)), 10);
    const rounded = Math.ceil(max / 50) * 50;
    return rounded || 50;
  }, [chartVisitorsData]);

  const _chartYLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = chartMaxY; i >= 0; i -= chartMaxY / 4) {
      labels.push(Math.round(i).toString());
    }
    return labels;
  }, [chartMaxY]);

  const toggleSidebar = () => setShowSidebar(prev => !prev);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0.92],
    extrapolate: 'clamp',
  });

  // Hooks must run unconditionally — never after an early return
  const displayAddress = useMemo(() => {
    if (!currentVendor) return '';
    const parts = [currentVendor.address, currentVendor.city, currentVendor.state].filter(Boolean);
    const unique: string[] = [];
    for (const p of parts) {
      const lower = p.trim().toLowerCase();
      if (!unique.some(u => u.toLowerCase() === lower)) {
        unique.push(p.trim());
      }
    }
    return unique.join(', ');
  }, [currentVendor]);

  const _shortVendorId = useMemo(() => {
    if (!currentVendor) return '';
    const cityPart = (currentVendor.city || 'IND').slice(0, 3).toUpperCase();
    const catPart = (currentVendor.category || 'BIZ').slice(0, 4).toUpperCase();
    const numPart = currentVendor.id.slice(-4).toUpperCase();
    return `${cityPart}-${catPart}-${numPart}`;
  }, [currentVendor]);

  if (!currentVendor) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>Loading vendor data...</Text>
      </SafeAreaView>
    );
  }

  const isApproved = currentVendor.verificationStatus === 'approved';
  const vendorCode = currentVendor.vendorCode || '—';
  const category = currentVendor.category || 'business';

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header — Creator-style studio chrome (Home only) */}
      {visibleTab === 'Home' ? (
      <Animated.View style={[s.header, { opacity: headerOpacity, paddingTop: screenInsets.headerPadTop }]}>
        <TouchableOpacity onPress={toggleSidebar} style={s.headerBtn} accessibilityLabel="Open menu">
          <Ionicons name="menu" size={24} color={COLORS.skyDeep} />
        </TouchableOpacity>
        <View style={s.headerCopy}>
          <Text style={s.eyebrow}>Vendor Workspace</Text>
          <Text style={s.greeting} numberOfLines={1}>
            Welcome back, {currentVendor.businessName}
          </Text>
        </View>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => navigation.navigate('Notifications')}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.skyDeep} />
          {unreadCount > 0 ? (
            <View style={s.notifDot} />
          ) : null}
        </TouchableOpacity>
      </Animated.View>
      ) : null}

      {showNotifDropdown && (
        <NotificationsDropdown visible={showNotifDropdown} onClose={() => setShowNotifDropdown(false)} />
      )}

      {visibleTab === 'Home' || visibleTab === 'Offers' ? (
      <VendorWorkspaceSidebar
        visible={showSidebar}
        onClose={() => setShowSidebar(false)}
        user={user}
        vendor={currentVendor}
        offerCount={activeOffers.length}
        redemptionCount={myRedemptions.length}
        pointsReceived={totalPointsFromUsers}
        onNavigateOffers={() => {
          if (onViewMyOffers) onViewMyOffers();
          else navigation.navigate('VendorTabs', { screen: 'Offers' });
        }}
        onNavigateCreateOffer={onCreateOffer}
        onNavigateReels={() => navigation.navigate('VendorTabs', { screen: 'Promotions' })}
        onNavigateCreateReel={() => navigation.navigate('CreateVendorReel')}
        onNavigateAnalytics={() => {
          if (onViewAnalytics) onViewAnalytics();
          else navigation.navigate('VendorTabs', { screen: 'Statistics' });
        }}
        onNavigateCollaborations={() => navigation.navigate('CollaborationsDashboard', { bucket: 'incoming' })}
        onNavigateProfile={() => navigation.navigate('VendorTabs', { screen: 'Business' })}
        onNavigateCustomers={() => navigation.navigate('VendorCustomers')}
        onNavigateRedemption={() => navigation.navigate('VendorCustomers')}
        onNavigateSubscription={() => navigation.navigate('VendorSubscription')}
        onNavigateNotifications={() => navigation.navigate('Notifications')}
        onNavigateSettings={() => navigation.navigate('VendorSettings')}
        onNavigateLegal={() => navigation.navigate('LegalHub')}
        onSwitchToUser={() => setActiveMode('USER')}
        onLogout={() => {
          if (onLogout) onLogout();
          else void contextLogout();
        }}
      />
      ) : null}

      {visibleTab === 'Home' ? (
        <ScrollView
          style={s.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: contentPadBottom }}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.sky} />
          }
        >
          {/* Pending approval */}
          {!isApproved && (
            <View style={[
              s.statusBanner,
              currentVendor.verificationStatus === 'rejected' ? s.statusBannerRejected : s.statusBannerPending,
            ]}>
              <MaterialIcons
                name={currentVendor.verificationStatus === 'rejected' ? 'cancel' : 'hourglass-top'}
                size={18}
                color={currentVendor.verificationStatus === 'rejected' ? '#FF5A5F' : COLORS.sky}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.statusBannerTitle}>
                  {currentVendor.verificationStatus === 'rejected' ? 'Verification rejected' : 'Awaiting verification'}
                </Text>
                <Text style={s.statusBannerText}>
                  {currentVendor.verificationStatus === 'rejected'
                    ? (currentVendor.rejectedReason || 'Contact support to resubmit your documents.')
                    : 'Your business is under review. Offers stay hidden until approved.'}
                </Text>
              </View>
            </View>
          )}

          {visibleTab === 'Home' && visibleVendorUploadJobs.length > 0 ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={s.sectionTitle}>Uploading Reels</Text>
              {visibleVendorUploadJobs.map((job) => (
                  <ReelUploadStatusCard
                    key={job.localUploadId}
                    job={job}
                    onRetry={(id) => { void creatorUploadManager.retryUpload(id); }}
                    onDismiss={(id) => { void creatorUploadManager.clearFinished(id); }}
                    onViewReel={(reelId) => navigation.navigate('ReelDetail', { reelId })}
                  />
                ))}
            </View>
          ) : null}

          {pendingTaggedReels.length > 0 ? (
            <View style={{ marginBottom: 16, marginHorizontal: 16, gap: 10 }}>
              <Text style={s.sectionTitle}>Creator reels to review</Text>
              {pendingTaggedReels.map((reel) => (
                <TaggedReelReviewRow
                  key={reel.id}
                  reel={reel}
                  busy={reviewingTaggedId === reel.id}
                  onAllow={() => { void reviewTaggedReel(reel.id, 'allow'); }}
                  onReject={() => { void reviewTaggedReel(reel.id, 'reject'); }}
                  onOpen={() => navigation.navigate('ReelDetail', { reelId: reel.id })}
                />
              ))}
            </View>
          ) : null}

          {/* Hero Dark Business Card */}
          <View style={s.heroDarkCard}>
            <View style={s.heroTopPillsRow}>
              <View style={s.verifiedPillBadge}>
                <MaterialIcons name="verified" size={13} color="#34D399" />
                <Text style={s.verifiedPillText}>Verified Partner</Text>
              </View>
              {currentVendor.showOnMap !== false && isApproved ? (
                <View style={s.verifiedPillBadge}>
                  <Ionicons name="location-sharp" size={13} color="#34D399" />
                  <Text style={s.verifiedPillText}>On map</Text>
                </View>
              ) : null}
            </View>

            <View style={s.heroMainBodyRow}>
              <View style={s.heroLeftCol}>
                <View style={s.logoAvatarRingWrap}>
                  {currentVendor.imageUrl ? (
                    <Image source={{ uri: currentVendor.imageUrl }} style={s.logoAvatarImg} />
                  ) : (
                    <View style={s.logoAvatarFallback}>
                      <Text style={s.logoAvatarLetter}>{(currentVendor.businessName[0] || 'V').toUpperCase()}</Text>
                    </View>
                  )}
                  {isApproved ? (
                    <View style={s.logoBadgeOverlay}>
                      <MaterialCommunityIcons name="check-decagram" size={16} color="#F5C542" />
                    </View>
                  ) : null}
                </View>

                <View style={s.heroTitleBlock}>
                  <View style={s.heroNameBadgeRow}>
                    <Text style={s.heroDarkTitle} numberOfLines={1}>
                      {currentVendor.businessName}
                    </Text>
                    {isApproved ? (
                      <MaterialCommunityIcons name="check-decagram" size={18} color="#F5C542" />
                    ) : null}
                  </View>
                  <View style={s.heroCategoryRow}>
                    <MaterialCommunityIcons
                      name={
                        /restaurant|cafe|food|dining/i.test(String(category))
                          ? 'silverware-fork-knife'
                          : 'store-outline'
                      }
                      size={12}
                      color="rgba(255,249,242,0.85)"
                    />
                    <Text style={s.heroDarkCategory}>
                      {String(category).replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={s.heroDarkAddrRow}>
                    <Ionicons name="location-sharp" size={13} color="rgba(255,249,242,0.85)" />
                    <Text style={s.heroDarkAddrText} numberOfLines={2}>{displayAddress}</Text>
                  </View>
                </View>
              </View>

              <View style={s.heroRightCol}>
                <View style={s.heroCoverImageWrap}>
                  {currentVendor.imageUrl ? (
                    <Image source={{ uri: currentVendor.imageUrl }} style={s.heroCoverImg} />
                  ) : (
                    <View style={s.heroCoverFallback} />
                  )}
                  <View style={s.heroCoverGradient} />
                  <TouchableOpacity
                    style={s.editPhotosChipFrosted}
                    activeOpacity={0.88}
                    onPress={() => navigation.navigate('VendorSettings')}
                  >
                    <Ionicons name="image-outline" size={12} color="#FFFFFF" />
                    <Text style={s.editPhotosChipText}>Edit photos</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Business Code Box */}
            <View style={s.codeBoxContainer}>
              <View style={{ flex: 1 }}>
                <Text style={s.codeBoxLabel}>BUSINESS CODE</Text>
                <Text style={s.codeBoxValue} selectable>
                  {showVendorCode ? vendorCode : `${vendorCode.slice(0, Math.min(8, vendorCode.length))}••••`}
                </Text>
              </View>
              <View style={s.codeBoxActionBtns}>
                <TouchableOpacity
                  style={s.codeActionIconBtn}
                  onPress={() => setShowVendorCode(!showVendorCode)}
                  hitSlop={8}
                >
                  <Ionicons name={showVendorCode ? 'eye-off-outline' : 'eye-outline'} size={15} color="rgba(255,249,242,0.85)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.codeActionIconBtn}
                  onPress={handleCopyId}
                  hitSlop={8}
                >
                  <MaterialIcons name={copiedId ? 'check' : 'content-copy'} size={15} color={copiedId ? '#34D399' : 'rgba(255,249,242,0.85)'} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={s.viewListingGoldBtn}
              onPress={onViewProfile}
              activeOpacity={0.85}
            >
              <Text style={s.viewListingGoldText}>View listing</Text>
              <Feather name="external-link" size={13} color="#3B1E12" />
            </TouchableOpacity>
          </View>

          {/* 2-Column Hero Stat Cards */}
          <View style={s.twoStatRow}>
            <TouchableOpacity
              style={s.heroStatCard}
              onPress={() => {
                if (onViewMyOffers) onViewMyOffers();
                else navigation.navigate('VendorTabs', { screen: 'Offers' });
              }}
              activeOpacity={0.85}
            >
              <View style={[s.statCardIconCircle, { backgroundColor: '#FFF3E4' }]}>
                <Ionicons name="pricetag-outline" size={18} color="#E8A04A" />
              </View>
              <Text style={s.statCardLabel}>Active Offers</Text>
              <Text style={s.statCardValue}>{activeOffers.length}</Text>
              <Text style={[s.statCardLinkText, { color: '#E8A04A' }]}>View all offers &gt;</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.heroStatCard}
              onPress={() => navigation.navigate('VendorTabs', { screen: 'Promotions' })}
              activeOpacity={0.85}
            >
              <View style={[s.statCardIconCircle, { backgroundColor: '#FCEAF1' }]}>
                <Ionicons name="film-outline" size={18} color="#E07A9A" />
              </View>
              <Text style={s.statCardLabel}>Promotion Reels</Text>
              <Text style={s.statCardValue}>{dashStats?.reelCount ?? 0}</Text>
              <Text style={[s.statCardLinkText, { color: '#E07A9A' }]}>View all reels &gt;</Text>
            </TouchableOpacity>
          </View>

          {/* Today's Activity Section */}
          <View style={s.sectionWrap}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitleUpper}>TODAY'S ACTIVITY</Text>
              <TouchableOpacity onPress={onViewAnalytics} hitSlop={8}>
                <Text style={s.insightsViewAllText}>View all &gt;</Text>
              </TouchableOpacity>
            </View>

            <View style={s.activityFourColCard}>
              <View style={s.activityColItem}>
                <View style={[s.activityColIcon, { backgroundColor: 'rgba(5,150,105,0.12)' }]}>
                  <MaterialCommunityIcons name="gift-outline" size={16} color="#059669" />
                </View>
                <Text style={s.activityColValue}>{dashStats?.todayRedemptions ?? todayRedemptions}</Text>
                <Text style={s.activityColLabel}>PalPoints Redemptions</Text>
              </View>

              <View style={s.activityColItem}>
                <View style={[s.activityColIcon, { backgroundColor: 'rgba(139,107,181,0.12)' }]}>
                  <Ionicons name="pricetag-outline" size={16} color="#8B6BB5" />
                </View>
                <Text style={s.activityColValue}>{activeOffers.length}</Text>
                <Text style={s.activityColLabel}>Active Offers</Text>
              </View>

              <View style={s.activityColItem}>
                <View style={[s.activityColIcon, { backgroundColor: 'rgba(232,160,74,0.12)' }]}>
                  <Ionicons name="pause-circle-outline" size={16} color="#E8A04A" />
                </View>
                <Text style={s.activityColValue}>{dashStats?.pausedOffers ?? pausedOffersCount}</Text>
                <Text style={s.activityColLabel}>Paused Offers</Text>
              </View>

              <View style={s.activityColItem}>
                <View style={[s.activityColIcon, { backgroundColor: 'rgba(220,38,38,0.12)' }]}>
                  <Ionicons name="time-outline" size={16} color="#DC2626" />
                </View>
                <Text style={s.activityColValue}>{dashStats?.expiredOffers ?? expiredOffersCount}</Text>
                <Text style={s.activityColLabel}>Expired Offers</Text>
              </View>
            </View>
          </View>

          {/* Upgrade & Grow Banner */}
          <View style={s.sectionWrap}>
            <View style={s.upgradeBannerCard}>
              <View style={s.upgradeBannerBadge}>
                <Text style={s.upgradeBannerBadgeText}>UPGRADE & GROW</Text>
              </View>
              <MaterialCommunityIcons
                name="clipboard-check-outline"
                size={52}
                color="rgba(185,131,75,0.35)"
                style={s.upgradeBannerArt}
              />
              <View style={s.upgradeBannerHeaderRow}>
                <View style={s.upgradeBannerIconCircle}>
                  <MaterialCommunityIcons name="crown" size={20} color="#B9834B" />
                </View>
                <Text style={s.upgradeBannerTitle}>Unlock more features and grow your business</Text>
              </View>
              <Text style={s.upgradeBannerBody}>
                Upgrade your plan and get more visibility, offers, reels, analytics and rewards.
              </Text>
              <TouchableOpacity
                style={s.upgradeBannerBtn}
                onPress={() => navigation.navigate('VendorSubscription')}
                activeOpacity={0.85}
                accessibilityLabel="View subscription plans"
              >
                <Text style={s.upgradeBannerBtnText}>View Subscription Plans</Text>
                <Feather name="chevron-right" size={14} color="#FFF9F2" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Recent Activity */}
          <View style={s.sectionWrap}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={() => navigation.navigate('VendorCustomers')} hitSlop={8}>
                <Text style={s.insightsViewAllText}>View all &gt;</Text>
              </TouchableOpacity>
            </View>

            {recentActivity.length === 0 ? (
              <View style={s.recentActivityListCard}>
                <Text style={s.activityEmptyText}>
                  No recent activity yet. PalPoints redemptions, offers you create, and reels you publish will show up here.
                </Text>
              </View>
            ) : (
              <View style={s.recentActivityListCard}>
                {recentActivity.map((item, index) => {
                  const iconWrap =
                    item.kind === 'redemption'
                      ? { bg: 'rgba(5,150,105,0.12)', color: '#059669', name: 'gift-outline' as const }
                      : item.kind === 'offer'
                        ? { bg: 'rgba(139,107,181,0.12)', color: '#8B6BB5', name: 'pricetag-outline' as const }
                        : { bg: 'rgba(224,122,154,0.12)', color: '#E07A9A', name: 'film-outline' as const };
                  const badge =
                    item.badge === 'Paused' || item.badge === 'Cancelled'
                      ? { bg: '#FEF3C7', color: '#92400E' }
                      : item.badge === 'Pending'
                        ? { bg: '#EEF2FF', color: '#4338CA' }
                        : { bg: '#E6F4EA', color: '#137333' };
                  return (
                    <View
                      key={item.id}
                      style={[
                        s.activityItemRow,
                        index === recentActivity.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={[s.activityItemIcon, { backgroundColor: iconWrap.bg }]}>
                        <Ionicons name={iconWrap.name} size={16} color={iconWrap.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.activityItemTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={s.activityItemSub} numberOfLines={1}>{item.subtitle}</Text>
                      </View>
                      <View style={[s.activityBadgePill, { backgroundColor: badge.bg }]}>
                        <Text style={[s.activityBadgeText, { color: badge.color }]}>{item.badge}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {!hideBottomNav ? (
          /* 7-day activity — legacy standalone dashboard only */
          <View style={s.sectionWrap}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>7-day activity</Text>
              <TouchableOpacity style={s.insightsViewAllBtn} onPress={onViewAnalytics}>
                <Text style={s.insightsViewAllText}>Full analytics ›</Text>
              </TouchableOpacity>
            </View>
            <View style={s.insightsCard}>
              <View style={s.activityBody}>
                <View style={s.activityTabs}>
                  {([
                    { key: 'redemptions' as const, label: 'Redemptions' },
                    { key: 'views' as const, label: 'Offer views' },
                    { key: 'customers' as const, label: 'Unique customers' },
                  ]).map((tab) => {
                    const active = activityMetric === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        style={[s.activityTab, active && s.activityTabActive]}
                        onPress={() => setActivityMetric(tab.key)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.activityTabText, active && s.activityTabTextActive]}>{tab.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={s.activityChartCol}>
                  <ActivityLineChart values={activitySeries} labels={chartDateLabels} />
                </View>
              </View>

              <View style={s.activityKpiRow}>
                {[
                  { icon: 'people-outline' as const, label: 'Total Visitors', value: myRedemptions.length },
                  { icon: 'person-add-outline' as const, label: 'New Visitors', value: Math.max(0, uniqueVisitors - repeatVisitors) },
                  { icon: 'refresh-outline' as const, label: 'Returning', value: repeatVisitors },
                  { icon: 'person-outline' as const, label: 'Unique', value: uniqueVisitors },
                ].map((kpi) => (
                  <View key={kpi.label} style={s.activityKpi}>
                    <Ionicons name={kpi.icon} size={14} color={COLORS.sky} />
                    <Text style={s.activityKpiValue}>{kpi.value}</Text>
                    <Text style={s.activityKpiLabel}>{kpi.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          ) : null}


        </ScrollView>
      ) : visibleTab === 'Offers' ? (
        <OffersView
          onCreateOffer={onCreateOffer}
          onEditOffer={onEditOffer}
          totalOffers={myOffers.length}
          activeOffers={activeOffers.length}
          totalRedemptions={myRedemptions.length}
          offerViews={dashStats?.totalViews ?? 0}
          offers={myOffers}
          refreshing={refreshing}
          onRefresh={onRefresh}
          scrollPadBottom={contentPadBottom}
          padTop={screenInsets.headerPadTop}
          vendor={currentVendor}
          onOpenMenu={toggleSidebar}
          onOpenNotifications={() => navigation.navigate('Notifications')}
        />
      ) : null}

      {/* Bottom Navigation — hidden when VendorTabs owns chrome */}
      {!hideBottomNav ? (
      <View style={s.bottomNav}>
        {NAV_ITEMS.map((item) => {
          const isActive = visibleTab === item.key;
          const IconComp =
            item.iconSet === 'Feather' ? Feather :
            item.iconSet === 'Ionicons' ? Ionicons :
            MaterialIcons;
          const onTabPress = () => {
            setActiveTab(item.key as typeof activeTab);
            if (item.key === 'Home') { /* already here */ }
            if (item.key === 'Analytics') onViewAnalytics?.();
            if (item.key === 'Profile') onViewProfile?.();
          };
          return (
            <TouchableOpacity key={item.key} style={s.navItem} onPress={onTabPress}>
              <IconComp
                name={item.icon}
                size={22}
                color={isActive ? COLORS.sky : COLORS.textMuted}
              />
              {isActive && <View style={s.navActiveDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
      ) : null}

    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollView: {
    flex: 1,
  },

  // Header — paddingTop applied at runtime via useSafeAreaInsets
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: VendorUI.space.screen,
    paddingBottom: VendorUI.space.md,
    backgroundColor: COLORS.bg,
    gap: 10,
    zIndex: 10,
  },
  // Hero Dark Card styles
  heroDarkCard: {
    backgroundColor: '#21140E',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  heroTopPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  verifiedPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5, 150, 105, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.35)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
  },
  heroMainBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroLeftCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  logoAvatarRingWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#F5C542',
    backgroundColor: '#3B2418',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  logoAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5A3A28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoAvatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF9F2',
  },
  logoBadgeOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroDarkTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF9F2',
    flexShrink: 1,
  },
  heroDarkCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,249,242,0.8)',
  },
  heroCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  heroDarkAddrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroDarkAddrText: {
    fontSize: 11,
    color: 'rgba(255,249,242,0.75)',
    flexShrink: 1,
  },
  heroRightCol: {
    width: 100,
    height: 100,
  },
  heroCoverImageWrap: {
    width: 100,
    height: 100,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#3B2418',
  },
  heroCoverImg: {
    width: '100%',
    height: '100%',
  },
  heroCoverFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#3B2418',
  },
  heroCoverGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 14, 8, 0.4)',
  },
  editPhotosChipFrosted: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  codeBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 249, 242, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 249, 242, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  codeBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,249,242,0.6)',
    letterSpacing: 0.8,
  },
  codeBoxValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF9F2',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  codeBoxActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeActionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,249,242,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewListingGoldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E8C8A0',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  viewListingGoldText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B1E12',
  },

  // 2-Column Hero Stat Cards
  twoStatRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDE6DC',
    shadowColor: 'rgba(30,16,8,0.06)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  statCardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B7355',
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#3B1E12',
    marginTop: 2,
    letterSpacing: -0.4,
  },
  statCardLinkText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
  },

  // Today's Activity Section
  sectionTitleUpper: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#8B7355',
  },
  activityFourColCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#EDE6DC',
    marginTop: 8,
  },
  activityColItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  activityColIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  activityColValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B1E12',
  },
  activityColLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8B7355',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
  },

  upgradeBannerCard: {
    backgroundColor: '#FFF4E8',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F5DFC8',
    overflow: 'hidden',
    position: 'relative',
  },
  upgradeBannerBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(185,131,75,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.25)',
  },
  upgradeBannerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#8B5A2B',
  },
  upgradeBannerArt: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  upgradeBannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 72,
  },
  upgradeBannerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF9F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0D9BC',
  },
  upgradeBannerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#3B1E12',
    lineHeight: 20,
  },
  upgradeBannerBody: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8B7355',
    lineHeight: 18,
    marginTop: 10,
    paddingRight: 56,
  },
  upgradeBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#21140E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  upgradeBannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF9F2',
  },

  // PalPoints Banner
  palPointsBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF9F2',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F5EBE0',
  },
  palPointsBannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3E8DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  palPointsBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3B1E12',
  },
  palPointsBannerSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8B7355',
    marginTop: 3,
    lineHeight: 15,
  },
  palPointsBannerBtn: {
    borderWidth: 1,
    borderColor: '#D4A87A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
  },
  palPointsBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#63300E',
  },
  headerCopy: {
    flex: 1,
    paddingHorizontal: 12,
  },


  // Recent Activity List
  recentActivityListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EDE6DC',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
  },
  activityItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3E8DC',
  },
  activityItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B1E12',
  },
  activityItemSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8B7355',
    marginTop: 2,
  },
  activityBadgePill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  activityEmptyText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B7355',
    lineHeight: 19,
    paddingVertical: 16,
    textAlign: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: COLORS.sky,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 4,
    letterSpacing: -0.3,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  handle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 2,
  },
  notifDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.skyDeep,
    letterSpacing: -0.5,
  },
  vendorText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.sky,
    letterSpacing: -0.5,
  },


  // Notifications Dropdown
  notifDropdown: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 60,
    right: 16,
    left: 16,
    maxHeight: 420,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notifHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  notifHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.skyDeep,
  },
  notifBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  notifCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.skyPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  notifDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginTop: 6,
    marginLeft: 8,
  },
  notifFooter: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifFooterBtn: {
    paddingVertical: 4,
  },
  notifFooterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.sky,
  },

  // Hero Card — Creator-style white bordered surface
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroCardInner: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  heroDecoCircle1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.sky + '0D',
  },
  heroDecoCircle2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.skyLight + '30',
  },
  heroTopRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#B9834B12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#B9834B28',
    alignSelf: 'flex-start',
  },
  verifiedBadgeApproved: {
    backgroundColor: '#6B8F7112',
    borderColor: '#6B8F7130',
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.sky,
    letterSpacing: 0.2,
  },
  verifiedTextApproved: {
    color: COLORS.success,
  },
  heroBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  heroBodyLeft: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  heroBodyRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPhotoWrap: {
    width: 108,
    height: 108,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroAvatarAdd: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.skyVeryPale,
  },
  editPhotosChip: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(77, 50, 39, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  editPhotosChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroBusinessName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  heroRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 14,
  },
  heroLocationText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.skyDeep,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  editProfileText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroMetaRow: {
    marginTop: 16,
    marginHorizontal: -16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    gap: 10,
  },
  heroMetaCard: {
    flex: 1,
    backgroundColor: COLORS.skyPale,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroMetaLink: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.sky,
    marginTop: 4,
  },
  heroFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  heroFooterValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  heroFooterValue: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  heroFooterValueAccent: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.skyDeep,
    letterSpacing: -0.4,
  },
  heroFooterAction: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  homeSplitRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
  },
  homeSplitCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    minHeight: 168,
  },
  homeSplitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 4,
  },
  homeSplitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  homeSplitTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.2,
  },
  homeSplitLink: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.sky,
  },
  healthBody: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  healthRingCol: {
    alignItems: 'center',
    width: 78,
  },
  healthRingCaption: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 12,
  },
  healthChecklist: {
    flex: 1,
    gap: 7,
  },
  healthCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  healthCheckLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  healthPending: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.warning,
  },
  todayList: {
    gap: 10,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  todayLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  activityBody: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  activityTabs: {
    width: 86,
    gap: 6,
  },
  activityTab: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.skyPale,
  },
  activityTabActive: {
    backgroundColor: 'rgba(166, 124, 82, 0.18)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  activityTabText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  activityTabTextActive: {
    color: COLORS.skyDeep,
  },
  activityChartCol: {
    flex: 1,
    minWidth: 0,
  },
  activityKpiRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  activityKpi: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  activityKpiValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  activityKpiLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Mini Stats Card
  miniStatsCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  miniStatsGradient: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
  },
  miniStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  miniStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  miniStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // Sections
  sectionWrap: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  quickOverviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  quickOverviewCard: {
    width: '47%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  quickOverviewValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  quickOverviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  palPointsCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
  },
  palPointsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  palPointsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  palPointsSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  palPointsCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.skyPale,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  palPointsCode: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.skyDeep,
    letterSpacing: 0.5,
    flex: 1,
  },
  palPointsCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  palPointsCopyText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.sky,
  },
  emptyActivity: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
    gap: 6,
  },
  emptyActivityText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptyActivitySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },
  activityRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(5,150,105,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  activityRowSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.sky,
    backgroundColor: COLORS.skyPale,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.sky,
  },
  createOfferBtn: {
    borderRadius: 24,
    overflow: 'hidden',
    height: 130,
    shadowColor: '#B9834B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  createOfferGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  coDecoCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  coDecoCircle2: {
    position: 'absolute',
    bottom: -40,
    left: 80,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  coLeftContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coGiftBox: {
    width: 60,
    height: 60,
    alignItems: 'center',
  },
  coGiftLid: {
    width: 60,
    height: 14,
    backgroundColor: '#8B6B3A',
    borderRadius: 4,
    position: 'relative',
    alignItems: 'center',
  },
  coGiftRibbonH: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  coGiftBow: {
    position: 'absolute',
    top: -7,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  coGiftBody: {
    width: 60,
    height: 46,
    backgroundColor: '#B9834B',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coGiftRibbonV: {
    width: 5,
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  coRightContent: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '70%',
  },
  coTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  coTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2C1810',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  coPlus: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8B6B3A',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
    marginLeft: 6,
  },
  coSubtitle: {
    fontSize: 12,
    color: '#63300E',
    lineHeight: 16,
    textAlign: 'center',
  },

  // Performance Cards Grid
  perfGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  performanceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  perfIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  perfValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.skyDeep,
    letterSpacing: -0.5,
  },
  perfLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Insights Card
  insightsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  insightsChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  insightsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  insightsHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.skyPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightsTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  insightsChartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.skyDeep,
    letterSpacing: -0.3,
  },
  insightsChartSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  insightsViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  insightsViewAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.sky,
  },
  chartContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    height: 160,
    marginBottom: 8,
  },
  chartYAxis: {
    width: 30,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  chartYLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#B8A88A',
    textAlign: 'right',
    paddingRight: 8,
  },
  chartArea: {
    flex: 1,
    position: 'relative',
    paddingBottom: 24,
  },
  chartGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#FFFFFF',
  },
  chartDot: {
    position: 'absolute',
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#63300E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginLeft: -4,
    marginBottom: -4,
  },
  chartXAxis: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  chartXLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#B8A88A',
  },
  chartLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 16,
  },
  legendCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  insightsDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 20,
  },
  kpiSingleCard: {
    backgroundColor: COLORS.skyPale,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiPartition: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 2,
  },
  kpiDividerVer: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
  kpiDividerHor: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.skyDeep,
    letterSpacing: -0.5,
  },

  // Redemption Cards
  redemptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  redemptionLeft: {
    marginRight: 12,
  },
  touristAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.skyPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redemptionCenter: {
    flex: 1,
  },
  touristName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  rewardName: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  redemptionTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  redemptionRight: {
    alignItems: 'flex-end',
  },
  pointsUsed: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.sky,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyRedemptions: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Promotion Banner
  promoBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 8,
  },
  promoGradient: {
    padding: 16,
    position: 'relative',
  },
  promoDecoCircle1: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  promoDecoCircle2: {
    position: 'absolute',
    bottom: 80,
    left: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(197,222,222,0.4)',
  },
  promoDecoCircle3: {
    position: 'absolute',
    top: 100,
    right: 40,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  promoIllustrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 16,
  },
  promoPhoneWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promoPhoneBody: {
    width: 52,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2D2D44',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  promoPhoneScreen: {
    width: 44,
    height: 76,
    borderRadius: 8,
    backgroundColor: '#0F0F23',
    overflow: 'hidden',
  },
  promoPhoneNotch: {
    width: 20,
    height: 4,
    backgroundColor: '#1A1A2E',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 4,
  },
  promoPhoneContent: {
    flex: 1,
    padding: 4,
    gap: 3,
    justifyContent: 'center',
  },
  promoPhoneShopIcon: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#B9834B',
    alignSelf: 'center',
    marginBottom: 2,
  },
  promoPhoneReelBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4A87A',
    width: '80%',
    alignSelf: 'center',
  },
  promoPhoneReelBar2: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8B6B3A',
    width: '60%',
    alignSelf: 'center',
  },
  promoMegaphone: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  promoFloatingIcons: {
    flexDirection: 'column',
    gap: 6,
  },
  promoFloatIcon: {
    fontSize: 16,
  },
  promoPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(200,132,24,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(200,132,24,0.15)',
  },
  promoPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.skyDeep,
  },
  promoHeadline: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.skyDeep,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  promoSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  promoFeatureCards: {
    gap: 6,
    marginBottom: 16,
  },
  promoFeatureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  promoFeatureIcon: {
    fontSize: 18,
  },
  promoFeatureInfo: {
    flex: 1,
  },
  promoFeatureTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.skyDeep,
    marginBottom: 1,
  },
  promoFeatureDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 13,
  },
  promoGlassTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B9834B',
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  promoCtaBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: COLORS.sky,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  promoCtaBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  promoFooter: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B8A88A',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: 16,
  },

  // Bottom Navigation
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  navActiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.sky,
    marginTop: 4,
  },

  // Offers View
  OvHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4,
  },
  OvHeaderLeft: { flex: 1, marginRight: 12 },
  OvTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3, marginBottom: 2 },
  OvSubtitle: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 },
  usageBar: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E9D4BE', padding: 12 },
  usageBarInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  usageBarText: { fontSize: 13, fontWeight: '700', color: '#4D3227' },
  upgradeLink: { fontSize: 12, fontWeight: '800', color: '#B9834B' },
  usageTrack: { height: 6, backgroundColor: '#FFFFFF', borderRadius: 3, overflow: 'hidden' },
  usageFill: { height: '100%', backgroundColor: '#B9834B', borderRadius: 3 },
  OvCreateBtn: {
    height: 38, borderRadius: 20, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.skyDeep,
  },
  OvCreateBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  OvStatsGrid: {
    flexDirection: 'row', paddingHorizontal: 16,
    gap: 8, marginTop: 12,
  },
  OvStatCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  OvStatCardActive: {
    backgroundColor: 'rgba(5,150,105,0.06)',
    borderColor: 'rgba(5,150,105,0.22)',
  },
  OvStatGradient: {
    padding: 12, alignItems: 'center',
    minHeight: 90,
    backgroundColor: COLORS.white,
  },
  OvStatIcon: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  OvStatValue: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  OvStatLabel: { fontSize: 9, fontWeight: '600', color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },
  OvStatSub: { fontSize: 8, fontWeight: '500', color: COLORS.textMuted, marginTop: 1, textAlign: 'center' },

  OvTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  OvTopIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  OvNotifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  OvNotifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  OvBrand: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.skyDeep,
    letterSpacing: -0.3,
  },
  OvBizCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#3B2418',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  OvBizThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#5A3A28' },
  OvBizThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  OvBizNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  OvBizName: { fontSize: 15, fontWeight: '800', color: '#FFF9F2', flexShrink: 1 },
  OvBizLocRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  OvBizLoc: { fontSize: 11, color: 'rgba(255,249,242,0.75)', flexShrink: 1 },
  OvCodePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  OvCodeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  OvFilterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
  },
  OvFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  OvFilterChipActive: {
    backgroundColor: COLORS.skyDeep,
    borderColor: COLORS.skyDeep,
  },
  OvFilterChipText: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  OvFilterChipTextActive: { color: '#FFFFFF' },
  OvFilterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  OvSectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
  },
  OvStatMiniItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  OvFilterCard: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  OvFilterSection: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  OvFilterRow: { flexDirection: 'row', gap: 2, paddingVertical: 2 },
  OvFilterTab: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    position: 'relative',
  },
  OvFilterText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  OvFilterTextActive: { color: COLORS.skyDeep, fontWeight: '800' },
  OvFilterLine: {
    position: 'absolute', bottom: 2, left: 14, right: 14, height: 3,
    backgroundColor: COLORS.sky, borderRadius: 2,
  },
  OvFilterHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
  },
  OvFilterHintDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  OvFilterHint: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  OvFilterBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.skyPale, justifyContent: 'center', alignItems: 'center',
    marginLeft: 6,
  },
  filterDescCard: {
    marginHorizontal: 20, marginTop: 16,
    backgroundColor: COLORS.white, borderRadius: 16,
    padding: 14, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1,
  },
  filterDescLeft: { flex: 1, marginRight: 12 },
  filterDescHeading: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
  filterDescText: { fontSize: 11, color: COLORS.textMuted, lineHeight: 15 },
  filterDescIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  OvCard: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: COLORS.white, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  OvCardMain: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  OvCardRow: { flexDirection: 'row', padding: 16 },
  OvImgWrap: {
    width: 92, height: 92, borderRadius: 14, overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.skyPale,
  },
  OvImg: { width: '100%', height: '100%' },
  OvImgPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: COLORS.skyPale,
    justifyContent: 'center', alignItems: 'center',
  },
  OvBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: '#E8A04A',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },
  OvBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  OvCardBody: { flex: 1, minWidth: 0, gap: 8, justifyContent: 'center' },
  OvTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  OvChipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  OvMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  OvMetaSep: { color: COLORS.textMuted, fontSize: 11, marginHorizontal: 2 },
  OvInfo: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, gap: 4 },
  OvChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  OvDot: { width: 7, height: 7, borderRadius: 4 },
  OvChipText: { fontSize: 10, fontWeight: '800' },
  OvCardTitle: {
    flex: 1,
    fontSize: 16, fontWeight: '800', color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  OvMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  OvMetaText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  OvRedeemBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF7F2',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#EAE0D5',
    marginTop: 4,
  },
  OvRedeemBarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8B7355',
  },
  OvRedeemBarStrong: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  OvRedeemTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  OvRedeemTimeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  OvStatsMini: {
    width: 90, alignItems: 'center',
    backgroundColor: COLORS.skyPale,
    borderRadius: 10, paddingVertical: 6, gap: 2,
    borderWidth: 1, borderColor: COLORS.skyLight + '20',
  },
  OvStatsMiniVal: { fontSize: 14, fontWeight: '900', color: COLORS.textPrimary },
  OvStatsMiniLbl: { fontSize: 9, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  OvActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: '#FFFDF9',
  },
  OvActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLORS.border,
  },
  OvActionText: { fontSize: 11, fontWeight: '700', color: '#3B1E12' },

  // Home dashboard polish
  statusBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 14, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    borderWidth: 1,
  },
  statusBannerPending: { backgroundColor: '#B9834B12', borderColor: '#B9834B40' },
  statusBannerRejected: { backgroundColor: '#FF5A5F12', borderColor: '#FF5A5F40' },
  statusBannerTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
  statusBannerText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  mapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.22)',
  },
  mapDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  mapVisibilityText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  heroCategoryText: {
    fontSize: 12, color: COLORS.skyDark, fontWeight: '600',
    textTransform: 'capitalize', marginTop: 2, marginBottom: 8,
  },
  snapshotHeading: {
    fontSize: 12, fontWeight: '700', color: COLORS.textSecondary,
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  guideCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  guideTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  guideText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 14 },
  guideActions: { flexDirection: 'row', gap: 10 },
  guideBtnPrimary: {
    flex: 1, backgroundColor: COLORS.skyDeep, borderRadius: 20,
    paddingVertical: 12, alignItems: 'center',
  },
  guideBtnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  guideBtnSecondary: {
    flex: 1, backgroundColor: COLORS.skyPale, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  guideBtnSecondaryText: { color: COLORS.skyDeep, fontWeight: '700', fontSize: 13 },
  emptyCta: {
    marginTop: 12, backgroundColor: COLORS.skyPale, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  emptyCtaText: { color: COLORS.skyDeep, fontWeight: '700', fontSize: 13 },

  // Custom Offer Action Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionModalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  actionModalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F2EE',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  actionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 32,
  },
  actionModalThumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#F7F0E8',
  },
  actionModalThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#21140E',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  actionModalSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  actionModalStatusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionModalStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionModalStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionModalSubSep: {
    color: '#D4C9BD',
    fontSize: 12,
  },
  actionModalSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7A6B5D',
  },
  actionModalDashedLine: {
    height: 1,
    borderWidth: 1,
    borderColor: '#EFEAE3',
    borderStyle: 'dashed',
    marginVertical: 16,
  },
  actionModalSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6E6259',
    marginBottom: 14,
  },
  actionCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F4FBF7',
    borderWidth: 1,
    borderColor: '#E1F4E9',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  actionIconWrapStats: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E2F5EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitleStats: { fontSize: 14, fontWeight: '800', color: '#0F5B37' },
  actionCardSubStats: { fontSize: 11, fontWeight: '500', color: '#526D5E', marginTop: 2 },

  actionCardEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FDFBF7',
    borderWidth: 1,
    borderColor: '#F8EFE0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  actionIconWrapEdit: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FCEFDB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitleEdit: { fontSize: 14, fontWeight: '800', color: '#4A2B11' },
  actionCardSubEdit: { fontSize: 11, fontWeight: '500', color: '#735E4E', marginTop: 2 },

  actionCardToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F5F8FE',
    borderWidth: 1,
    borderColor: '#E4ECFA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  actionIconWrapToggle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E3EEFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitleToggle: { fontSize: 14, fontWeight: '800', color: '#1E429F' },
  actionCardSubToggle: { fontSize: 11, fontWeight: '500', color: '#506798', marginTop: 2 },

  actionCardDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF5F5',
    borderWidth: 1,
    borderColor: '#FDE2E2',
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
  },
  actionIconWrapDelete: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FDE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitleDelete: { fontSize: 14, fontWeight: '800', color: '#D93838' },
  actionCardSubDelete: { fontSize: 11, fontWeight: '500', color: '#9B5151', marginTop: 2 },
});
