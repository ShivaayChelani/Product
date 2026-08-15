import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  PanResponder,
  Animated,
  ActivityIndicator,
  Share,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { MapExploreTheme as T } from '../features/mapExplore/theme';
import { useVendorMapDetail } from '../features/mapExplore/hooks/useVendorMapDetail';
import { vendorsApi } from '../services/api/vendors';
import TaggedReelReviewRow from './TaggedReelReviewRow';
import { mapVendorReelsToFeed } from '../features/mapExplore/utils/mapVendorReelToFeed';
import { formatOfferDiscount } from '../features/mapExplore/utils/vendorFilters';
import type { Reel } from '../types';

type Props = {
  vendorId: string;
  distanceLabel?: string;
  bottomInset: number;
  navPreview?: { etaMin?: number; distanceKm?: string } | null;
  inItinerary?: boolean;
  addingToItinerary?: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onAddToTrip: () => void;
  onBookRide: () => void;
  onOpenProfile: () => void;
  onOpenReel: (reelId: string, extras?: { reels?: Reel[]; initialIndex?: number }) => void;
  onOpenVendorReels?: () => void;
  onViewAllOffers: () => void;
  onOpenOffer: (offerId: string) => void;
  onWriteReview?: () => void;
};

function formatReviews(rating?: number | null, count?: number): string | null {
  if (rating == null || rating <= 0) return null;
  const r = Number(rating).toFixed(1);
  if (count != null && count > 0) {
    const label = count >= 1000 ? `${(count / 1000).toFixed(1)}K reviews` : `${count} reviews`;
    return `${r} (${label})`;
  }
  return r;
}

function parseHoursStatus(operatingHours?: string | null): {
  isOpen: boolean | null;
  closesAt: string | null;
} {
  if (!operatingHours?.trim()) return { isOpen: null, closesAt: null };
  const lower = operatingHours.toLowerCase();
  if (lower.includes('closed')) return { isOpen: false, closesAt: null };
  const closesMatch = operatingHours.match(/(?:close|closes|till|–|-)\s*([\d:.]+\s*(?:am|pm)?)/i);
  return { isOpen: true, closesAt: closesMatch?.[1] ?? null };
}

