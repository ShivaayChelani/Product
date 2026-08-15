import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { rewardsApi } from '../services/api';
import { StickyActionBar } from '../components/rewards/StickyActionBar';
import { OfferCard } from '../components/rewards/OfferCard';
import type { NearbyReward } from '../services/api';
import { unwrapOfferDetail, type PublicVendorOfferDetail } from '../utils/vendorOfferEligibility';
import VendorCodeRedeemModal from '../components/VendorCodeRedeemModal';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import { walletApi } from '../services/api/wallet';
import {
  openVendorCall,
  openVendorDirections,
  openVendorWebsite,
  openVendorWhatsApp,
} from '../utils/vendorContactActions';
import { loadSavedOfferIds, toggleSavedOfferId } from '../utils/savedOffers';

const COLORS = {
  background: '#FFFFFF',
  white: '#FFFFFF',
  text: '#202020',
  textMuted: '#6D6D6D',
  gold: '#D9A441',
  border: '#E7DFD2',
};

type Route = RouteProp<RootStackParamList, 'VendorOfferDetail'>;

export default function VendorOfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { offerId } = route.params;

  const [offer, setOffer] = useState<PublicVendorOfferDetail | null>(null);
  const [similarOffers, setSimilarOffers] = useState<NearbyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [walletPoints, setWalletPoints] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const { handleRedeemOffer } = useDataContext();
  const { user, setUser, isGuest } = useUserContext();

  const refreshWalletPoints = useCallback(async () => {
    try {
      const res = await walletApi.getProfile();
      const profile: any = res?.data ?? res;
      const pts = Number(profile?.palPoints ?? 0);
      if (!Number.isNaN(pts)) {
        setWalletPoints(pts);
        setUser((prev) => ({ ...prev, totalPoints: pts }));
      }
    } catch {
      setWalletPoints(Number(user?.totalPoints || 0));
    }
  }, [setUser, user?.totalPoints]);

  useEffect(() => {
    void refreshWalletPoints();
  }, [refreshWalletPoints]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await loadSavedOfferIds();
      if (!cancelled) setIsSaved(ids.includes(offerId));
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rewardsApi.getVendorOfferById(offerId);
      const detail = unwrapOfferDetail(res);
      if (!detail) {
        setError('Offer not found or no longer available.');
        setLoading(false);
        return;
      }
      setOffer(detail);

      // Load similar offers
      try {
        const similarRes = await rewardsApi.listOffers({ limit: 5 });
        const data = similarRes.data || similarRes;
        const items = Array.isArray(data) ? data : (data as any).offers || (data as any).items || [];
        setSimilarOffers(items.filter((i: NearbyReward) => i.id !== offerId).slice(0, 4));
      } catch (err) {
        // ignore similar offers failure
      }

    } catch (e: any) {
      setError(e.message || 'Failed to load offer details.');
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onSaveOffer = useCallback(async () => {
    const next = await toggleSavedOfferId(offerId);
    setIsSaved(next.includes(offerId));
  }, [offerId]);

  const onRedeemSubmit = useCallback(async (vendorCode: string) => {
    setRedeemLoading(true);
    try {
      const result = await handleRedeemOffer(offerId, vendorCode);
      if (result) {
        setRedeemOpen(false);
        await refreshWalletPoints();
        Alert.alert(
          'Redemption Successful',
          `Your offer has been redeemed. Receipt: ${result.verificationCode || 'confirmed'}`,
        );
      }
    } finally {
      setRedeemLoading(false);
    }
  }, [handleRedeemOffer, offerId, refreshWalletPoints]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  if (error || !offer) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const v = offer.vendor;
  const vendorName = v?.businessName || 'Vendor';
  const vendorPhone = v?.phone;
  const vendorWebsite = v?.website;
  const vendorLat = v?.latitude;
  const vendorLng = v?.longitude;

  const discountLabel = offer.discountType === 'flat' 
    ? `₹${offer.discountValue} OFF` 
    : offer.discountType === 'percentage' 
      ? `${offer.discountValue}% OFF` 
      : offer.discountType;

  const validDate = offer.validTill 
    ? new Date(offer.validTill).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Ongoing';

  const userPoints = walletPoints ?? Number(user?.totalPoints || 0);
  const canRedeem = userPoints >= (offer.pointsRequired || 0);

  const openDirections = () => {
    void openVendorDirections(vendorLat, vendorLng, vendorName);
  };

  const onRedeemPress = () => {
    if (isGuest || user?.uid === 'guest-user') {
      Alert.alert('Sign In Required', 'Create an account or sign in to redeem offers.');
      return;
    }
    if (!canRedeem) {
      Alert.alert('Insufficient Points', `You need ${offer.pointsRequired} PalPoints to redeem this offer.`);
      return;
    }
    setRedeemOpen(true);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
      >
        
        {/* Cover Image */}
        <View style={styles.coverContainer}>
          {offer.imageUrl ? (
            <Image source={{ uri: offer.imageUrl }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <Icon name="image-outline" size={48} color={COLORS.textMuted} />
            </View>
          )}
          <TouchableOpacity 
            style={[styles.headerBackBtn, { top: Math.max(insets.top, 16) }]} 
            onPress={() => navigation.goBack()}
          >
            <Icon name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Vendor Header Overlap */}
        <View style={styles.headerOverlap}>
          <View style={styles.vendorLogoWrap}>
            {v?.imageUrl ? (
              <Image source={{ uri: v.imageUrl }} style={styles.vendorLogo} />
            ) : (
              <Icon name="storefront-outline" size={32} color={COLORS.textMuted} />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.vendorName}>{vendorName}</Text>
            <Text style={styles.categoryText}>{offer.category || 'Special Offer'}</Text>
            <View style={styles.metaRow}>
              <Icon name="star" size={14} color={COLORS.gold} />
              <Text style={styles.metaText}>4.8</Text>
              <View style={styles.dot} />
              <Icon name="location-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.metaText}>2.1 km</Text>
            </View>
          </View>
          <View style={styles.offerBadgeLarge}>
            <Text style={styles.offerBadgeText}>{discountLabel}</Text>
          </View>
        </View>

        <View style={styles.contentPadding}>
          {/* Title & Description */}
          <Text style={styles.offerTitle}>{offer.title}</Text>
          <Text style={styles.description}>{offer.description || 'No description available for this offer.'}</Text>
          
          <View style={styles.validityBox}>
            <Icon name="calendar-outline" size={20} color={COLORS.gold} />
            <View style={styles.validityTextWrap}>
              <Text style={styles.validityLabel}>Validity</Text>
              <Text style={styles.validityValue}>Valid until {validDate}</Text>
            </View>
          </View>


          {/* Vendor Details */}
          <View style={styles.vendorDetailsCard}>
            <Text style={styles.sectionTitle}>Vendor Details</Text>
            <Text style={styles.vBusinessName}>{vendorName}</Text>
            <Text style={styles.vAddress}>{v?.address || [v?.city, v?.state].filter(Boolean).join(', ') || 'Address not listed'}</Text>
            {v?.operatingHours && (
              <View style={styles.vDetailRow}>
                <Icon name="time-outline" size={16} color={COLORS.textMuted} />
                <Text style={styles.vDetailText}>{v.operatingHours}</Text>
              </View>
            )}
            
            <TouchableOpacity style={styles.mapPlaceholder} onPress={openDirections} activeOpacity={0.8}>
              <Icon name="map-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.mapText}>Tap for directions</Text>
            </TouchableOpacity>

            {/* Contact Actions */}
            <View style={styles.contactActions}>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => void openVendorCall(vendorPhone)}
                activeOpacity={0.7}
              >
                <Icon name="call-outline" size={20} color={COLORS.text} />
                <Text style={styles.contactBtnText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => void openVendorWhatsApp(vendorPhone)}
                activeOpacity={0.7}
              >
                <Icon name="logo-whatsapp" size={20} color={'#25D366'} />
                <Text style={styles.contactBtnText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => void openVendorWebsite(vendorWebsite)}
                activeOpacity={0.7}
              >
                <Icon name="globe-outline" size={20} color={COLORS.text} />
                <Text style={styles.contactBtnText}>Website</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, { backgroundColor: COLORS.gold }]}
                onPress={openDirections}
                activeOpacity={0.7}
              >
                <Icon name="navigate-outline" size={20} color={COLORS.text} />
                <Text style={styles.contactBtnText}>Directions</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Similar Offers */}
        {similarOffers.length > 0 && (
          <View style={styles.similarSection}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>Similar Offers</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
              {similarOffers.map(sim => (
                <OfferCard 
                  key={sim.id} 
                  offer={sim} 
                  onPress={(id) => navigation.push('VendorOfferDetail', { offerId: id })}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <StickyActionBar 
        onSave={() => { void onSaveOffer(); }}
        isSaved={isSaved}
        onPrimaryAction={onRedeemPress}
        primaryActionLabel={canRedeem ? 'Redeem Offer' : `Need ${Math.max(0, offer.pointsRequired - userPoints)} pts`}
        primaryActionIcon="gift-outline"
      />

      <VendorCodeRedeemModal
        visible={redeemOpen}
        offerTitle={offer.title}
        pointsRequired={offer.pointsRequired}
        loading={redeemLoading}
        onClose={() => setRedeemOpen(false)}
        onSubmit={onRedeemSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginBottom: 16,
  },
  backBtn: {
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  coverContainer: {
    width: '100%',
    height: 240,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    backgroundColor: '#EAE0D5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackBtn: {
    position: 'absolute',
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerOverlap: {
    marginTop: -40,
    marginHorizontal: 20,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  vendorLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  vendorLogo: {
    width: '100%',
    height: '100%',
  },
  headerInfo: {
    flex: 1,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  offerBadgeLarge: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  offerBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  contentPadding: {
    paddingHorizontal: 20,
  },
  offerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'Georgia',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 24,
    marginBottom: 24,
  },
  validityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  validityTextWrap: {
    marginLeft: 12,
  },
  validityLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  validityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  termsText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: 32,
  },
  vendorDetailsCard: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 32,
  },
  vBusinessName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  vAddress: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 20,
  },
  vDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  vDetailText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginLeft: 8,
  },
  mapPlaceholder: {
    height: 120,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  contactActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  contactBtn: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contactBtnText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  similarSection: {
    marginTop: 8,
  },
});
