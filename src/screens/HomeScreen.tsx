import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  RefreshControl, Animated, Platform, useWindowDimensions, Image, ImageBackground,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { TouristSpot, UserPosition, UserActiveMode } from '../types';
import { resolveTripResume, TripResumeTarget } from '../utils/resumeTrip';
import { useUserContext } from '../context/UserContext';
import { useDataContext } from '../context/DataContext';
import { useLocationContext } from '../context/LocationContext';
import { getSwitchableModes } from '../utils/workspaceRoles';
import { DEV_FLAGS } from '../config/devFlags';
import HomeSidebar from '../components/HomeSidebar';
import { loadWishlistIds, toggleWishlistId } from '../utils/homeWishlist';
import { refreshUnreadBadgeCount } from '../services/notificationService';
import { getMainTabBarClearance } from '../design/tabBarLayout';
import { useResponsive, scale, verticalScale, fontScale, radiusScale } from '../design/responsive';
import { getLuxuryTheme, MAX_HOME_CONTENT_WIDTH } from '../design/luxuryTravel';
import {
  HomeHeader,
  HeroAITripPlannerCard,
  type HeroPlannerState,
  TravelCategoriesRow,
  ExploreNearYouSection,
  VendorOffersNearYouSection,
  TreasureHuntBanner,
  type NearbyPlaceItem,
} from '../components/home';
import { PalPointsBalanceCard } from '../components/home/PalPointsBalanceCard';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { useHomeRewardsData } from '../hooks/useHomeRewardsData';
import { useNearbyPlacesFromGps } from '../hooks/useNearbyPlacesFromGps';
import { isReliableUserPosition, isValidLatLng } from '../services/location/distance';
import { getRoutedDistanceFields } from '../services/location/routedDistance';
import { walletApi } from '../services/api';
import { hasValidImageUrl } from '../utils/imageUrl';
import { buildNearbyVendorOffers } from '../utils/homeVendorOffers';

const TRAVELER_BANNER = require('../assets/traveler_banner.jpg');
const MAP_BANNER = require('../assets/map_banner.jpg');

/** Home accents — warm brown/cream, no yellow/gold. */
const HOME = {
  accent: '#63300E',
  accentSoft: 'rgba(99, 48, 14, 0.12)',
  iconOnDark: '#E5D5C5',
  iconMuted: '#8B7355',
  cream: '#E5D5C5',
} as const;

const H_PAD = 20;
const theme = getLuxuryTheme('light');