export default function MapVendorDetailCard({
  vendorId,
  distanceLabel,
  bottomInset,
  navPreview,
  inItinerary,
  addingToItinerary,
  onClose,
  onNavigate,
  onAddToTrip,
  onBookRide,
  onOpenProfile,
  onOpenReel,
  onOpenVendorReels,
  onViewAllOffers,
  onOpenOffer,
  onWriteReview,
}: Props) {
  const { data: vendor, isLoading, isError, refetch } = useVendorMapDetail(vendorId);
  const translateY = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    translateY.setValue(48);
    Animated.spring(translateY, {
      toValue: 0,
      damping: 16,
      stiffness: 170,
      useNativeDriver: true,
    }).start();
  }, [vendorId, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.85) {
          Animated.timing(translateY, { toValue: 400, duration: 220, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const ratingLine = formatReviews(vendor?.rating, vendor?.reviewCount);
  const hours = parseHoursStatus(vendor?.operatingHours);
  const addr = vendor
    ? [vendor.city, vendor.state].filter(Boolean).join(', ')
    : '';

  const handleShare = async () => {
    if (!vendor) return;
    try {
      await Share.share({
        message: `Check out ${vendor.businessName} on PalSafar`,
      });
    } catch {
      /* cancelled */
    }
  };

  const vendorPromoReels = vendor?.showReels === false ? [] : (vendor?.vendorReels ?? []);
  const vendorFeed = vendor ? mapVendorReelsToFeed(vendorPromoReels, vendor) : [];

  const openVendorPromoReel = (reelId: string) => {
    const index = Math.max(0, vendorFeed.findIndex(r => r.id === reelId));
    onOpenReel?.(reelId, { reels: vendorFeed, initialIndex: index });
  };

  const handleReviewTagged = async (reelId: string, action: 'allow' | 'reject') => {
    setReviewingId(reelId);
    try {
      if (action === 'allow') await vendorsApi.allowTaggedCreatorReel(reelId);
      else await vendorsApi.rejectTaggedCreatorReel(reelId);
      await queryClient.invalidateQueries({ queryKey: ['vendor-map-detail', vendorId] });
      await refetch();
    } catch {
      Alert.alert('Could not update reel', 'Please try again.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <Animated.View
      style={[styles.wrap, { bottom: bottomInset, transform: [{ translateY }] }, T.shadow]}
    >
      <View {...panResponder.panHandlers} style={styles.handleRow}>
        <View style={styles.handle} />
      </View>

      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Icon name="close" size={20} color={T.textSecondary} />
      </TouchableOpacity>

      {isLoading && !vendor ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : isError || !vendor ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errText}>Unable to load vendor details.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Header Section */}
          <View style={styles.mainRow}>
            <View style={styles.imageCol}>
              {vendor.imageUrl || vendor.images?.[0] ? (
                <Image
                  source={{ uri: vendor.imageUrl || vendor.images[0] }}
                  style={styles.vendorImage}
                />
              ) : (
                <View style={[styles.vendorImage, styles.imagePlaceholder]}>
                  <Icon name="storefront-outline" size={32} color={T.textSecondary} />
                </View>
              )}
            </View>

            <View style={styles.infoCol}>
              <View style={styles.titleRow}>
                <TouchableOpacity onPress={onOpenProfile} style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {vendor.businessName}
                  </Text>
                </TouchableOpacity>
                <Icon name="checkmark-circle" size={18} color={T.secondary} style={styles.verifiedIcon} />
                <TouchableOpacity onPress={handleShare} hitSlop={8} style={styles.iconHit}>
                  <Icon name="share-outline" size={20} color={T.textSecondary} />
                </TouchableOpacity>
              </View>

              {addr ? <Text style={styles.subtitle} numberOfLines={1}>{addr}</Text> : null}
              
              {distanceLabel ? (
                <View style={styles.metaRow}>
                  <Icon name="navigate-outline" size={12} color={T.textSecondary} />
                  <Text style={styles.metaText}>{distanceLabel}</Text>
                </View>
              ) : null}
              
              {(hours.isOpen != null || hours.closesAt) && (
                <View style={styles.hoursRow}>
                  {hours.isOpen === true ? (
                    <View style={styles.openPill}>
                      <Text style={styles.openText}>Open Now</Text>
                    </View>
                  ) : hours.isOpen === false ? (
                    <View style={[styles.openPill, styles.closedPill]}>
                      <Text style={[styles.openText, styles.closedText]}>Closed</Text>
                    </View>
                  ) : null}
                  {hours.closesAt ? (
                    <Text style={styles.closesText}>Closes {hours.closesAt}</Text>
                  ) : vendor.operatingHours ? (
                    <Text style={styles.closesText} numberOfLines={1}>{vendor.operatingHours}</Text>
                  ) : null}
                </View>
              )}
              
              <View style={styles.partnerPill}>
                <Icon name="ribbon-outline" size={12} color={T.primary} />
                <Text style={styles.partnerText}>Premium Partner</Text>
              </View>

              <TouchableOpacity style={styles.ratingRow} onPress={onOpenProfile} activeOpacity={0.7}>
                {ratingLine ? (
                  <>
                    <Icon name="star" size={14} color="#FBBF24" />
                    <Text style={styles.ratingText}>{ratingLine}</Text>
                  </>
                ) : (
                  <Text style={styles.ratingText}>No ratings yet</Text>
                )}
                <Icon name="chevron-forward" size={14} color={T.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {vendor.isOwner && (vendor.pendingTaggedReels?.length ?? 0) > 0 ? (
            <View style={styles.pendingWrap}>
              {vendor.pendingTaggedReels.slice(0, 3).map((reel) => (
                <TaggedReelReviewRow
                  key={reel.id}
                  reel={reel}
                  busy={reviewingId === reel.id}
                  onAllow={() => { void handleReviewTagged(reel.id, 'allow'); }}
                  onReject={() => { void handleReviewTagged(reel.id, 'reject'); }}
                  onOpen={() => onOpenReel?.(reel.id)}
                />
              ))}
            </View>
          ) : null}

          {vendorPromoReels.length > 0 ? (
            <View style={styles.vendorReelsWrap}>
              <Text style={styles.vendorReelsLabel}>Business reels</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.vendorReelsRow}
              >
                {vendorPromoReels.map((reel) => {
                  const thumb = reel.thumbnail || reel.videoUrl;
                  return (
                    <TouchableOpacity
                      key={reel.id}
                      style={styles.vendorReelThumb}
                      onPress={() => openVendorPromoReel(reel.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={reel.title || 'Play business reel'}
                    >
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.vendorReelImage} />
                      ) : (
                        <View style={[styles.vendorReelImage, styles.vendorReelFallback]}>
                          <Icon name="videocam-outline" size={22} color="#8C7B6F" />
                        </View>
                      )}
                      <View style={styles.vendorReelPlay}>
                        <Icon name="play" size={14} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Discovery Tiles Section */}
          <View style={styles.tilesRow}>
            {/* Creator Reels Tile */}
            <TouchableOpacity
              style={[styles.discoveryTile, styles.reelsTileBg]}
              onPress={onOpenVendorReels}
              activeOpacity={0.8}
            >
              <View style={styles.tileHeader}>
                <View style={[styles.tileIconWrap, styles.reelsIconWrap]}>
                  <Icon name="videocam" size={20} color="#E8A631" />
                </View>
                <Icon name="chevron-forward" size={16} color={T.textSecondary} />
              </View>
              <Text style={styles.tileTitle}>Reels</Text>
              <Text style={styles.tileSubtitle}>
                {vendor.reelCount === 0 ? 'No Reels yet' : `${vendor.reelCount} Reels`}
              </Text>
            </TouchableOpacity>

            {/* Offers & Deals Tile */}
            <TouchableOpacity
              style={[styles.discoveryTile, styles.offersTileBg]}
              onPress={onViewAllOffers}
              activeOpacity={0.8}
            >
              <View style={styles.tileHeader}>
                <View style={[styles.tileIconWrap, styles.offersIconWrap]}>
                  <Icon name="pricetag" size={20} color="#9D65C9" />
                </View>
                <Icon name="chevron-forward" size={16} color={T.textSecondary} />
              </View>
              <Text style={styles.tileTitle}>Offers & Deals</Text>
              <Text style={styles.tileSubtitle} numberOfLines={1}>
                {vendor.offerCount === 0
                  ? 'No active offers'
                  : vendor.offers[0]?.title
                    ? vendor.offers[0].title
                    : `${vendor.offerCount} Offers`}
              </Text>
            </TouchableOpacity>
          </View>

          {vendor.offers.length > 0 ? (
            <View style={styles.offersPreviewWrap}>
              {vendor.offers.slice(0, 3).map((offer) => (
                <TouchableOpacity
                  key={offer.id}
                  style={styles.offerPreviewRow}
                  onPress={() => onOpenOffer(offer.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.offerPreviewIcon}>
                    <Icon name="pricetag" size={16} color="#9D65C9" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.offerPreviewTitle} numberOfLines={1}>{offer.title}</Text>
                    <Text style={styles.offerPreviewSub} numberOfLines={1}>
                      {formatOfferDiscount(offer)}
                      {offer.pointsRequired ? ` · ${offer.pointsRequired} PalPoints` : ''}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={T.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* Bottom Actions */}
          {onWriteReview ? (
            <TouchableOpacity style={styles.reviewBtn} onPress={onWriteReview} activeOpacity={0.85}>
              <Icon name="create-outline" size={18} color="#FFFFFF" />
              <Text style={styles.reviewBtnText}>Write Review</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionTile} onPress={onNavigate} activeOpacity={0.8}>
              <Icon name="navigate-outline" size={24} color="#3D2A1D" />
              <Text style={styles.actionTileText}>Navigate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionTile, inItinerary && styles.actionTileDisabled]}
              onPress={onAddToTrip}
              disabled={inItinerary || addingToItinerary}
              activeOpacity={0.8}
            >
              {addingToItinerary ? (
                <ActivityIndicator size="small" color="#3D2A1D" />
              ) : (
                <Icon
                  name={inItinerary ? 'checkmark-circle-outline' : 'briefcase-outline'}
                  size={24}
                  color="#3D2A1D"
                />
              )}
              <Text style={styles.actionTileText}>{inItinerary ? 'Added' : 'Add to Trip'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionTile} onPress={onBookRide} activeOpacity={0.8}>
              <Icon name="car-outline" size={24} color="#3D2A1D" />
              <Text style={styles.actionTileText}>Get a Ride</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 26,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 24,
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0DCD6',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F6F0',
    zIndex: 2,
  },
  loadingBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  errText: { color: T.textSecondary, fontSize: 14, marginBottom: 12 },
  retryBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  mainRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
  },
  imageCol: {
    width: 120,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F9F6F0',
  },
  vendorImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1, paddingTop: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 32, // space for close/share btn
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3D2A1D',
    lineHeight: 22,
  },
  verifiedIcon: { marginLeft: 4, marginTop: 2 },
  iconHit: { padding: 4, position: 'absolute', right: 0, top: -2 },
  subtitle: { fontSize: 13, color: '#8C7B6F', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaText: { fontSize: 12, fontWeight: '600', color: '#5A4A3E' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  openPill: {
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  openText: { fontSize: 10, fontWeight: '800', color: '#2E7D4F' },
  closedPill: { backgroundColor: '#F3EBE0' },
  closedText: { color: '#8C7B6F' },
  closesText: { fontSize: 11, color: '#8C7B6F', fontWeight: '600' },
  partnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  partnerText: { fontSize: 11, fontWeight: '800', color: T.primary },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  ratingText: { fontSize: 13, fontWeight: '700', color: '#5A4A3E' },
  pendingWrap: {
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  vendorReelsWrap: {
    marginTop: 16,
    paddingLeft: 16,
  },
  vendorReelsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B8895A',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  vendorReelsRow: {
    paddingRight: 16,
    gap: 10,
  },
  vendorReelThumb: {
    width: 72,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3EBE0',
  },
  vendorReelImage: { width: '100%', height: '100%' },
  vendorReelFallback: { alignItems: 'center', justifyContent: 'center' },
  vendorReelPlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 12,
  },
  discoveryTile: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
  },
  reelsTileBg: { backgroundColor: '#FFF9F0' },
  offersTileBg: { backgroundColor: '#F6F0FF' },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelsIconWrap: { backgroundColor: '#FFEAC2' },
  offersIconWrap: { backgroundColor: '#EADAF5' },
  tileTitle: { fontSize: 14, fontWeight: '800', color: '#3D2A1D' },
  tileSubtitle: { fontSize: 12, color: '#8C7B6F', marginTop: 4, fontWeight: '600' },
  offersPreviewWrap: {
    marginTop: 12,
    marginHorizontal: 16,
    gap: 8,
  },
  offerPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F6F0FF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  offerPreviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EADAF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerPreviewTitle: { fontSize: 13, fontWeight: '800', color: '#3D2A1D' },
  offerPreviewSub: { fontSize: 11, fontWeight: '600', color: '#8C7B6F', marginTop: 2 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: T.primary,
  },
  reviewBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F6F0',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
  },
  actionTileDisabled: { opacity: 0.7 },
  actionTileText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3D2A1D',
  },
});
