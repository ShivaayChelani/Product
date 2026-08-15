import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '../utils/Icons';
import { colors, spacing, borderRadius, shadows } from '../config/theme';
import { UserProfile, VendorOffer, VendorBusiness } from '../types';
import { TouristSpot } from '../types';
import { getPlaces } from '../services/placesService';
import { getSpotById } from '../utils/placeUtils';
import OfferCard from '../components/OfferCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { RootStackParamList } from '../navigation/types';
import { rewardsApi } from '../services/api/rewards';

interface VendorOffersScreenProps {
  user: UserProfile;
  vendors: VendorBusiness[];
  vendorOffers: VendorOffer[];
  onRedeemOffer?: (offerId: string) => Promise<unknown>;
}

const FILTERS = [
  { key: 'all', label: 'All', emoji: '🎯' },
  { key: 'food', label: 'Food', emoji: '☕' },
  { key: 'stay', label: 'Stay', emoji: '🏨' },
  { key: 'guides', label: 'Guides', emoji: '🧭' },
  { key: 'travel', label: 'Travel', emoji: '🏍️' },
  { key: 'experiences', label: 'Experiences', emoji: '🎫' },
];

function getFilterGroup(category: string): string {
  if (['hotel', 'homestay'].includes(category)) return 'stay';
  if (['bike_rental', 'car_rental', 'vehicle_rental', 'travel_agent'].includes(category)) return 'travel';
  if (['cafe', 'restaurant', 'local_shop'].includes(category)) return 'food';
  if (['guide'].includes(category)) return 'guides';
  if (['boating', 'adventure', 'tour_experience', 'event_organizer'].includes(category)) return 'experiences';
  return 'all';
}

function mapRewardOfferToVendorOffer(item: any): VendorOffer {
  return {
    id: item.id,
    vendorId: item.vendorId || item.vendor?.id || '',
    offerTitle: item.title || item.offerTitle || '',
    title: item.title || item.offerTitle || '',
    description: item.description || '',
    offerDescription: item.description || item.offerDescription || '',
    discountType: item.discountType,
    discountValue: item.discountValue,
    pointsRequired: item.pointsRequired ?? 0,
    isActive: item.isActive !== false,
    imageUrl: item.imageUrl || item.banner || '',
    validTill: item.validTill,
    category: item.category || item.vendor?.businessType,
    currentRedemptions: item.currentRedemptions,
    minBillAmount: item.minBillAmount,
    linkedSpotId: item.linkedSpotId,
  } as VendorOffer;
}

export default function VendorOffersScreen({
  user,
  vendors,
  vendorOffers,
}: VendorOffersScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(insets.bottom + 120, 140);
  const [filter, setFilter] = useState<string>('all');
  const [allPlaces, setAllPlaces] = useState<TouristSpot[]>([]);
  const [remoteOffers, setRemoteOffers] = useState<VendorOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPublicOffers = useCallback(async () => {
    try {
      const res = await rewardsApi.listOffers({ limit: 50 });
      setRemoteOffers((res.data || []).map(mapRewardOfferToVendorOffer));
    } catch {
      // Keep prop/seed offers on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    getPlaces().then(setAllPlaces);
    setLoading(true);
    void loadPublicOffers();
  }, [loadPublicOffers]);

  const getVendorById = (id: string) => vendors.find(p => p.id === id);

  const sourceOffers = remoteOffers.length > 0 ? remoteOffers : vendorOffers;

  const filteredOffers = useMemo(() => {
    return sourceOffers.filter(offer => {
      if (!offer.isActive) return false;
      const vendor = getVendorById(offer.vendorId);
      const category = String(
        (offer as any).category || vendor?.category || (vendor as any)?.businessType || '',
      );
      if (vendor && vendor.verificationStatus && vendor.verificationStatus !== 'approved') {
        return false;
      }
      if (filter === 'all') return true;
      return getFilterGroup(category) === filter;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceOffers, vendors, filter]);

  const filterCategories = FILTERS;

  const openOfferDetail = (offerId: string) => {
    navigation.navigate('VendorOfferDetail', { offerId });
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Vendor Offers</Text>
          <Text style={styles.subtitle}>Redeem Pal Points and save during your trip</Text>
        </View>
      </View>

      <View style={styles.pointsCard}>
        <Ionicons name="trophy" size={24} color={colors.gold} />
        <View style={styles.pointsInfo}>
          <Text style={styles.pointsLabel}>Your Pal Points</Text>
          <Text style={styles.pointsValue}>{user.totalPoints || 0}</Text>
        </View>
      </View>

      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filterCategories.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.filterChip, (filter === cat.key) && styles.filterChipActive]}
              onPress={() => setFilter(cat.key)}
            >
              <Text style={styles.filterEmoji}>{cat.emoji}</Text>
              <Text style={[styles.filterLabel, (filter === cat.key) && styles.filterLabelActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && sourceOffers.length === 0 ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.contentContainerStyle, { paddingBottom: contentPadBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadPublicOffers();
            }}
          />
        }
      >
        {filteredOffers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎁</Text>
            <Text style={styles.emptyTitle}>No Offers Available</Text>
            <Text style={styles.emptyText}>
              Check back later for new vendor offers in this category.
            </Text>
          </View>
        ) : (
          filteredOffers.map(offer => {
            const vendor = getVendorById(offer.vendorId);
            const linkedSpot = offer.linkedSpotId ? getSpotById(allPlaces, offer.linkedSpotId) : undefined;
            if (!vendor) {
              return (
                <TouchableOpacity
                  key={offer.id}
                  style={styles.fallbackCard}
                  onPress={() => openOfferDetail(offer.id)}
                >
                  <Text style={styles.fallbackTitle}>{offer.offerTitle || (offer as any).title}</Text>
                  <Text style={styles.fallbackMeta}>{offer.pointsRequired || 0} PalPoints</Text>
                </TouchableOpacity>
              );
            }

            return (
              <OfferCard
                key={offer.id}
                offer={offer}
                vendor={vendor}
                linkedSpot={linkedSpot}
                userPoints={user.totalPoints || 0}
                onRedeem={() => openOfferDetail(offer.id)}
                onViewDetails={() => openOfferDetail(offer.id)}
              />
            );
          })
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  pointsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold + '40',
    gap: spacing.md,
    ...shadows.sm,
  },
  pointsInfo: {
    flex: 1,
  },
  pointsLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.gold,
  },
  filtersRow: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDark + '60',
  },
  filterEmoji: {
    fontSize: 14,
  },
  filterLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterLabelActive: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  contentContainerStyle: {
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  fallbackCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  fallbackMeta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
  },
});