interface HomeScreenProps {
  user: {
    displayName: string;
    totalPoints?: number;
    avatarStyle?: number;
    avatar?: string | null;
    currentItinerary?: string[];
    completedItineraryStops?: string[];
    roles?: string[];
    permission?: string;
    creatorProfile?: { status?: string };
  };
  position: UserPosition | null;
  places: TouristSpot[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onStartTrip: () => void;
  onSelectSpot: (spot: { id: string }) => void;
  onNavigateToMap?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToRewards?: () => void;
  onNavigateToWallet?: () => void;
  onNavigateToSearch?: (query?: string, categoryId?: string) => void;
  onNavigateToAITripPlanner?: () => void;
  onNavigateToHiddenGems?: () => void;
  onNavigateToVendors?: () => void;
  onNavigateToTrips?: () => void;
  onNavigateToLegal?: () => void;
  onNavigateToTreasureHunt?: () => void;
  onBecomeCreator?: () => void;
  onBecomeVendor?: () => void;
  onOpenCreatorStudio?: () => void;
  onOpenVendorWorkspace?: () => void;
  onLogout?: () => void;
  onSwitchMode?: (mode: UserActiveMode) => Promise<void>;
}

function getNextStopPlace(
  currentItinerary: string[] | undefined,
  completedStops: string[] | undefined,
  allPlaces: TouristSpot[],
): TouristSpot | null {
  if (!currentItinerary?.length) return null;
  const completed = completedStops || [];
  const nextId = currentItinerary.find(id => !completed.includes(id));
  if (!nextId) return null;
  return allPlaces.find(p => p.id === nextId) || null;
}

function getNextStopInfo(
  currentItinerary: string[] | undefined,
  completedStops: string[] | undefined,
  allPlaces: TouristSpot[],
  routeLabel?: string,
): { name: string; distance: string } | null {
  if (!currentItinerary?.length) return null;
  const completed = completedStops || [];
  const nextId = currentItinerary.find(id => !completed.includes(id));
  if (!nextId) {
    return { name: 'Trip Completed 🎉', distance: '0m' };
  }
  const place = allPlaces.find(p => p.id === nextId);
  if (!place) {
    return { name: 'Next stop', distance: 'Nearby' };
  }
  const distStr = routeLabel || 'Nearby';
  return { name: place.name, distance: distStr };
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning,';
  if (hour < 17) return 'Good Afternoon,';
  return 'Good Evening,';
}

// -----------------------------------------------------------------------------
// Pulse Skeleton Loader Component
// -----------------------------------------------------------------------------
function Skeleton({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return <Animated.View style={[style, { opacity, backgroundColor: '#EFEAE2' }]} />;
}

// -----------------------------------------------------------------------------
// Section Empty State Component
// -----------------------------------------------------------------------------
function EmptyState({ icon, title, description, ctaLabel, onCtaPress }: {
  icon: string;
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
      {ctaLabel && onCtaPress && (
        <TouchableOpacity style={styles.emptyButton} onPress={onCtaPress} activeOpacity={0.8}>
          <Text style={styles.emptyBtnText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function HomeScreen({
  user,
  position,
  places,
  loading = false,
  error = null,
  onRefresh,
  onStartTrip,
  onSelectSpot,
  onNavigateToMap,
  onNavigateToProfile: _onNavigateToProfile,
  onNavigateToLeaderboard,
  onNavigateToRewards,
  onNavigateToWallet,
  onNavigateToSearch,
  onNavigateToAITripPlanner,
  onNavigateToHiddenGems,
  onNavigateToVendors,
  onNavigateToTrips: _onNavigateToTrips,
  onNavigateToLegal,
  onNavigateToTreasureHunt,
  onBecomeCreator,
  onBecomeVendor,
  onOpenCreatorStudio,
  onOpenVendorWorkspace,
  onLogout,
  onSwitchMode,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: windowW } = useWindowDimensions();
  const responsive = useResponsive();

  const layout = useMemo(() => {
    const maxW = responsive.isTablet ? MAX_HOME_CONTENT_WIDTH : 440;
    const layoutW = Math.min(windowW, maxW);
    const heroW = layoutW - H_PAD * 2;
    return {
      layoutW,
      heroW,
      heroH: heroW * 0.58,
      placeCardW: layoutW * (responsive.isSmallPhone ? 0.72 : 0.68),
      reelCardW: layoutW * 0.38,
      offerCardW: layoutW * (responsive.isSmallPhone ? 0.52 : 0.46),
    };
  }, [windowW, responsive.isTablet, responsive.isSmallPhone]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { isGuest, user: ctxUser, setUser } = useUserContext();
  const { vendors, vendorOffers, currentVendor } = useDataContext();
  const { requestPermission } = useLocationContext();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cityName, setCityName] = useState<string>('Nearby');
  const [resumeTarget, setResumeTarget] = useState<TripResumeTarget | null>(null);
  const [palPoints, setPalPoints] = useState(Number(user?.totalPoints) || 0);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [weather, setWeather] = useState<{ temp: number; text: string; icon: string } | null>(null);
  const [nearbyDistanceLabels, setNearbyDistanceLabels] = useState<Record<string, string>>({});
  const [nextStopRouteLabel, setNextStopRouteLabel] = useState('');
  const [vendorOfferDistanceLabels, setVendorOfferDistanceLabels] = useState<Record<string, string>>({});

  // Simulated AI Generating State (State 2)
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationPhase, setGenerationPhase] = useState('Finding amazing places...');
  
  // Simulated Completed Trip state (State 5)
  const [isTripCompleted, setIsTripCompleted] = useState(false);

  const allPlaces = useMemo(() => [...places], [places]);

  const {
    spots: nearbySpots,
    loading: nearbyLoading,
    refresh: refreshNearby,
    hasCoords: hasNearbyCoords,
  } = useNearbyPlacesFromGps(position?.latitude, position?.longitude);

  useFocusEffect(
    useCallback(() => {
      if (position?.latitude != null && position?.longitude != null) {
        refreshNearby();
      }
    }, [position?.latitude, position?.longitude, refreshNearby]),
  );

  useEffect(() => {
    if (!isReliableUserPosition(position)) {
      setNearbyDistanceLabels({});
      return;
    }

    const visible = nearbySpots.slice(0, 12);
    if (!visible.length) {
      setNearbyDistanceLabels({});
      return;
    }

    let cancelled = false;
    const origin = { latitude: position.latitude, longitude: position.longitude };
    Promise.all(
      visible.map(async spot => {
        const routed = await getRoutedDistanceFields(origin, {
          latitude: spot.latitude,
          longitude: spot.longitude,
        });
        return [spot.id, routed.distanceLabel || ''] as const;
      }),
    ).then(entries => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, label] of entries) {
        if (label) next[id] = label;
      }
      setNearbyDistanceLabels(next);
    }).catch(() => {
      if (!cancelled) setNearbyDistanceLabels({});
    });

    return () => {
      cancelled = true;
    };
  }, [nearbySpots, position]);

  useEffect(() => {
    const nextPlace = getNextStopPlace(user?.currentItinerary, user?.completedItineraryStops, allPlaces);
    if (!nextPlace || !isReliableUserPosition(position) || !isValidLatLng(nextPlace.latitude, nextPlace.longitude)) {
      setNextStopRouteLabel('');
      return;
    }
    let cancelled = false;
    const origin = { latitude: position.latitude, longitude: position.longitude };
    getRoutedDistanceFields(origin, {
      latitude: nextPlace.latitude,
      longitude: nextPlace.longitude,
    }).then(routed => {
      if (!cancelled) setNextStopRouteLabel(routed.distanceLabel || '');
    }).catch(() => {
      if (!cancelled) setNextStopRouteLabel('');
    });
    return () => {
      cancelled = true;
    };
  }, [user?.currentItinerary, user?.completedItineraryStops, allPlaces, position]);

  useEffect(() => {
    if (!isReliableUserPosition(position)) {
      setVendorOfferDistanceLabels({});
      return;
    }
    const offers = buildNearbyVendorOffers(vendorOffers, vendors, position, 3)
      .filter(offer => offer.latitude != null && offer.longitude != null)
      .slice(0, 3);
    if (!offers.length) {
      setVendorOfferDistanceLabels({});
      return;
    }
    let cancelled = false;
    const origin = { latitude: position.latitude, longitude: position.longitude };
    Promise.all(
      offers.map(async offer => {
        const routed = await getRoutedDistanceFields(origin, {
          latitude: offer.latitude,
          longitude: offer.longitude,
        });
        return [offer.id, routed.distanceLabel || ''] as const;
      }),
    ).then(entries => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, label] of entries) {
        if (label) next[id] = label;
      }
      setVendorOfferDistanceLabels(next);
    }).catch(() => {
      if (!cancelled) setVendorOfferDistanceLabels({});
    });
    return () => {
      cancelled = true;
    };
  }, [vendorOffers, vendors, position]);

