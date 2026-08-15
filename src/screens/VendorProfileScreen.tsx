import { View, Text, ScrollView, TouchableOpacity, Linking, Share, Alert, ActivityIndicator, RefreshControl, Platform, Switch, StatusBar, StyleSheet, Modal, TextInput, useWindowDimensions, Image } from 'react-native';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import Pal from '../design/DesignSystem';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { GradientButton } from '../components/ui/GradientButton';
import { vendorsApi, VendorPublicDetails, VendorPublicOffer, TaggedCreatorReel, VendorReview } from '../services/api/vendors';
import { walletApi } from '../services/api/wallet';
import { VENDOR_CATEGORY_EMOJI } from '../data/vendors';
import Icon from 'react-native-vector-icons/Ionicons';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import Geolocation from 'react-native-geolocation-service';
import { useVendorScreenInsets, VendorUI } from '../design/vendorLayout';
import ProfileModeSwitcher from '../components/ProfileModeSwitcher';

import { BottomNavigation, BOTTOM_NAV_CLEARANCE } from '../components/navigation/BottomNavigation';
import type { UserActiveMode } from '../types';

const CARD_GAP = VendorUI.space.md;
const H_PAD = VendorUI.space.screen;
const COVER_HEIGHT = 160;
const AVATAR_SIZE = 92;
const AVATAR_RING = 4;
/** Avoid remount/tab-switch spam against the global API limiter */
const PROFILE_CACHE_MS = 60_000;

function mapOffers(list: any[]): VendorPublicOffer[] {
  return (list || []).map((o: any) => ({
    id: o.id,
    title: o.title || o.offerTitle,
    description: o.description || o.offerDescription,
    discountType: o.discountType,
    discountValue: o.discountValue,
    pointsRequired: o.pointsRequired,
    validTill: o.validTill,
  }));
}

function mapMeToPublic(me: any, offers?: any[]): VendorPublicDetails {
  return {
    id: me.id,
    businessName: me.businessName,
    businessType: me.businessType || me.category,
    description: me.description ?? null,
    address: me.address,
    city: me.city,
    state: me.state,
    latitude: me.latitude ?? null,
    longitude: me.longitude ?? null,
    imageUrl: me.imageUrl ?? null,
    website: me.website ?? null,
    operatingHours: me.operatingHours || me.openingHours || null,
    images: me.images || [],
    phone: me.phone ?? null,
    showContact: me.showContact ?? true,
    showWebsite: me.showWebsite ?? true,
    showImages: me.showImages ?? true,
    showOffers: me.showOffers ?? true,
    showReels: me.showReels ?? true,
    showNavigation: me.showNavigation ?? true,
    rating: me.rating ?? null,
    reviewCount: me.reviewCount ?? 0,
    offers: mapOffers(offers ?? me.offers ?? []),
  };
}

const PRESET_AVATARS = ['👦', '👧', '👨', '👩', '👶', '👸', '🤴', '🧑', '🧒', '👱'];

