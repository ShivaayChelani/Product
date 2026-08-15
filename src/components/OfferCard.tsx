import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '../utils/Icons';
import { colors, spacing, borderRadius, shadows } from '../config/theme';
import { VendorOffer, VendorBusiness, TouristSpot } from '../types';
import { getVendorCategoryEmoji } from '../data/vendors';

interface OfferCardProps {
  offer: VendorOffer;
  vendor: VendorBusiness;
  linkedSpot?: TouristSpot;
  userPoints: number;
  onRedeem: () => void;
  onViewDetails?: () => void;
  alreadyRedeemedToday?: boolean;
}

export default function OfferCard({
  offer,
  vendor,
  linkedSpot,
  userPoints,
  onRedeem,
  onViewDetails,
}: OfferCardProps) {
  const hasEnoughPoints = userPoints >= offer.pointsRequired;
  const pointsNeeded = offer.pointsRequired - userPoints;
  const categoryEmoji = getVendorCategoryEmoji(vendor.category);

  const discountLabel = offer.discountType === 'flat'
    ? `₹${offer.discountValue} OFF`
    : `${offer.discountValue}% OFF`;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.categoryEmoji}>{categoryEmoji}</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.businessName}>{vendor.businessName}</Text>
          <View style={styles.verifiedRow}>
            <Ionicons name="checkmark-circle" size={12} color={colors.success} />
            <Text style={styles.verifiedText}>Verified Vendor</Text>
          </View>
        </View>
        <View style={styles.discountBadge}>
          <Text style={styles.discountBadgeText}>{discountLabel}</Text>
        </View>
      </View>

      {linkedSpot && (
        <View style={styles.linkedSpotRow}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
          <Text style={styles.linkedSpotText}>Near {linkedSpot.name}</Text>
        </View>
      )}

      <Text style={styles.offerTitle}>{offer.offerTitle}</Text>
      <Text style={styles.offerDesc}>{offer.offerDescription}</Text>

      {offer.minBillAmount && (
        <Text style={styles.minBill}>Min. bill: ₹{offer.minBillAmount}</Text>
      )}

      <View style={styles.pointsRow}>
        <Ionicons name="trophy-outline" size={16} color={colors.gold} />
        <Text style={styles.pointsLabel}>
          {hasEnoughPoints ? 'You have enough points!' : `Need ${pointsNeeded} more points`}
        </Text>
        <Text style={styles.pointsValue}>{offer.pointsRequired} pts</Text>
      </View>

      <TouchableOpacity
        style={styles.redeemButton}
        onPress={onViewDetails ?? onRedeem}
        accessibilityRole="button"
        accessibilityLabel="View offer details"
      >
        <Ionicons name="gift-outline" size={16} color="#fff" />
        <Text style={styles.redeemButtonText}>View offer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryEmoji: {
    fontSize: 28,
    marginRight: spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  verifiedText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },
  discountBadge: {
    backgroundColor: colors.gold + '25',
    borderWidth: 1,
    borderColor: colors.gold + '50',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  discountBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
  },
  linkedSpotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  linkedSpotText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  offerDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  minBill: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gold + '10',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  pointsLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pointsValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gold,
  },
  redeemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  redeemButtonDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.6,
  },
  redeemButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  onePerDayNote: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