  useEffect(() => {
    if (hasNearbyCoords) return;
    const t = setTimeout(() => {
      requestPermission().catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [hasNearbyCoords, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      setPalPoints(Number(user?.totalPoints) || 0);
      loadWishlistIds().then(setWishlistIds);

      if (isGuest || !DEV_FLAGS.USE_SERVER_API) return;
      let cancelled = false;
      (async () => {
        try {
          const { walletApi } = require('../services/api') as typeof import('../services/api');
          const res = await walletApi.getProfile();
          const profile: any = res?.data ?? res;
          const pts = Number(profile?.palPoints ?? user?.totalPoints ?? 0);
          if (!cancelled && !Number.isNaN(pts)) setPalPoints(pts);
        } catch { /* keep fallback */ }

        try {
          await refreshUnreadBadgeCount();
        } catch { /* offline */ }
      })();
      return () => { cancelled = true; };
    }, [isGuest, user?.totalPoints]),
  );

  const openRewards = onNavigateToRewards || onNavigateToLeaderboard;
  const openWallet = onNavigateToWallet || onNavigateToLeaderboard;

  // Reverse Geocoding
  useEffect(() => {
    if (position?.latitude && position?.longitude) {
      let cancelled = false;
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.latitude}&lon=${position.longitude}&zoom=10&addressdetails=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' } },
      )
        .then(r => { if (!r.ok) throw new Error('Geocode failed'); return r.json(); })
        .then(data => {
          if (cancelled) return;
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || '';
          setCityName(city || 'Nearby');
        })
        .catch(() => {
          if (cancelled) return;
          setCityName('Nearby');
        });
      return () => { cancelled = true; };
    }
    setCityName('Nearby');
  }, [position]);