export default function VendorProfileScreen({
  vendorId,
  self = false,
  initialTab = 'offers',
  openReview = false,
  onNavigate,
}: {
  vendorId: string;
  self?: boolean;
  initialTab?: 'offers' | 'reels' | 'info';
  openReview?: boolean;
  onNavigate?: (screen: string, params?: any) => void;
}) {
  const { updateVendorProfile, currentVendor, vendorOffers } = useDataContext();
  const { user, setUser, setActiveMode, isGuest } = useUserContext();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const screenInsets = useVendorScreenInsets({ withTabBar: self });
  const { width } = useWindowDimensions();
  const CARD_WIDTH = (width - H_PAD * 2 - CARD_GAP) / 2;
  const [vendor, setVendor] = useState<VendorPublicDetails | null>(null);
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | null>(null);
  const [reels, setReels] = useState<TaggedCreatorReel[]>([]);
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [ratingInput, setRatingInput] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'offers' | 'reels' | 'info'>(initialTab);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [showOnMap, setShowOnMap] = useState(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const reelsLoadedForRef = useRef<string | null>(null);
  const openReviewHandledRef = useRef(false);
  const activeMode = (user.activeMode || user.activeRole || 'VENDOR') as UserActiveMode;
  const roles = (user.roles || []).map(String);
  const canSwitchProfiles = self && (roles.includes('VENDOR') || user.permission === 'VENDOR');
  // User + Vendor only — never offer Creator from vendor workspace
  const switchableModes: UserActiveMode[] = canSwitchProfiles
    ? ['USER' as UserActiveMode, 'VENDOR' as UserActiveMode]
    : [];

  const applyContextVendor = useCallback(() => {
    if (!self || !currentVendor?.id) return false;
    const myOffers = vendorOffers.filter(o => o.vendorId === currentVendor.id);
    setVendor(mapMeToPublic(currentVendor, myOffers.length ? myOffers : undefined));
    setShowOnMap(currentVendor.showOnMap ?? true);
    setStatus(
      currentVendor.verificationStatus === 'approved'
        ? 'APPROVED'
        : currentVendor.verificationStatus === 'rejected'
        ? 'REJECTED'
        : currentVendor.verificationStatus === 'changes_requested'
        ? 'CHANGES_REQUESTED'
        : 'PENDING',
    );
    setLoading(false);
    return true;
  }, [self, currentVendor, vendorOffers]);

  const fetchReviews = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingReviews(true);
    try {
      const list = await vendorsApi.getReviews(id);
      setReviews(Array.isArray(list) ? list : []);
    } catch {
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  const fetchReelsOnce = useCallback(async (id: string) => {
    if (!id || reelsLoadedForRef.current === id) return;
    try {
      const tagged = await vendorsApi.getTaggedCreatorReels(id);
      setReels(tagged.reels || []);
      reelsLoadedForRef.current = id;
    } catch {
      setReels([]);
    }
  }, []);

  const fetchData = useCallback(async (force = false) => {
    if (inFlightRef.current) return;
    const now = Date.now();
    if (!force && vendor && now - lastFetchAtRef.current < PROFILE_CACHE_MS) {
      setRefreshing(false);
      setLoading(false);
      return;
    }

    setLoadError(null);
    inFlightRef.current = true;
    try {
      if (self) {
        // Prefer session context — avoid burning the global rate limit on every Profile tab open.
        const painted = applyContextVendor();
        if (painted && !force) {
          lastFetchAtRef.current = lastFetchAtRef.current || now;
          if (activeTab === 'reels' && currentVendor?.id) {
            fetchReelsOnce(currentVendor.id).catch(() => {});
          }
          return;
        }

        const meRes = await vendorsApi.getMe();
        const me: any = meRes?.data ?? meRes;
        if (!me?.id) throw new Error('No vendor account found for this login');

        const ctxOffers = vendorOffers.filter(o => o.vendorId === me.id);
        const offersSource = (me.offers && me.offers.length > 0)
          ? me.offers
          : ctxOffers;
        setVendor(mapMeToPublic(me, offersSource));
        setShowOnMap(me.showOnMap ?? true);
        setStatus(me.status || null);
        lastFetchAtRef.current = Date.now();

        if (activeTab === 'reels') {
          await fetchReelsOnce(me.id);
        }
        fetchReviews(me.id).catch(() => {});
      } else {
        const [v, tagged] = await Promise.all([
          vendorsApi.getVendorDetails(vendorId),
          vendorsApi.getTaggedCreatorReels(vendorId).catch(() => ({ reels: [], pending: [], isOwner: false })),
        ]);
        setVendor(v.data);
        setReels(tagged.reels || []);
        reelsLoadedForRef.current = vendorId;
        setStatus('APPROVED');
        lastFetchAtRef.current = Date.now();
        await fetchReviews(vendorId);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      const isRateLimited = err?.status === 429 || /too many requests/i.test(msg);
      // Always keep context/cached profile visible on rate limit
      if (self) applyContextVendor();
      if (!vendor && !currentVendor) {
        setLoadError(isRateLimited
          ? 'Too many requests. Pull to refresh in a minute.'
          : (msg || 'Vendor not found'));
      } else {
        setLoadError(null);
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorId, self, vendor, applyContextVendor, vendorOffers, activeTab, fetchReelsOnce, fetchReviews, currentVendor]);

  // Initial load / identity change — prefer context, then one getMe
  useEffect(() => {
    if (self) {
      applyContextVendor();
      // Only hit network if context could not paint the profile
      if (!currentVendor?.id) {
        fetchData(false);
      } else {
        setLoading(false);
        lastFetchAtRef.current = Date.now();
      }
      return;
    }
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / vendor identity only
  }, [self, vendorId]);

  useEffect(() => {
    if (!openReview || self || !vendor?.id || openReviewHandledRef.current) return;
    openReviewHandledRef.current = true;
    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to review this shop.');
      return;
    }
    setRatingInput(null);
    setCommentInput('');
    setReviewModalVisible(true);
  }, [openReview, self, vendor?.id, isGuest]);

  // Load reels lazily when user opens the Reels tab
  useEffect(() => {
    if (activeTab === 'reels' && vendor?.id) {
      fetchReelsOnce(vendor.id);
    }
  }, [activeTab, vendor?.id, fetchReelsOnce]);

  const handleRefresh = () => {
    setRefreshing(true);
    reelsLoadedForRef.current = null;
    fetchData(true);
  };

  const handleCall = () => {
    if (vendor?.phone) Linking.openURL(`tel:${vendor.phone}`).catch(() => {});
  };

  const handleWebsite = () => {
    if (vendor?.website) Linking.openURL(vendor.website).catch(() => {});
  };

  const handleNavigate = () => {
    if (vendor?.latitude && vendor?.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${vendor.latitude},${vendor.longitude}(${encodeURIComponent(vendor.businessName)})`,
        android: `geo:0,0?q=${vendor.latitude},${vendor.longitude}(${encodeURIComponent(vendor.businessName)})`,
        default: `https://www.google.com/maps/search/?api=1&query=${vendor.latitude},${vendor.longitude}`,
      });
      if (url) Linking.openURL(url).catch(() => {});
    }
  };

  const handleShare = async () => {
    if (!vendor) return;
    try {
      await Share.share({
        message: `Check out ${vendor.businessName} on PalSafar!\n📍 ${vendor.address}, ${vendor.city}, ${vendor.state}`,
      });
    } catch { }
  };

  const avgRating = useMemo(() => {
    if (reviews.length > 0) {
      return (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
    }
    if (vendor?.rating != null && Number(vendor.rating) > 0) return Number(vendor.rating).toFixed(1);
    return null;
  }, [reviews, vendor?.rating]);

  const openReviewModal = () => {
    if (self) return;
    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to review this shop.');
      return;
    }
    setRatingInput(null);
    setCommentInput('');
    setReviewModalVisible(true);
  };

  const handleAddReview = async () => {
    if (!vendor?.id || self) return;
    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to review this shop.');
      return;
    }
    if (!commentInput.trim()) {
      Alert.alert('Required', 'Please enter a review comment.');
      return;
    }
    if (ratingInput == null || !Number.isInteger(ratingInput) || ratingInput < 1 || ratingInput > 5) {
      Alert.alert('Required', 'Please select a rating from 1 to 5 stars.');
      return;
    }
    const selectedRating = ratingInput;
    setSubmittingReview(true);
    try {
      const newReview = await vendorsApi.addReview(vendor.id, selectedRating, commentInput.trim());
      const wasUpdate = newReview?.updated === true;
      const pointsAwarded =
        typeof newReview?.pointsAwarded === 'number' && newReview.pointsAwarded > 0
          ? newReview.pointsAwarded
          : 0;
      const normalized: VendorReview = {
        id: newReview?.id || String(Date.now()),
        rating: newReview?.rating ?? selectedRating,
        content: newReview?.content ?? commentInput.trim(),
        createdAt: newReview?.createdAt || new Date().toISOString(),
        photos: newReview?.photos || [],
        helpfulVotes: newReview?.helpfulVotes || 0,
        user: newReview?.user || {
          name: user?.displayName || 'You',
          avatarStyle: user?.avatarStyle || 0,
        },
      };
      setReviews(prev => {
        const withoutSelf = prev.filter(r => r.id !== normalized.id && r.user?.id !== newReview?.user?.id);
        return [normalized, ...withoutSelf];
      });
      setVendor(prev => {
        if (!prev) return prev;
        const merged = [normalized, ...reviews.filter(r => r.id !== normalized.id)];
        return {
          ...prev,
          reviewCount: wasUpdate ? prev.reviewCount : (prev.reviewCount || 0) + 1,
          rating: Number((merged.reduce((s, r) => s + r.rating, 0) / Math.max(1, merged.length)).toFixed(1)),
        };
      });
      setCommentInput('');
      setRatingInput(null);
      setReviewModalVisible(false);
      await fetchReviews(vendor.id).catch(() => {});

      try {
        const walletRes = await walletApi.getProfile();
        const profile = walletRes?.data ?? walletRes;
        const palPoints = Number((profile as { palPoints?: number })?.palPoints);
        if (Number.isFinite(palPoints)) {
          setUser(prev => ({ ...prev, totalPoints: palPoints }));
        }
      } catch {
        /* wallet refresh optional */
      }

      if (pointsAwarded > 0) {
        Alert.alert('Review posted', `+${pointsAwarded} PalPoints earned`);
      } else {
        Alert.alert('Review posted', wasUpdate ? 'Your review was updated.' : 'Thank you for your review!');
      }
    } catch (err: any) {
      if (err?.status === 401) {
        Alert.alert('Sign In Required', 'Create an account or sign in to review this shop.');
      } else {
        Alert.alert('Error', err?.message || 'Could not submit review. Please try again.');
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const patchVisibility = async (
    key: 'showOnMap' | 'showContact' | 'showWebsite' | 'showImages' | 'showOffers' | 'showReels' | 'showNavigation',
    value: boolean,
  ) => {
    if (!self || !vendor) return;
    const prev = vendor;
    if (key === 'showOnMap') setShowOnMap(value);
    setVendor({ ...vendor, [key]: value });
    setSavingVisibility(true);
    try {
      await updateVendorProfile({ [key]: value } as any);
    } catch (err: any) {
      setVendor(prev);
      if (key === 'showOnMap') setShowOnMap((prev as any).showOnMap ?? true);
      Alert.alert('Update failed', err?.message || 'Could not update visibility settings.');
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!self) return;
    Geolocation.getCurrentPosition(
      async (pos) => {
        setSavingVisibility(true);
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          await updateVendorProfile({ latitude: lat, longitude: lng });
          setVendor(prev => prev ? { ...prev, latitude: lat, longitude: lng } : prev);
          Alert.alert('Location updated', 'Your map pin now uses your current GPS position.');
        } catch (err: any) {
          Alert.alert('Update failed', err?.message || 'Could not save location.');
        } finally {
          setSavingVisibility(false);
        }
      },
      (err) => Alert.alert('Location unavailable', err.message || 'Enable GPS and try again.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const profileCompletion = (() => {
    if (!vendor) return 0;
    const checks = [
      !!vendor.businessName,
      !!vendor.description,
      !!vendor.phone,
      !!vendor.operatingHours,
      !!vendor.imageUrl || (vendor.images?.length ?? 0) > 0,
      !!vendor.website,
      !!(vendor.latitude && vendor.longitude),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const handleOfferPress = (offer: VendorPublicOffer) => {
    if (onNavigate) {
      vendorsApi.recordOfferClick(offer.id).catch(() => {});
      onNavigate('VendorOffers');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: Math.max(insets.top, 16) }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color={Pal.colors.light.primary} />
        <Text style={{ color: Pal.colors.light.textMuted, fontSize: 13 }}>Loading vendor...</Text>
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 40, paddingTop: Math.max(insets.top, 16) }}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Text style={{ fontSize: 56 }}>🏪</Text>
        <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 18, color: Pal.colors.light.text, textAlign: 'center' }}>
          {loadError || 'Vendor not found'}
        </Text>
        <Text style={{ fontSize: 13, color: Pal.colors.light.textMuted, textAlign: 'center' }}>
          {self
            ? 'Could not load your vendor account. Go back and try again.'
            : 'This business may still be pending approval or is not listed publicly yet.'}
        </Text>
        <GradientButton title="Go Back" onPress={() => onNavigate?.('goBack')} size="sm" />
      </View>
    );
  }

  const categoryEmoji = VENDOR_CATEGORY_EMOJI[vendor.businessType?.toLowerCase()] || '🏪';
  const statusLabel =
    status === 'PENDING' ? 'Pending Approval' :
    status === 'REJECTED' ? 'Rejected' :
    status === 'CHANGES_REQUESTED' ? 'Changes Requested' :
    status === 'APPROVED' ? 'Approved' : null;

  const coverUri = vendor.images?.[0] || vendor.imageUrl || null;
  const avatarUri = vendor.imageUrl || vendor.images?.[0] || null;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {switchableModes.length > 1 ? (
        <ProfileModeSwitcher
          withTopInset
          modes={switchableModes}
          activeMode={activeMode}
          modeIdentities={{
            ...(user?.displayName ? { USER: user.displayName } : {}),
            ...(vendor.businessName ? { VENDOR: vendor.businessName } : {}),
          }}
          onSwitch={async (mode) => {
            try {
              await setActiveMode(mode);
            } catch (error: any) {
              Alert.alert('Could not switch profile', error?.message || 'Please try again.');
            }
          }}
        />
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentPadBottom + BOTTOM_NAV_CLEARANCE }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Top bar area with back/share buttons (no large cover block) */}
        <View style={[styles.topActions, { top: screenInsets.top + 8 }]}>
          <TouchableOpacity
            onPress={() => onNavigate?.('goBack')}
            style={styles.circleBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="chevron-back" size={20} color={Pal.colors.light.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.circleBtn}>
            <Icon name="share-outline" size={20} color={Pal.colors.light.text} />
          </TouchableOpacity>
        </View>

        {/* Avatar overlaps the info card */}
        <View style={styles.profileBlock}>
          <View style={styles.infoCard}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarRing}>
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarEmoji}>{categoryEmoji}</Text>
                  </View>
                )}
              </View>
            </View>

            {self ? (
              <View style={styles.previewBanner}>
                <Text style={styles.previewTitle}>Public listing preview</Text>
                <Text style={styles.previewSub}>
                  This is how tourists see your business on the map and search.
                </Text>
                <TouchableOpacity
                  onPress={() => onNavigate?.('VendorSettings')}
                  style={{
                    marginTop: 10,
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: Pal.colors.light.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 16,
                  }}
                >
                  <Icon name="create-outline" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontFamily: Pal.typography.fontFamily.bold }}>
                    Edit business details
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.businessName} numberOfLines={2}>{vendor.businessName}</Text>
            
            <View style={styles.badgeRow}>
              <View style={styles.outlineBadge}>
                <Icon name="restaurant-outline" size={14} color={Pal.colors.light.primary} />
                <Text style={styles.outlineBadgeText}>{vendor.businessType}</Text>
              </View>
              <View style={styles.outlineBadge}>
                <Icon name="location" size={14} color={Pal.colors.light.primary} />
                <Text style={styles.outlineBadgeText}>{vendor.city}</Text>
              </View>
              {self && statusLabel ? (
                <View style={styles.outlineBadge}>
                  <Text style={styles.outlineBadgeText}>{statusLabel}</Text>
                </View>
              ) : null}
            </View>

            {self && status === 'PENDING' ? (
              <Text style={styles.pendingHint}>
                Under review — public listing unlocks after approval.
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              {vendor.showContact && vendor.phone ? (
                <TouchableOpacity onPress={handleCall} style={styles.actionBtn} activeOpacity={0.85}>
                  <Icon name="call-outline" size={16} color={Pal.colors.light.primary} />
                  <Text style={styles.actionBtnText}>Call</Text>
                </TouchableOpacity>
              ) : null}
              {vendor.showNavigation && vendor.latitude ? (
                <TouchableOpacity onPress={handleNavigate} style={styles.actionBtn} activeOpacity={0.85}>
                  <Icon name="navigate-outline" size={16} color={Pal.colors.light.primary} />
                  <Text style={styles.actionBtnText}>Navigate</Text>
                </TouchableOpacity>
              ) : null}
              {vendor.showWebsite && vendor.website ? (
                <TouchableOpacity onPress={handleWebsite} style={styles.actionBtn} activeOpacity={0.85}>
                  <Icon name="globe-outline" size={16} color={Pal.colors.light.primary} />
                  <Text style={styles.actionBtnText}>Website</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => {}} style={styles.actionIconOnly} activeOpacity={0.85}>
                <Icon name="bookmark-outline" size={18} color={Pal.colors.light.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Description */}
        {vendor.description && (
          <View style={{ paddingHorizontal: H_PAD, marginBottom: Pal.spacing[4] }}>
            <GlassCard style={{ padding: Pal.spacing[4], flexDirection: 'row', gap: 16, backgroundColor: '#FFFFFF' }}>
              <View style={styles.cardIconWrap}>
                <Icon name="document-text-outline" size={20} color={Pal.colors.light.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 16, color: Pal.colors.light.text, marginBottom: 6 }}>About</Text>
                <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary, lineHeight: 20 }}>{vendor.description}</Text>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Business Hours */}
        {vendor.operatingHours && (
          <View style={{ paddingHorizontal: H_PAD, marginBottom: Pal.spacing[4] }}>
            <GlassCard style={{ padding: Pal.spacing[4], flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: '#FFFFFF' }}>
              <View style={styles.cardIconWrap}>
                <Icon name="time-outline" size={20} color={Pal.colors.light.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 16, color: Pal.colors.light.text }}>Business Hours</Text>
                <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary, marginTop: 4 }}>{vendor.operatingHours}</Text>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Reviews */}
        <View style={{ paddingHorizontal: H_PAD, marginBottom: Pal.spacing[4] }}>
          <GlassCard style={{ padding: Pal.spacing[4], backgroundColor: '#FFFFFF' }}>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
              <View style={styles.cardIconWrap}>
                <Icon name="star" size={20} color={Pal.colors.light.primary} />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 16, color: Pal.colors.light.text }}>
                  Customer Reviews
                </Text>
                {!self ? (
                  <TouchableOpacity
                    onPress={openReviewModal}
                    style={{
                      borderWidth: 1,
                      borderColor: Pal.colors.light.primary,
                      borderRadius: Pal.borderRadius.full,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: Pal.colors.light.primary, fontFamily: Pal.typography.fontFamily.semibold }}>
                      Write a Review
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {loadingReviews ? (
              <ActivityIndicator size="small" color={Pal.colors.light.primary} style={{ marginVertical: 16 }} />
            ) : reviews.length === 0 ? (
              <View style={{ backgroundColor: Pal.colors.light.surface, borderRadius: 8, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Icon name="chatbubble-outline" size={16} color={Pal.colors.light.textSecondary} />
                <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary, flex: 1 }}>
                  {self ? 'No customer reviews yet.' : 'No reviews yet. Be the first to share your experience!'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {reviews.map((item) => (
                  <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: Pal.colors.light.border, paddingTop: 12, marginTop: 4, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 22 }}>{PRESET_AVATARS[item.user?.avatarStyle ?? 0] || '🧭'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 13, color: Pal.colors.light.text }}>
                          {item.user?.name || 'Traveler'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Icon key={s} name="star" size={12} color={s <= item.rating ? '#FFB300' : '#E0E0E0'} />
                          ))}
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: Pal.colors.light.textMuted }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                      </Text>
                    </View>
                    {!!item.content && (
                      <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary, lineHeight: 19 }}>
                        {item.content}
                      </Text>
                    )}
                    {!self ? (
                      <TouchableOpacity
                        onPress={() => {
                          vendorsApi.markReviewHelpful(vendor.id, item.id).catch(() => {});
                          setReviews(prev => prev.map(r =>
                            r.id === item.id ? { ...r, helpfulVotes: (r.helpfulVotes || 0) + 1 } : r
                          ));
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}
                      >
                        <Icon name="thumbs-up-outline" size={14} color={Pal.colors.light.primary} />
                        <Text style={{ fontSize: 12, color: Pal.colors.light.primary }}>
                          Helpful ({item.helpfulVotes || 0})
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </GlassCard>
        </View>

        {/* Gallery */}
        {vendor.showImages && vendor.images?.length > 1 && (
          <View style={{ paddingHorizontal: H_PAD, marginBottom: Pal.spacing[4] }}>
            <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 15, color: Pal.colors.light.text, marginBottom: 10 }}>Gallery</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {vendor.images.slice(1).map((img, i) => (
                <Image key={i} source={{ uri: img }} style={{ width: 140, height: 100, borderRadius: Pal.borderRadius.lg }} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Tab Bar: Offers | Reels | Info */}
        <View style={{ paddingHorizontal: H_PAD, marginBottom: Pal.spacing[4] }}>
          <View style={styles.segmentedControl}>
            {vendor.showOffers && (
              <TouchableOpacity
                onPress={() => setActiveTab('offers')}
                style={[styles.segmentBtn, activeTab === 'offers' && styles.segmentBtnActive]}
              >
                <Text style={[styles.segmentText, activeTab === 'offers' && styles.segmentTextActive]}>Offers</Text>
              </TouchableOpacity>
            )}
            {vendor.showReels && reels.length > 0 && (
              <>
                <View style={styles.segmentDivider} />
                <TouchableOpacity
                  onPress={() => setActiveTab('reels')}
                  style={[styles.segmentBtn, activeTab === 'reels' && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, activeTab === 'reels' && styles.segmentTextActive]}>Reels</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.segmentDivider} />
            <TouchableOpacity
              onPress={() => setActiveTab('info')}
              style={[styles.segmentBtn, activeTab === 'info' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, activeTab === 'info' && styles.segmentTextActive]}>Info</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Content */}
        {activeTab === 'offers' && vendor.showOffers && (
          <View style={{ paddingHorizontal: H_PAD }}>
            {vendor.offers?.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
                {vendor.offers.map((offer) => (
                  <TouchableOpacity key={offer.id} onPress={() => handleOfferPress(offer)} style={{ width: CARD_WIDTH }}>
                    <GlassCard style={{ padding: Pal.spacing[3], gap: 12, backgroundColor: '#FFFFFF' }}>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={styles.offerIconWrap}>
                          <Icon name="pricetag" size={16} color={Pal.colors.light.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 14, color: Pal.colors.light.text }} numberOfLines={2}>{offer.title}</Text>
                          <Text style={{ fontSize: 11, color: Pal.colors.light.textMuted, marginTop: 4, textTransform: 'uppercase' }}>{offer.discountType} • One time use</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1 }} />
                      <View style={styles.dashedDivider} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: Pal.colors.light.primary, fontFamily: Pal.typography.fontFamily.bold }}>{offer.pointsRequired} pts</Text>
                        {offer.validTill && <Text style={{ fontSize: 10, color: Pal.colors.light.textMuted }}>Valid till {new Date(offer.validTill).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>}
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 40 }}>📭</Text>
                <Text style={{ fontSize: 13, color: Pal.colors.light.textMuted }}>No offers available</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'reels' && vendor.showReels && reels.length > 0 && (
          <View style={{ paddingHorizontal: H_PAD }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
              {reels.map((reel) => (
                <TouchableOpacity key={reel.id} onPress={() => onNavigate?.('ReelDetail', { reelId: reel.id })} style={{ width: CARD_WIDTH }}>
                  <GlassCard style={{ padding: Pal.spacing[3], gap: 6, backgroundColor: '#FFFFFF' }}>
                    <View style={{ height: 120, borderRadius: Pal.borderRadius.md, backgroundColor: Pal.colors.light.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      {reel.thumbnail ? (
                        <Image source={{ uri: reel.thumbnail }} style={{ width: '100%', height: '100%', borderRadius: Pal.borderRadius.md }} />
                      ) : (
                        <Icon name="play-circle" size={36} color={Pal.colors.light.primary} />
                      )}
                    </View>
                    {reel.title && <Text style={{ fontSize: 12, fontFamily: Pal.typography.fontFamily.semibold, color: Pal.colors.light.text }} numberOfLines={1}>{reel.title}</Text>}
                    <Text style={{ fontSize: 10, color: Pal.colors.light.textMuted }} numberOfLines={1}>@{reel.creator.username}</Text>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'info' && (
          <View style={{ paddingHorizontal: H_PAD, gap: Pal.spacing[3] }}>
            <GlassCard style={{ padding: Pal.spacing[4], backgroundColor: '#FFFFFF' }}>
              <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 14, color: Pal.colors.light.text, marginBottom: 10 }}>📍 Address</Text>
              <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary }}>{vendor.address}, {vendor.city}, {vendor.state}</Text>
            </GlassCard>

            {vendor.operatingHours && (
              <GlassCard style={{ padding: Pal.spacing[4], backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 14, color: Pal.colors.light.text, marginBottom: 6 }}>🕐 Hours</Text>
                <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary }}>{vendor.operatingHours}</Text>
              </GlassCard>
            )}

            {vendor.showContact && (
              <GlassCard style={{ padding: Pal.spacing[4], backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 14, color: Pal.colors.light.text, marginBottom: 6 }}>📞 Contact</Text>
                {vendor.phone && <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary }}>{vendor.phone}</Text>}
                {vendor.showWebsite && vendor.website && (
                  <Text style={{ fontSize: 13, color: Pal.colors.light.primary, marginTop: 4 }}>{vendor.website}</Text>
                )}
              </GlassCard>
            )}

            {self ? (
              <GlassCard style={{ padding: Pal.spacing[4], gap: 12, backgroundColor: '#FFFFFF' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 14, color: Pal.colors.light.text }}>
                    Listing settings
                  </Text>
                  {savingVisibility ? <ActivityIndicator size="small" color={Pal.colors.light.primary} /> : null}
                </View>
                <Text style={{ fontSize: 12, color: Pal.colors.light.textMuted }}>
                  Profile {profileCompletion}% complete
                </Text>
                {[
                  { key: 'showOnMap' as const, label: 'Show on map', value: showOnMap },
                  { key: 'showContact' as const, label: 'Show phone', value: !!vendor.showContact },
                  { key: 'showWebsite' as const, label: 'Show website', value: !!vendor.showWebsite },
                  { key: 'showImages' as const, label: 'Show gallery', value: !!vendor.showImages },
                  { key: 'showOffers' as const, label: 'Show offers', value: !!vendor.showOffers },
                  { key: 'showReels' as const, label: 'Show reels', value: !!vendor.showReels },
                  { key: 'showNavigation' as const, label: 'Show navigate', value: !!vendor.showNavigation },
                ].map((row) => (
                  <View key={row.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary }}>{row.label}</Text>
                    <Switch
                      value={row.value}
                      onValueChange={(v) => patchVisibility(row.key, v)}
                      disabled={savingVisibility}
                      trackColor={{ false: Pal.colors.light.border, true: Pal.colors.light.primary }}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  onPress={handleUseMyLocation}
                  disabled={savingVisibility}
                  style={{
                    marginTop: 4,
                    height: 40,
                    borderRadius: Pal.borderRadius.full,
                    backgroundColor: Pal.colors.light.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                >
                  <Icon name="locate-outline" size={16} color={Pal.colors.light.primary} />
                  <Text style={{ fontSize: 12, color: Pal.colors.light.primary, fontFamily: Pal.typography.fontFamily.semibold }}>
                    Use my GPS for map pin
                  </Text>
                </TouchableOpacity>
              </GlassCard>
            ) : null}

            {self ? (
              <GlassCard style={{ marginTop: 16, gap: 4, paddingVertical: 8, backgroundColor: '#FFFFFF' }}>
                <Text style={{
                  fontFamily: Pal.typography.fontFamily.bold,
                  fontSize: 15,
                  color: Pal.colors.light.text,
                  marginBottom: 4,
                  paddingHorizontal: 4,
                }}>
                  Account
                </Text>
                {[
                  { icon: 'people-outline', label: 'Customers', route: 'VendorCustomers' as const },
                  { icon: 'card-outline', label: 'Subscription & billing', route: 'VendorSubscription' as const },
                  { icon: 'receipt-outline', label: 'Billing history', route: 'BillingHistory' as const },
                  { icon: 'create-outline', label: 'Business settings', route: 'VendorSettings' as const },
                  { icon: 'notifications-outline', label: 'Notifications', route: 'Notifications' as const },
                  { icon: 'trophy-outline', label: 'Leaderboard', route: 'Leaderboard' as const },
                  { icon: 'document-text-outline', label: 'Terms & Conditions', route: 'LegalHub' as const },
                  { icon: 'trash-outline', label: 'Delete account', route: 'DeleteAccount' as const, danger: true },
                ].map((row) => (
                  <TouchableOpacity
                    key={row.route}
                    onPress={() => onNavigate?.(row.route)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderTopWidth: 1,
                      borderTopColor: Pal.colors.light.border,
                    }}
                  >
                    <Icon
                      name={row.icon}
                      size={18}
                      color={row.danger ? '#A84032' : Pal.colors.light.primary}
                    />
                    <Text style={{
                      flex: 1,
                      fontSize: 13,
                      fontFamily: Pal.typography.fontFamily.semibold,
                      color: row.danger ? '#A84032' : Pal.colors.light.text,
                    }}>
                      {row.label}
                    </Text>
                    <Icon name="chevron-forward" size={16} color={Pal.colors.light.textMuted} />
                  </TouchableOpacity>
                ))}
              </GlassCard>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: Pal.spacing[5],
            paddingBottom: Math.max(screenInsets.bottom, 24),
            gap: 12,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: Pal.typography.fontFamily.bold, fontSize: 18, color: Pal.colors.light.text }}>
                Write a Review
              </Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)}>
                <Icon name="close" size={24} color={Pal.colors.light.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary }}>Select Rating</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((val) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setRatingInput(val)}
                  accessibilityRole="button"
                  accessibilityLabel={`${val} star${val === 1 ? '' : 's'}`}
                >
                  <Icon
                    name={ratingInput != null && val <= ratingInput ? 'star' : 'star-outline'}
                    size={34}
                    color={ratingInput != null && val <= ratingInput ? '#FFB300' : Pal.colors.light.textMuted}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 13, color: Pal.colors.light.textSecondary }}>Your Comments</Text>
            <TextInput
              style={{
                minHeight: 100,
                borderWidth: 1,
                borderColor: Pal.colors.light.border,
                borderRadius: Pal.borderRadius.lg,
                padding: 12,
                textAlignVertical: 'top',
                color: Pal.colors.light.text,
                backgroundColor: Pal.colors.light.surface,
              }}
              placeholder="Tell others about this shop..."
              placeholderTextColor={Pal.colors.light.textMuted}
              multiline
              value={commentInput}
              onChangeText={setCommentInput}
            />
            <TouchableOpacity
              onPress={handleAddReview}
              disabled={submittingReview}
              style={{
                height: 48,
                borderRadius: Pal.borderRadius.full,
                backgroundColor: Pal.colors.light.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontFamily: Pal.typography.fontFamily.semibold, fontSize: 15 }}>
                  Post Review
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <BottomNavigation activeTab="map" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  coverWrap: {
    height: COVER_HEIGHT,
    backgroundColor: Pal.colors.light.primarySoft,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Pal.colors.light.primarySoft,
  },
  coverEmoji: { fontSize: 64 },
  coverScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44, 24, 16, 0.18)',
  },
  coverActions: {
    position: 'absolute',
    left: H_PAD,
    right: H_PAD,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coverBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActions: {
    position: 'absolute',
    left: H_PAD,
    right: H_PAD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  circleBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBlock: {
    paddingHorizontal: H_PAD,
    marginTop: 60,
    marginBottom: Pal.spacing[4],
    zIndex: 2,
  },
  avatarWrap: {
    alignItems: 'center',
    marginTop: -(AVATAR_SIZE / 2 + 16),
    marginBottom: 12,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: AVATAR_RING,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(185, 131, 75, 0.35)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarImage: {
    width: AVATAR_SIZE - AVATAR_RING * 2,
    height: AVATAR_SIZE - AVATAR_RING * 2,
    borderRadius: (AVATAR_SIZE - AVATAR_RING * 2) / 2,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Pal.colors.light.primarySoft,
  },
  avatarEmoji: { fontSize: 36 },
  previewBanner: {
    backgroundColor: Pal.colors.light.primarySoft,
    borderRadius: VendorUI.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Pal.colors.light.border,
    marginBottom: 12,
  },
  previewTitle: {
    fontFamily: Pal.typography.fontFamily.semibold,
    fontSize: 13,
    color: Pal.colors.light.primaryDark,
  },
  previewSub: {
    fontSize: 12,
    color: Pal.colors.light.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: VendorUI.radius.xl,
    padding: Pal.spacing[4],
    borderWidth: 1,
    borderColor: Pal.colors.light.border,
    shadowColor: 'rgba(185, 131, 75, 0.12)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  businessName: {
    fontFamily: Pal.typography.fontFamily.bold,
    fontSize: 22,
    color: Pal.colors.light.text,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  outlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  outlineBadgeText: {
    fontSize: 13,
    color: Pal.colors.light.textSecondary,
    fontFamily: Pal.typography.fontFamily.medium,
  },
  pendingHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#FF9F1C',
    fontFamily: Pal.typography.fontFamily.medium,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnText: {
    fontSize: 13,
    color: Pal.colors.light.textSecondary,
    fontFamily: Pal.typography.fontFamily.medium,
  },
  actionIconOnly: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Pal.colors.light.surface,
    borderWidth: 1,
    borderColor: Pal.colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrap: {
    width: 24,
    alignItems: 'center',
    marginTop: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Pal.colors.light.surface,
    borderRadius: Pal.borderRadius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: Pal.colors.light.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Pal.borderRadius.full,
  },
  segmentBtnActive: {
    backgroundColor: Pal.colors.light.primary,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: Pal.typography.fontFamily.semibold,
    color: Pal.colors.light.textSecondary,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  segmentDivider: {
    width: 1,
    backgroundColor: Pal.colors.light.border,
    marginVertical: 8,
  },
  offerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Pal.colors.light.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: Pal.colors.light.border,
    borderStyle: 'dashed',
    marginVertical: 12,
  },
});