  // Weather fetch
  useEffect(() => {
    if (!position?.latitude || !position?.longitude) return;
    let cancelled = false;
    
    // Open-Meteo free API
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${position.latitude}&longitude=${position.longitude}&current=temperature_2m,weather_code`;
    
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.current) {
          const temp = Math.round(data.current.temperature_2m);
          const code = data.current.weather_code;
          
          let text = 'Clear';
          let icon = 'sunny';
          
          // WMO Weather interpretation codes
          if (code === 0) { text = 'Clear'; icon = 'sunny'; }
          else if (code >= 1 && code <= 3) { text = 'Cloudy'; icon = 'partly-sunny'; }
          else if (code >= 45 && code <= 48) { text = 'Fog'; icon = 'cloud'; }
          else if (code >= 51 && code <= 67) { text = 'Rain'; icon = 'rainy'; }
          else if (code >= 71 && code <= 77) { text = 'Snow'; icon = 'snow'; }
          else if (code >= 80 && code <= 82) { text = 'Showers'; icon = 'rainy'; }
          else if (code >= 95 && code <= 99) { text = 'Thunderstorm'; icon = 'thunderstorm'; }
          
          setWeather({ temp, text, icon });
        }
      })
      .catch(() => {});
      
    return () => { cancelled = true; };
  }, [position?.latitude, position?.longitude]);

  // Entrance fade-in animation
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const loadResume = useCallback(async () => {
    if (isGuest || !DEV_FLAGS.USE_SERVER_API) {
      setResumeTarget(null);
      return;
    }
    try {
      const target = await resolveTripResume({ isGuest });
      setResumeTarget(target.kind === 'hub' && target.stopCount === 0 ? null : target);
    } catch {
      setResumeTarget(null);
    }
  }, [isGuest]);

  useFocusEffect(useCallback(() => { loadResume(); }, [loadResume]));

  const itineraryPlaces = useMemo(() => {
    if (!user?.currentItinerary?.length) return [] as TouristSpot[];
    return user.currentItinerary
      .map(id => allPlaces.find(p => p.id === id))
      .filter(Boolean) as TouristSpot[];
  }, [user?.currentItinerary, allPlaces]);

  const localStopCount = user?.currentItinerary?.length || 0;
  const resumeStopCount = resumeTarget?.stopCount || localStopCount;
  const progressPct = resumeTarget?.progressPct
    ?? (localStopCount > 0
      ? Math.round(((user?.completedItineraryStops?.length || 0) / localStopCount) * 100)
      : 0);

  const needsResume = !isGuest && (resumeStopCount > 0 || (resumeTarget && resumeTarget.kind !== 'hub'));
  const isTripActive = resumeTarget?.kind === 'tripDetail' && resumeTarget.status === 'ACTIVE';

  const firstName = user.displayName?.split(' ')[0] || 'Traveler';
  const switchableModes = useMemo(
    (): UserActiveMode[] =>
      getSwitchableModes(ctxUser || user, currentVendor?.verificationStatus),
    [ctxUser, user, currentVendor?.verificationStatus],
  );

  const {
    homeOffer: featuredOffer,
    nextCampaign,
    refresh: refreshHomeRewards,
  } = useHomeRewardsData({
    palPointsBalance: palPoints,
    isGuest,
    latitude: position?.latitude,
    longitude: position?.longitude,
  });

  const refreshWalletBalance = useCallback(async () => {
    if (isGuest || !DEV_FLAGS.USE_SERVER_API) return;
    try {
      const res = await walletApi.getProfile();
      const profile: { palPoints?: number } =
        (res as { data?: { palPoints?: number } })?.data ?? (res as object);
      const pts = Number(profile?.palPoints ?? user?.totalPoints ?? 0);
      if (!Number.isNaN(pts)) {
        setPalPoints(pts);
        setUser(prev => ({ ...prev, totalPoints: pts }));
      }
    } catch {
      /* offline */
    }
  }, [isGuest, setUser, user?.totalPoints]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([
      Promise.resolve(onRefresh?.()),
      refreshNearby(),
      refreshHomeRewards(),
      refreshWalletBalance(),
    ]);
  }, [onRefresh, refreshNearby, refreshHomeRewards, refreshWalletBalance]);

  const handleToggleWishlist = async (id: string) => {
    const next = await toggleWishlistId(id);
    setWishlistIds(next);
  };

  // -----------------------------------------------------------------------------
  // AI Trip Planner State Handlers
  // -----------------------------------------------------------------------------
  const handlePlanMyTripClick = () => {
    // Enter simulated generating state for demo
    setAiGenerating(true);
    setGenerationProgress(0);
    setGenerationPhase('Understanding your trip preferences...');

    // Progress bar tick
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setGenerationProgress(progress);
      if (progress === 30) {
        setGenerationPhase('Finding amazing landmarks nearby...');
      } else if (progress === 60) {
        setGenerationPhase('Balancing daily pace and distances...');
      } else if (progress === 80) {
        setGenerationPhase('Finalizing custom itineraries...');
      }
      
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setAiGenerating(false);
          onNavigateToAITripPlanner?.();
        }, 300);
      }
    }, 350);
  };

  const getNextStopInfoForHero = () =>
    getNextStopInfo(user?.currentItinerary, user?.completedItineraryStops, allPlaces, nextStopRouteLabel);
  const nextStop = getNextStopInfoForHero();

  const nearbyPlaces = useMemo((): NearbyPlaceItem[] => {
    if (!position || !isValidLatLng(position.latitude, position.longitude)) return [];
    return nearbySpots.map(p => {
      return {
        id: p.id,
        name: p.name,
        imageUri: hasValidImageUrl(p.imageUrl) ? p.imageUrl : hasValidImageUrl(p.imageUri) ? p.imageUri : undefined,
        rating: p.rating != null && p.rating > 0 ? p.rating : undefined,
        distance: nearbyDistanceLabels[p.id] || '',
        isOpen: true,
      };
    });
  }, [nearbySpots, nearbyDistanceLabels, position]);

  const nearbySpotById = useMemo(() => {
    const map = new Map<string, TouristSpot>();
    for (const spot of nearbySpots) map.set(spot.id, spot);
    return map;
  }, [nearbySpots]);

  const heroBannerSource = needsResume ? MAP_BANNER : TRAVELER_BANNER;

  const heroState = useMemo((): HeroPlannerState => {
    if (aiGenerating) {
      return { kind: 'generating', progress: generationProgress, phase: generationPhase };
    }
    if (isTripCompleted) {
      return { kind: 'completed', onDismiss: () => setIsTripCompleted(false) };
    }
    if (needsResume && isTripActive && nextStop) {
      return {
        kind: 'activeTrip',
        nextStopName: nextStop.name,
        nextStopDistance: nextStop.distance,
        onResume: onStartTrip,
      };
    }
    if (needsResume && !isTripActive) {
      return {
        kind: 'itineraryReady',
        title: resumeTarget?.title || 'Your trip',
        daysLabel: `${resumeTarget?.stopCount && resumeTarget.stopCount > 4 ? 3 : 2} Days`,
        stopCount: resumeStopCount,
        progressPct,
        onView: onStartTrip,
      };
    }
    return { kind: 'idle' };
  }, [
    aiGenerating,
    generationProgress,
    generationPhase,
    isTripCompleted,
    needsResume,
    isTripActive,
    nextStop?.name,
    nextStop?.distance,
    nextStopRouteLabel,
    onStartTrip,
    resumeTarget?.title,
    resumeTarget?.stopCount,
    resumeStopCount,
    progressPct,
  ]);

  const locationLabel = cityName && cityName !== 'Nearby' ? cityName : 'Nearby';

  const handleSelectNearby = useCallback(
    (id: string) => {
      const spot = nearbySpotById.get(id);
      if (spot) onSelectSpot(spot);
    },
    [nearbySpotById, onSelectSpot],
  );

  const openVendorOffers = useCallback(() => {
    navigation.navigate('VendorOffers');
  }, [navigation]);

  const openOfferDetail = useCallback(
    (offerId: string) => {
      if (offerId.startsWith('demo-')) {
        openVendorOffers();
        return;
      }
      navigation.navigate('VendorOfferDetail', { offerId });
    },
    [navigation, openVendorOffers],
  );

  const nearbyVendorOffers = useMemo(() => {
    const offers = buildNearbyVendorOffers(vendorOffers, vendors, position, 3);
    return offers.map(offer => ({
      ...offer,
      distanceLabel: vendorOfferDistanceLabels[offer.id] || offer.distanceLabel,
    }));
  }, [vendorOffers, vendors, position, vendorOfferDistanceLabels]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingBottom: getMainTabBarClearance(insets.bottom) + 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={!!loading}
            onRefresh={handleRefreshAll}
            tintColor={HOME.accent}
            colors={[HOME.accent]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <Animated.View style={[styles.contentShell, { opacity: fadeAnim }]}>
          
          {/* Top Section with Hero Image */}
          <ImageBackground
            source={require('../assets/Homescreen_cover.jpeg')}
            style={styles.heroSection}
            resizeMode="cover"
          >
            
            {/* Safe Area Padding */}
            <View style={{ height: Math.max(insets.top, 20) }} />

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                onPress={() => setSidebarOpen(true)} 
                style={[styles.menuButton, { zIndex: 10, elevation: 10 }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Icon name="menu-outline" size={32} color="#1E1B18" />
              </TouchableOpacity>
              
              <Image 
                source={require('../assets/screen_logo.png')} 
                style={styles.logo} 
                resizeMode="contain"
              />
              
              <View style={styles.headerRight}>
                <TouchableOpacity onPress={onNavigateToLeaderboard} style={styles.leaderboardBtn}>
                  <Icon name="trophy-outline" size={scale(24)} color="#1E1B18" />
                </TouchableOpacity>
                <TouchableOpacity onPress={openWallet} style={styles.pointsPill}>
                  <View style={styles.pointsIconCircle}>
                    <PalPointsIcon size={scale(16)} />
                  </View>
                  <View style={styles.pointsTextWrap}>
                    <Text style={styles.pointsValue}>{palPoints.toLocaleString()}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Greeting */}
            <View style={styles.greetingContainer}>
              <View style={styles.greetingLeft}>
                <Text style={styles.greetingTime}>{getTimeGreeting()}</Text>
                <Text style={[styles.greetingName, isGuest && styles.greetingNameGuest]}>{user.displayName?.split(' ')[0] || firstName} 👋</Text>
              </View>

              <View style={styles.weatherBlock}>
                <View style={styles.weatherRow}>
                  <Icon name="location-sharp" size={16} color="#FFFFFF" />
                  <Text style={styles.locationText}>{locationLabel}</Text>
                </View>
                <View style={styles.weatherRow}>
                  <Icon name={weather?.icon || 'sunny'} size={18} color="#FFFFFF" />
                  <Text style={styles.weatherText}>
                    {weather ? `${weather.temp}°C ${weather.text}` : '28°C Sunny'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <TouchableOpacity style={styles.searchBar} onPress={() => onNavigateToSearch?.()} activeOpacity={0.9}>
                <Icon name="search-outline" size={20} color="#776E65" />
                <Text style={styles.searchText}>Search places, hotels, cafes, events...</Text>
              </TouchableOpacity>
            </View>
          </ImageBackground>

          {/* Quick Categories */}
          <View style={styles.categoriesWrapper}>
            <View style={styles.categoriesCard}>
              <TouchableOpacity style={styles.categoryItem} onPress={() => onNavigateToSearch?.('Nearby', 'nearby')}>
                <Icon name="location" size={26} color={HOME.iconOnDark} />
                <Text style={styles.categoryText}>Nearby</Text>
              </TouchableOpacity>
              <View style={styles.categoryDivider} />
              
              <TouchableOpacity style={styles.categoryItem} onPress={() => onNavigateToSearch?.('Hotels', 'stay')}>
                <Icon name="bed" size={26} color={HOME.iconOnDark} />
                <Text style={styles.categoryText}>Hotels</Text>
              </TouchableOpacity>
              <View style={styles.categoryDivider} />
              
              <TouchableOpacity style={styles.categoryItem} onPress={() => onNavigateToSearch?.('Food', 'food')}>
                <Icon name="restaurant" size={26} color={HOME.iconOnDark} />
                <Text style={styles.categoryText}>Food</Text>
              </TouchableOpacity>
              <View style={styles.categoryDivider} />
              
              <TouchableOpacity style={styles.categoryItem} onPress={() => onNavigateToSearch?.('Temples', 'temples')}>
                <Icon name="business" size={26} color={HOME.iconOnDark} />
                <Text style={styles.categoryText}>Temples</Text>
              </TouchableOpacity>
              <View style={styles.categoryDivider} />
              
              <TouchableOpacity style={styles.categoryItem} onPress={() => onNavigateToSearch?.()}>
                <Icon name="grid" size={26} color={HOME.iconOnDark} />
                <Text style={styles.categoryText}>More</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Continue Your Journey */}
          {resumeTarget && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Continue Your Journey</Text>
                <TouchableOpacity onPress={onStartTrip}>
                  <Text style={styles.viewAllText}>View all →</Text>
                </TouchableOpacity>
              </View>
              
              <ImageBackground 
                source={require('../assets/map_banner.jpg')} 
                style={styles.tripCard}
                imageStyle={{ borderRadius: 24 }}
                resizeMode="cover"
              >
                <View style={styles.tripCardOverlay} />
                <Text style={styles.tripTitle}>{resumeTarget.title}</Text>
                <Text style={styles.tripProgressText}>{progressPct}% Completed</Text>
                
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                </View>
                
                <View style={styles.tripActionRow}>
                  <TouchableOpacity style={styles.resumeButton} onPress={onStartTrip}>
                    <Text style={styles.resumeButtonText}>Resume Trip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.arrowCircleButton} onPress={onStartTrip}>
                    <Icon name="arrow-forward" size={20} color="#1E1B18" />
                  </TouchableOpacity>
                </View>
              </ImageBackground>
            </View>
          )}

          {/* Trending Near You */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Icon name="flame" size={18} color="#B9834B" />
                <Text style={styles.sectionTitle}>Places Nearby</Text>
              </View>
              <TouchableOpacity onPress={onNavigateToMap}>
                <Text style={styles.viewAllText}>View all →</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
              {nearbyPlaces.slice(0, 3).map((place, idx) => (
                <TouchableOpacity key={place.id || idx} style={styles.trendingCard} onPress={() => handleSelectNearby(place.id)}>
                  <Image source={{ uri: place.imageUri || 'https://images.unsplash.com/photo-1596423735880-5c2921568e64?q=80&w=600' }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  <View style={styles.trendingCardOverlay} />
                  <TouchableOpacity style={styles.heartButton} onPress={() => handleToggleWishlist(place.id)}>
                    <Icon name={wishlistIds.includes(place.id) ? "heart" : "heart-outline"} size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View style={styles.trendingCardBottom}>
                    <Text style={styles.trendingPlaceName} numberOfLines={1}>{place.name}</Text>
                    <View style={styles.trendingStatsRow}>
                      <View style={styles.ratingWrap}>
                        <Icon name="star" size={12} color={HOME.iconOnDark} />
                        <Text style={styles.ratingText}>{place.rating || '4.5'} (201)</Text>
                      </View>
                      <Text style={styles.distanceText}>{place.distance}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
              
              {/* Explore More Card */}
              <TouchableOpacity style={styles.exploreMoreCard} onPress={onNavigateToMap}>
                <View style={styles.exploreMoreIconWrap}>
                  <Icon name="navigate-outline" size={28} color={HOME.iconOnDark} />
                </View>
                <Text style={styles.exploreMoreText}>Explore{'\n'}More</Text>
                <View style={styles.exploreMoreArrow}>
                  <Icon name="arrow-forward" size={18} color="#1E1B18" />
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Vendor Offers Near You */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Icon name="pricetag" size={18} color="#B9834B" />
                <Text style={styles.sectionTitle}>Vendor Offers Near You</Text>
              </View>
              <TouchableOpacity onPress={openVendorOffers}>
                <Text style={styles.viewAllText}>View all →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
              <TouchableOpacity style={styles.promoOfferCard} onPress={openVendorOffers} activeOpacity={0.9}>
                <Icon name="gift-outline" size={24} color="#B9834B" style={{ marginBottom: 12 }} />
                <Text style={styles.promoOfferTitle}>Exciting offers</Text>
                <Text style={styles.promoOfferSub}>from top local{'\n'}vendors!</Text>
                <View style={styles.promoArrowBtn}>
                  <Icon name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              
              {nearbyVendorOffers.slice(0, 3).map((offer, idx) => (
                <TouchableOpacity key={offer.id || idx} style={styles.vendorOfferCard} onPress={() => openOfferDetail(offer.id)} activeOpacity={0.9}>
                  <Image source={{ uri: offer.imageUri || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=400' }} style={styles.vendorOfferImage} />
                  <View style={styles.vendorOfferDiscountBadge}>
                    <Text style={styles.vendorOfferDiscountText}>{offer.headline.includes('%') ? offer.headline.split(' ')[0] : '20% OFF'}</Text>
                  </View>
                  <TouchableOpacity style={styles.offerHeartBtn}>
                    <Icon name="heart-outline" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View style={styles.vendorOfferBottom}>
                    <Text style={styles.vendorOfferName} numberOfLines={1}>{offer.vendorName}</Text>
                    <Text style={styles.vendorOfferLoc} numberOfLines={1}>{cityName === 'Nearby' ? 'Jabalpur' : cityName}</Text>
                    <View style={styles.vendorOfferRatingRow}>
                      <Text style={styles.vendorOfferRatingTxt}>4.5 <Icon name="star" size={10} color="#B9834B" /></Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Treasure Hunt */}
          <View style={[styles.sectionContainer, { paddingHorizontal: 20 }]}>
            <TouchableOpacity style={styles.treasureHuntBanner} onPress={onNavigateToTreasureHunt} activeOpacity={0.9}>
              <ImageBackground 
                source={require('../assets/treasure_hunt_bg_new.jpg')} 
                style={styles.treasureHuntBg}
                imageStyle={{ borderRadius: 16 }}
                resizeMode="cover"
              >
                <View style={styles.treasureHuntOverlay} />
                <View style={styles.treasureHuntContent}>
                  <Text style={styles.treasureHuntTitle}>Treasure Hunt ✨</Text>
                  <Text style={styles.treasureHuntSub}>Exciting rewards coming{'\n'}your way!</Text>
                  <View style={styles.treasureHuntBtn}>
                    <Text style={styles.treasureHuntBtnTxt}>Coming Soon</Text>
                  </View>
                </View>
                <View style={styles.treasureDots}>
                  <View style={styles.treasureDotActive} />
                  <View style={styles.treasureDot} />
                  <View style={styles.treasureDot} />
                </View>
              </ImageBackground>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </ScrollView>

      <HomeSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={ctxUser || (user as any)}
        palPoints={palPoints}
        activeMode={ctxUser?.activeMode || 'USER'}
        switchableModes={switchableModes}
        onSwitchMode={onSwitchMode}
        onNavigateToWallet={openWallet}
        onNavigateToRewards={openRewards}
        onNavigateToLeaderboard={onNavigateToLeaderboard}
        onNavigateToVendorOffers={openVendorOffers}
        onNavigateToHiddenGems={onNavigateToHiddenGems}
        onBecomeCreator={onBecomeCreator}
        onBecomeVendor={onBecomeVendor}
        onOpenCreatorStudio={onOpenCreatorStudio}
        onOpenVendorWorkspace={onOpenVendorWorkspace}
        onNavigateToLegal={onNavigateToLegal}
        onLogout={onLogout}
        isGuest={isGuest}
        vendorVerificationStatus={currentVendor?.verificationStatus}
        onNavigateToSaved={() => onNavigateToSearch?.('Saved', 'saved')}
        onNavigateToSettings={() => navigation.navigate('Settings')}
        onNavigateToHelp={() => onNavigateToLegal?.()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  emptyDesc: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 5 },
  emptyButton: { marginTop: 15, padding: 10, backgroundColor: HOME.accent, borderRadius: 8 },
  emptyBtnText: { color: '#FFF', fontWeight: 'bold' },
  contentShell: {
    alignSelf: 'center',
    maxWidth: MAX_HOME_CONTENT_WIDTH,
    width: '100%',
  },
  heroSection: {
    paddingBottom: 40, // Space for the floating categories card
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  menuButton: {
    padding: 4,
    marginLeft: -4,
  },
  logo: {
    position: 'absolute',
    left: '50%',
    marginLeft: -115,
    alignSelf: 'center',
    width: 190,
    height: 62,
    marginTop: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  leaderboardBtn: {
    width: scale(36),
    height: scale(36),
    borderRadius: radiusScale(18),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8D5C4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E2219',
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 8,
    paddingRight: 12,
  },
  pointsIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: HOME.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsTextWrap: {
    justifyContent: 'center',
  },
  pointsValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  greetingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 12,
  },
  greetingLeft: {
    flex: 1,
    marginRight: 12,
  },
  greetingTime: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '600',
  },
  greetingName: {
    fontSize: 28,
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    marginTop: -4,
    letterSpacing: -1,
  },
  greetingNameGuest: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  weatherBlock: {
    alignItems: 'flex-end',
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  weatherDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#C5B5A3',
    marginHorizontal: 10,
  },
  weatherText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 4,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 36,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 54,
    shadowColor: '#4B3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  searchText: {
    flex: 1,
    fontSize: 14,
    color: '#A39990',
    marginLeft: 10,
    fontWeight: '400',
  },
  categoriesWrapper: {
    paddingHorizontal: 20,
    marginTop: -45, // Pull it up over the cover image
    zIndex: 10,
  },
  categoriesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2D241D',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    shadowColor: '#1E1B18',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  categoryItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    color: '#E5D5C5',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
  },
  categoryDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(229, 213, 197, 0.15)',
  },
  sectionContainer: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#1E1B18',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
  },
  viewAllText: {
    fontSize: 13,
    color: '#6B5B4E',
    fontWeight: '600',
  },
  tripCard: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 20,
    justifyContent: 'center',
  },
  tripCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  tripTitle: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '600',
    marginTop: 8,
  },
  tripProgressText: {
    color: '#E5D5C5',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 12,
    width: '50%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: HOME.cream,
    borderRadius: 2,
  },
  tripActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
  },
  resumeButton: {
    backgroundColor: HOME.cream,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  resumeButtonText: {
    color: '#1E1B18',
    fontSize: 13,
    fontWeight: '700',
  },
  arrowCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  trendingScroll: {
    paddingRight: 20,
    gap: 12,
  },
  trendingCard: {
    width: scale(140),
    height: verticalScale(180),
    borderRadius: radiusScale(16),
    overflow: 'hidden',
  },
  trendingCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heartButton: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  trendingCardBottom: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  trendingPlaceName: {
    color: '#FFF',
    fontSize: fontScale(14),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: verticalScale(4),
  },
  trendingStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  distanceText: {
    color: '#E5D5C5',
    fontSize: 11,
    fontWeight: '500',
  },
  exploreMoreCard: {
    width: scale(120),
    height: verticalScale(180),
    borderRadius: radiusScale(16),
    backgroundColor: '#2D241D',
    padding: scale(16),
    justifyContent: 'center',
    alignItems: 'center',
  },
  exploreMoreIconWrap: {
    width: scale(48),
    height: scale(48),
    borderRadius: radiusScale(24),
    borderWidth: 1,
    borderColor: HOME.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(16),
  },
  exploreMoreText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  exploreMoreArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: HOME.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  promoOfferCard: {
    width: scale(140),
    height: verticalScale(160),
    borderRadius: radiusScale(12),
    backgroundColor: '#F3EDE4',
    padding: scale(16),
    justifyContent: 'space-between',
  },
  promoOfferTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  promoOfferSub: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  promoArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C58C4F',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  vendorOfferCard: {
    width: scale(140),
    height: verticalScale(160),
    borderRadius: radiusScale(12),
    backgroundColor: '#FFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  vendorOfferImage: {
    width: '100%',
    height: '60%',
    backgroundColor: '#EEE',
  },
  vendorOfferDiscountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#C58C4F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vendorOfferDiscountText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  offerHeartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  vendorOfferBottom: {
    padding: 8,
  },
  vendorOfferName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  vendorOfferLoc: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  vendorOfferRatingRow: {
    marginTop: 4,
    flexDirection: 'row',
  },
  vendorOfferRatingTxt: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
  },
  treasureHuntBanner: {
    width: '100%',
    height: verticalScale(140),
    borderRadius: radiusScale(16),
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 24,
  },
  treasureHuntBg: {
    width: '100%',
    height: '100%',
  },
  treasureHuntOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  treasureHuntContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  treasureHuntTitle: {
    fontSize: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: 'bold',
    color: '#F4D068',
  },
  treasureHuntSub: {
    fontSize: 12,
    color: '#FFF',
    marginTop: 4,
    marginBottom: 12,
  },
  treasureHuntBtn: {
    backgroundColor: '#C58C4F',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  treasureHuntBtnTxt: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  treasureDots: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  treasureDotActive: {
    width: 16,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F4D068',
  },
  treasureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
