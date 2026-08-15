import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ActivityIndicator,
  ScrollView, StatusBar, Linking, Alert, TextInput,
  useWindowDimensions, Image, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeWebView, type SafeWebViewRef } from '../components/SafeWebView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import Pal from '../design/DesignSystem';
import { getMainTabBarClearance, MAIN_TAB_CONTENT_GAP } from '../design/tabBarLayout';
import { useResponsive } from '../design/responsive';

import { launchImageLibrary } from 'react-native-image-picker';
import { useLocationContext } from '../context/LocationContext';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import type { TouristSpot, UserProfile, VendorBusiness, UserPosition } from '../types';
import { placesApi, searchApi, uploadApi } from '../services/api';
import { getPlaceById } from '../services/placesService';
import { userPlaceImagesApi } from '../services/api/userPlaceImages';
import { DEV_FLAGS } from '../config/devFlags';
import RideOptionsSheet from '../components/RideOptionsSheet';
import MapPlaceDetailCard from '../components/MapPlaceDetailCard';
import MapVendorDetailCard from '../components/MapVendorDetailCard';
import { MapExploreSearchBar } from '../features/mapExplore/components/MapExploreSearchBar';
import { MapCategoryChips } from '../features/mapExplore/components/MapCategoryChips';
import { MapSegmentControl } from '../features/mapExplore/components/MapSegmentControl';
import { MapVendorCategoryChips } from '../features/mapExplore/components/MapVendorCategoryChips';
import { buildMapCategoryChips } from '../features/mapExplore/constants/categoryChips';
import { MapFloatingControls } from '../features/mapExplore/components/MapFloatingControls';
import { MapExploreTheme } from '../features/mapExplore/theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { generateLeafletHtml } from '../utils/leafletMapHtml';
import {
  INDIA_OVERVIEW,
  getMarkerColor,
  getMarkerEmoji,
  getMarkerLabelPriority,
  getMarkerSublabel,
  getMapMarkerConfig,
  normalizeCategory,
  isCommercialPlaceCategory,
  dedupeMapMarkers,
} from '../utils/mapMarkerUtils';
import { cacheItineraryPlace } from '../utils/itineraryPlacesCache';
import { getCachedMapFeed, setCachedMapFeed, getLastMapFeed, setLastMapFeed } from '../utils/mapPlacesCache';
import {
  buildViewportKey,
  getMemoryCachedMapFeed,
  setMemoryCachedMapFeed,
  getMapLimitForZoom,
  viewportsSimilar,
  prefetchAdjacentViewports,
  saveMapSession,
  loadMapSession,
  getMemoryCachedVendors,
  setMemoryCachedVendors,
} from '../utils/mapViewportManager';
import NetInfo from '@react-native-community/netinfo';
import {
  quickAddPlaceToTrip,
  seedDraftTripCache,
  DRAFT_TRIP_ID_KEY,
  isPlaceInItinerary,
  loadItineraryPlaceIdSet,
} from '../utils/quickAddPlace';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tripsApi } from '../services/api/trips';
import { recordSearchedPlace } from '../utils/passportPlaces';
import {
  formatDistanceFromYou,
  parseLatLng,
  isValidLatLng,
  isReliableUserPosition,
} from '../services/location/distance';
import { fetchDrivingRoute } from '../services/location/travelTime';
import { useTravelTime } from '../services/location/useTravelTime';
import { getRoutedDistanceFields } from '../services/location/routedDistance';
import { mergeMarkersPreservingSelection } from '../features/mapExplore/utils/mapSelectionLifecycle';

/** Street-level zoom for opening Map tab and GPS recenter (good for turn-by-turn context) */
const MAP_TAB_ZOOM = 17;
const MARKER_FOCUS_ZOOM = 16;
const CITY_ZOOM = 13;
const CACHE_TTL = 5 * 60 * 1000;

const MAP_HTML = generateLeafletHtml();

interface MarkerData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  type: 'place' | 'vendor' | 'cluster';
  image?: string | null;
  rating?: number;
  reviewCount?: number;
  description?: string;
  shortDescription?: string;
  city?: string;
  state?: string;
  color: string;
  emoji: string;
  sublabel: string;
  distanceKm?: string;
  tags?: string[];
  views?: number;
  businessType?: string;
  phone?: string;
  contactPhone?: string;
  website?: string;
  /** Synthetic row: overview of all DB places in a city */
  isCityGroup?: boolean;
  cityPlaceCount?: number;
  /** Precomputed for zoom-aware labels in the Leaflet WebView */
  labelPriority?: number;
  distance?: string;
  needsImage?: boolean;
  offerBadge?: string | null;
  linkedSpotIds?: string[];
  clusterCount?: number;
  placeIds?: string[];
  entryFee?: number | null;
  estimatedDuration?: number | null;
  likes?: number | null;
  isOpen?: boolean | null;
}

interface MapScreenProps {
  places?: TouristSpot[];
  vendors?: VendorBusiness[];
  user?: Partial<UserProfile>;
  error?: string | null;
  onRetry?: () => void;
  onSelectSpot?: (spot: { id: string }) => void;
  onSelectVendor?: (vendorId: string) => void;
  onViewVendorContent?: (vendorId: string, vendorName: string, tab?: 'offers' | 'reels') => void;
  onNavigateToMap?: () => void;
  onNavigateToTripBuilder?: () => void;
  onViewItinerary?: (placeId?: string) => void;
  selectedPlaceId?: string;
  selectedPlaceKey?: number;
  initialMapTab?: 'places' | 'vendors';
  mapTabKey?: number;
  reviewMode?: boolean;
}

function getCategoryColor(cat?: string) {
  const c = (cat || '').toLowerCase().trim();
  if (c.includes('forest') || c.includes('nature') || c.includes('park') || c.includes('wildlife')) {
    return { text: '#2E6B38', bg: '#E5F2E5', icon: 'leaf-outline' };
  }
  if (c.includes('adventure') || c.includes('trek') || c.includes('cable') || c.includes('boating')) {
    return { text: '#B84A14', bg: '#FDEEE5', icon: 'compass-outline' };
  }
  if (c.includes('water') || c.includes('lake') || c.includes('fall') || c.includes('beach')) {
    return { text: '#1A4B8C', bg: '#EEF2FB', icon: 'water-outline' };
  }
  if (c.includes('temple') || c.includes('fort') || c.includes('monument') || c.includes('palace')) {
    return { text: '#8A5217', bg: '#FAF0E6', icon: 'location-outline' };
  }
  return { text: '#8A5217', bg: '#FAF0E6', icon: 'location-outline' };
}

function getPlacePillTag(item: MarkerData) {
  const cat = (item.category || '').toLowerCase();
  if (cat.includes('cable') || cat.includes('family') || cat.includes('park')) {
    return { label: 'Family Friendly', icon: 'people', color: '#C2410C' };
  }
  if (item.rating && item.rating >= 4.5) {
    return { label: 'Must Visit', icon: 'star', color: '#D97706' };
  }
  return { label: 'Popular', icon: 'flame', color: '#EA580C' };
}

function parsePlaceEntryFee(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw !== 'object') return null;
  const ticket = raw as { adult?: unknown; foreigner?: unknown; child?: unknown };
  for (const value of [ticket.adult, ticket.foreigner, ticket.child]) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

export default function MapScreen({
  places: propPlaces,
  vendors: propVendors,
  error: _propError,
  onRetry,
  onSelectSpot: _onSelectSpot,
  onSelectVendor,
  onViewVendorContent,
  onNavigateToTripBuilder: _onNavigateToTripBuilder,
  onViewItinerary: _onViewItinerary,
  selectedPlaceId,
  selectedPlaceKey,
  initialMapTab,
  mapTabKey,
  reviewMode = false,
}: MapScreenProps) {
  // useTheme intentionally omitted — unused
  const insets = useSafeAreaInsets();
  const { width: _screenW, height: SCREEN_H } = useWindowDimensions();
  const responsive = useResponsive();
  const tabClearance = getMainTabBarClearance(insets.bottom);
  const { effectivePosition, requestPermission, hasPermission } = useLocationContext();
  const { vendors: contextVendors } = useDataContext();
  const { user, setUser, isGuest } = useUserContext();
  const { showSuccess, showError } = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const webViewRef = useRef<SafeWebViewRef>(null);
  const _placesCacheRef = useRef<{ data: MarkerData[]; ts: number } | null>(null);
  const vendorsCache = useRef<{ data: MarkerData[]; ts: number } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const effectivePositionRef = useRef<UserPosition | null>(null);
  /** When false, map stays on user search/selection until GPS button is pressed */
  const allowAutoRecenterRef = useRef(true);
  const hasInitialCenteredRef = useRef(false);

  const [selectedMarker, setSelectedMarker] = useState<MarkerData | null>(null);
  const selectedMarkerRef = useRef<MarkerData | null>(null);
  useEffect(() => {
    selectedMarkerRef.current = selectedMarker;
  }, [selectedMarker]);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const [locationRequested, setLocationRequested] = useState(false);
  const [selectedMapCategory, setSelectedMapCategory] = useState('');
  const [selectedVendorCategory, setSelectedVendorCategory] = useState('');
  const [mapCategoryChips, setMapCategoryChips] = useState<ReturnType<typeof buildMapCategoryChips>>([]);
  const [activeTab, setActiveTab] = useState<'places' | 'vendors'>(
    initialMapTab === 'vendors' ? 'vendors' : 'places',
  );
  const [showFilters, setShowFilters] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<MarkerData[]>([]);
  const [suggestionDistanceLabels, setSuggestionDistanceLabels] = useState<Record<string, string>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [_placesCache, _setPlacesCache] = useState<Record<string, MarkerData[]>>({});
  const [allPlaces, setAllPlaces] = useState<MarkerData[]>([]);
  const [allVendors, setAllVendors] = useState<MarkerData[]>([]);
  const [_isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isMapFetching, setIsMapFetching] = useState(false);
  const [loadChip, setLoadChip] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const loadChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [savedPlaceIds, setSavedPlaceIds] = useState<Set<string>>(new Set());
  const [placeSavingId, setPlaceSavingId] = useState<string | null>(null);
  const sessionRestoredRef = useRef(false);
  const pendingSessionMarkerIdRef = useRef<string | null>(null);
  const isOfflineRef = useRef(false);
  const [_loadError, setLoadError] = useState<string | null>(null);
  
  const fetchCounterRef = useRef(0);
  const vendorFetchCounterRef = useRef(0);
  const searchGenRef = useRef(0);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);
  const lastFetchedBoundsRef = useRef<{ north: number; south: number; east: number; west: number } | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);
  const lastFetchTsRef = useRef(0);
  const currentZoomRef = useRef(12);
  const mapCursorRef = useRef<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [rideSheetVisible, setRideSheetVisible] = useState(false);
  const [addedPlaceIds, setAddedPlaceIds] = useState<Set<string>>(new Set());
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const pendingItineraryAddsRef = useRef<Set<string>>(new Set());

  const postToWebView = useCallback((data: any) => {
    const json = JSON.stringify(data);
    webViewRef.current?.postMessage(json);

    // Also inject — more reliable on Android WebView than postMessage alone
    if (data?.type === 'flyTo' && data.lat != null && data.lng != null) {
      const z = data.zoom ?? MAP_TAB_ZOOM;
      webViewRef.current?.injectJavaScript(
        `(function(){try{if(window.__palMap)window.__palMap.flyTo(${Number(data.lat)},${Number(data.lng)},${Number(z)});}catch(e){}true;})();`,
      );
    } else if (data?.type === 'fitBounds' && Array.isArray(data.bounds) && data.bounds.length) {
      const boundsJson = JSON.stringify(data.bounds);
      const maxZ = data.maxZoom ?? CITY_ZOOM;
      webViewRef.current?.injectJavaScript(
        `(function(){try{if(window.__palMap)window.__palMap.fitBounds(${boundsJson},${Number(maxZ)});}catch(e){}true;})();`,
      );
    } else if (data?.type === 'setUserLocation' && data.lat != null && data.lng != null) {
      webViewRef.current?.injectJavaScript(
        `(function(){try{if(window.__palMap)window.__palMap.setUserLocation(${Number(data.lat)},${Number(data.lng)});}catch(e){}true;})();`,
      );
    } else if (data?.type === 'panTo' && data.lat != null && data.lng != null) {
      webViewRef.current?.injectJavaScript(
        `(function(){try{if(window.__palMap)window.__palMap.panTo(${Number(data.lat)},${Number(data.lng)});}catch(e){}true;})();`,
      );
    } else if (data?.type === 'restoreView' && data.lat != null && data.lng != null) {
      webViewRef.current?.injectJavaScript(
        `(function(){try{if(window.__palMap)window.__palMap.restoreView(${Number(data.lat)},${Number(data.lng)},${Number(data.zoom ?? 12)});}catch(e){}true;})();`,
      );
    }
  }, []);

  const pushUserLocationToMap = useCallback((pos?: UserPosition | null) => {
    const p = pos ?? effectivePositionRef.current;
    if (p?.latitude == null || p?.longitude == null) return;
    postToWebView({
      type: 'setUserLocation',
      lat: p.latitude,
      lng: p.longitude,
    });
  }, [postToWebView]);

  const lockMapView = useCallback(() => {
    allowAutoRecenterRef.current = false;
  }, []);

  useEffect(() => {
    effectivePositionRef.current = effectivePosition;
    if (mapReady && effectivePosition) {
      pushUserLocationToMap(effectivePosition);
      if (allowAutoRecenterRef.current && !hasInitialCenteredRef.current) {
        postToWebView({
          type: 'flyTo',
          lat: effectivePosition.latitude,
          lng: effectivePosition.longitude,
          zoom: MAP_TAB_ZOOM,
        });
        hasInitialCenteredRef.current = true;
      }
    }
  }, [effectivePosition, mapReady, pushUserLocationToMap, postToWebView]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    NetInfo.fetch().then(state => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  const showLoadChip = useCallback((message: string, autoHideMs = 2200) => {
    setLoadChip({ visible: true, message });
    if (loadChipTimerRef.current) clearTimeout(loadChipTimerRef.current);
    loadChipTimerRef.current = setTimeout(() => {
      setLoadChip(prev => ({ ...prev, visible: false }));
    }, autoHideMs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setShowFilters(true);
      return () => {
        if (lastBoundsRef.current) {
          const c = lastBoundsRef.current;
          const lat = (c.north + c.south) / 2;
          const lng = (c.east + c.west) / 2;
          void saveMapSession({
            lat,
            lng,
            zoom: currentZoomRef.current,
            selectedMarkerId: selectedMarkerRef.current?.id,
            category: selectedMapCategory || undefined,
            tab: activeTab,
          });
        }
      };
    }, [selectedMapCategory, activeTab]),
  );

  useEffect(() => {
    if (!locationRequested) {
      const t = setTimeout(() => {
        setLocationRequested(true);
        requestPermission().catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }
  }, [locationRequested, requestPermission]);

  const mapPlaceToMarker = useCallback((p: TouristSpot): MarkerData => {
    const category = normalizeCategory(p.category || 'default');
    const coords = parseLatLng(p.latitude, p.longitude);
    return {
      id: p.id,
      name: p.name,
      lat: coords?.latitude ?? Number.NaN,
      lng: coords?.longitude ?? Number.NaN,
      category,
      type: 'place',
      image: p.imageUrl || p.imageUri || null,
      rating: p.rating,
      reviewCount: p.reviewCount,
      description: p.description || p.shortDescription || '',
      shortDescription: p.shortDescription || '',
      city: p.city,
      state: p.state,
      color: getMarkerColor(category, 'place'),
      emoji: getMarkerEmoji(category, 'place'),
      sublabel: getMarkerSublabel(category),
      needsImage: !p.imageUrl && !p.imageUri,
      entryFee: parsePlaceEntryFee(p.entryFee ?? (p as any).ticketPrice),
      estimatedDuration: p.estimatedDuration ?? null,
      likes: p.reviewCount ?? null,
    };
  }, []);

  const mapVendorToMarker = useCallback((v: VendorBusiness | any): MarkerData => {
    const category = normalizeCategory((v.category || v.businessType || 'default').toLowerCase());
    const coords = parseLatLng(v.latitude ?? v.lat, v.longitude ?? v.lng);
    return {
      id: v.id,
      name: v.businessName,
      lat: coords?.latitude ?? Number.NaN,
      lng: coords?.longitude ?? Number.NaN,
      category,
      type: 'vendor',
      image: v.imageUrl || null,
      rating: Number(v.rating) || 0,
      reviewCount: Number(v.reviewCount) || 0,
      description: v.description || '',
      city: v.city,
      state: v.state,
      color: getMarkerColor(category, 'vendor'),
      emoji: getMarkerEmoji(category, 'vendor'),
      sublabel: v.category || v.businessType || 'Vendor',
      businessType: v.category || v.businessType,
      phone: v.showContact === false ? undefined : (v.phone || undefined),
      contactPhone: v.showContact === false ? undefined : (v.phone || undefined),
      website: v.showWebsite === false ? undefined : (v.website || undefined),
      offerBadge: v.topOfferBadge || null,
      linkedSpotIds: v.linkedSpotIds || [],
    };
  }, []);

  const apiPlaceToMarker = useCallback((p: any): MarkerData => {
    const markerType = p.markerType || p.category || 'default';
    const category = normalizeCategory(markerType);
    const config = getMapMarkerConfig(category);
    const coords = parseLatLng(p.latitude, p.longitude);
    return {
      id: p.id,
      name: p.name,
      lat: coords?.latitude ?? Number.NaN,
      lng: coords?.longitude ?? Number.NaN,
      category,
      type: 'place',
      image: p.images?.[0] || p.thumbnail || null,
      rating: p.rating || 0,
      reviewCount: p.reviewCount || 0,
      description: p.description || p.shortDescription || '',
      shortDescription: p.shortDescription || '',
      city: p.city || '',
      state: p.state || '',
      color: getMarkerColor(category, 'place'),
      emoji: config.icon,
      sublabel: getMarkerSublabel(category),
      needsImage: !p.images?.length && !p.thumbnail,
      tags: p.tags || [],
      estimatedDuration: p.estimatedDurationMinutes ?? p.estimatedDuration ?? null,
      entryFee: parsePlaceEntryFee(p.entryFee ?? p.ticketPrice),
    };
  }, []);

  const clusterToMarker = useCallback((c: any): MarkerData => {
    const coords = parseLatLng(c.latitude, c.longitude);
    return {
      id: c.id,
      name: c.label,
      lat: coords?.latitude ?? Number.NaN,
      lng: coords?.longitude ?? Number.NaN,
    category: 'cluster',
    type: 'cluster',
    clusterCount: c.count,
    placeIds: c.placeIds || [],
    color: '#008F8F',
    emoji: 'default',
    sublabel: `${c.count} places`,
  };
  }, []);

  const fetchMapData = useCallback(async (
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number,
  options?: { cursor?: string; replace?: boolean; category?: string; force?: boolean },
) => {
  lastBoundsRef.current = bounds;
  currentZoomRef.current = zoom;
    const category = options?.category ?? selectedMapCategory;
    const viewportKey = buildViewportKey(bounds, zoom, category || undefined);

    if (
      !options?.force &&
      !options?.cursor &&
      lastFetchKeyRef.current === viewportKey &&
      Date.now() - lastFetchTsRef.current < 2500
    ) {
      return;
    }

    if (
      !options?.force &&
      !options?.cursor &&
      lastFetchedBoundsRef.current &&
      viewportsSimilar(lastFetchedBoundsRef.current, bounds, currentZoomRef.current, zoom)
    ) {
      return;
    }

    const currentFetchId = ++fetchCounterRef.current;
    setIsMapFetching(true);
    // if (!options?.cursor) showLoadChip('Updating map…', 6000);
    const limit = getMapLimitForZoom(zoom);
    const queryParams = {
      north: bounds.north,
      south: bounds.south,
      east: bounds.east,
      west: bounds.west,
      zoom,
      limit,
      cursor: options?.cursor,
      ...(category ? { category } : {}),
    };

    try {
      let feed: import('../services/api/places').MapFeedResponse | null = null;
      if (!options?.cursor) {
        feed = getMemoryCachedMapFeed(viewportKey);
        if (!feed) {
          const cached = await getCachedMapFeed({
            ...bounds,
            zoom,
            category: category || undefined,
          });
          if (cached && currentFetchId === fetchCounterRef.current) {
            feed = cached;
            setMemoryCachedMapFeed(viewportKey, cached);
          }
        }
      }
      if (!feed) {
        if (isOfflineRef.current) {
          throw new Error('offline');
        }
        feed = await placesApi.map(queryParams);
        if (!options?.cursor) {
          setMemoryCachedMapFeed(viewportKey, feed);
          await setCachedMapFeed({ ...bounds, zoom, category: category || undefined }, feed);
          await setLastMapFeed(feed);
        }
      }

      if (currentFetchId !== fetchCounterRef.current) return;

      lastFetchKeyRef.current = viewportKey;
      lastFetchTsRef.current = Date.now();
      lastFetchedBoundsRef.current = bounds;
      mapCursorRef.current = feed.nextCursor;

      const preserve = selectedMarkerRef.current;

      if (feed.mode === 'clusters') {
        const clusterMarkers = (feed.clusters || [])
          .map(clusterToMarker)
          .filter(m => isValidLatLng(m.lat, m.lng));
        setAllPlaces(mergeMarkersPreservingSelection(clusterMarkers, preserve?.type === 'place' ? preserve : null));
      } else {
        const batch = (feed.places || [])
          .filter((p: any) => parseLatLng(p.latitude, p.longitude) != null)
          .map(apiPlaceToMarker);

        const deduped = dedupeMapMarkers(batch);
        setAllPlaces(mergeMarkersPreservingSelection(deduped, preserve?.type === 'place' ? preserve : null));
      }

      if (!options?.cursor && !isOfflineRef.current) {
        prefetchAdjacentViewports(bounds, zoom, category || undefined, (adj) =>
          placesApi.map({
            north: adj.north,
            south: adj.south,
            east: adj.east,
            west: adj.west,
            zoom,
            limit,
            ...(category ? { category } : {}),
          }),
        );
      }
    } catch (e) {
      if (currentFetchId === fetchCounterRef.current) {
        const fallback = await getLastMapFeed();
        const preserve = selectedMarkerRef.current?.type === 'place' ? selectedMarkerRef.current : null;
        if (fallback?.mode === 'clusters') {
          const clusters = (fallback.clusters || []).map(clusterToMarker).filter(m => isValidLatLng(m.lat, m.lng));
          setAllPlaces(mergeMarkersPreservingSelection(clusters, preserve));
        } else if (fallback?.places?.length) {
          const batch = fallback.places
            .filter((p: any) => parseLatLng(p.latitude, p.longitude) != null)
            .map(apiPlaceToMarker);
          setAllPlaces(mergeMarkersPreservingSelection(dedupeMapMarkers(batch), preserve));
        }
      }
    } finally {
      if (currentFetchId === fetchCounterRef.current) {
        setIsMapFetching(false);
      }
    }
  }, [apiPlaceToMarker, clusterToMarker, selectedMapCategory, showLoadChip]);

  useEffect(() => {
    let mounted = true;
    placesApi.mapCategories()
      .then(cats => {
        if (mounted) setMapCategoryChips(buildMapCategoryChips(cats));
      })
      .catch(() => {
        if (mounted) setMapCategoryChips(buildMapCategoryChips([]));
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!lastBoundsRef.current) return;
    lastFetchKeyRef.current = null;
    fetchMapData(lastBoundsRef.current, currentZoomRef.current, { force: true });
  }, [selectedMapCategory, fetchMapData]);

  const fetchVendorsForViewport = useCallback(async (
    bounds: { north: number; south: number; east: number; west: number },
    category?: string,
  ) => {
    const fetchId = ++vendorFetchCounterRef.current;
    const key = buildViewportKey(bounds, currentZoomRef.current, category, 'vendors');
    setIsMapFetching(true);
    try {
      let source: any[] | null = getMemoryCachedVendors(key) as any[] | null;
      if (!source && !isOfflineRef.current) {
        const { vendorsApi } = await import('../services/api/vendors');
        const res = await vendorsApi.mapInViewport({
          ...bounds,
          category: category || undefined,
          limit: 200,
        });
        source = Array.isArray(res) ? res : ((res as any)?.data ?? []);
        if (Array.isArray(source)) setMemoryCachedVendors(key, source);
      }
      if (fetchId !== vendorFetchCounterRef.current) return;
      const markers = (source || [])
        .filter((v: any) => parseLatLng(v.latitude ?? v.lat, v.longitude ?? v.lng) != null)
        .map(mapVendorToMarker);
      setAllVendors(mergeMarkersPreservingSelection(
        markers,
        selectedMarkerRef.current?.type === 'vendor' ? selectedMarkerRef.current : null,
      ));
    } catch {
      if (fetchId === vendorFetchCounterRef.current && vendorsCache.current?.data) {
        setAllVendors(vendorsCache.current.data);
      }
    } finally {
      if (fetchId === vendorFetchCounterRef.current) setIsMapFetching(false);
    }
  }, [mapVendorToMarker]);

  useEffect(() => {
    if (!lastBoundsRef.current || activeTab !== 'vendors') return;
    void fetchVendorsForViewport(lastBoundsRef.current, selectedVendorCategory || undefined);
  }, [selectedVendorCategory, activeTab, fetchVendorsForViewport]);

  const scheduleMapFetch = useCallback((
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number,
  ) => {
    lastBoundsRef.current = bounds;
    currentZoomRef.current = zoom;
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    viewportDebounceRef.current = setTimeout(() => {
      if (activeTab === 'vendors') {
        void fetchVendorsForViewport(bounds, selectedVendorCategory || undefined);
      } else {
        fetchMapData(bounds, zoom);
      }
    }, 400);
  }, [fetchMapData, fetchVendorsForViewport, activeTab, selectedVendorCategory]);

  const fetchVendors = useCallback(async (force = false) => {
    if (lastBoundsRef.current) {
      await fetchVendorsForViewport(lastBoundsRef.current, selectedVendorCategory || undefined);
      return;
    }
    if (!force && vendorsCache.current && Date.now() - vendorsCache.current.ts < CACHE_TTL) {
      setAllVendors(vendorsCache.current.data);
      return;
    }
    let source: any[] | undefined =
      contextVendors && contextVendors.length > 0 ? contextVendors : propVendors;

    try {
      const { vendorsApi } = await import('../services/api/vendors');
      const res = await vendorsApi.listForMap();
      const remote = ((res as any)?.data ?? res) as any[];
      if (Array.isArray(remote) && remote.length > 0) {
        source = remote;
      }
    } catch {
      /* fall back to context/props */
    }

    if (source && source.length > 0) {
      const markers = source
        .filter((v: any) => parseLatLng(v.latitude ?? v.lat, v.longitude ?? v.lng) != null)
        .map(mapVendorToMarker);
      vendorsCache.current = { data: markers, ts: Date.now() };
      setAllVendors(markers);
    } else {
      setAllVendors([]);
    }
  }, [contextVendors, propVendors, mapVendorToMarker]);

  useEffect(() => {
    // if (DEV_FLAGS.USE_SERVER_API) return;
    if (propPlaces?.length) {
      const batch = propPlaces
        .filter(p => !isCommercialPlaceCategory(p.category))
        .map(mapPlaceToMarker);
      if (batch.length) {
        setAllPlaces(prev => dedupeMapMarkers([...prev, ...batch]));
      }
    }
  }, [mapPlaceToMarker, propPlaces]);

  useEffect(() => {
    let mounted = true;
    setLoadError(null);
    fetchVendors().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => { mounted = false; };
  }, [fetchVendors]);

  const markerLookup = useMemo(() => {
    const map = new Map<string, MarkerData>();
    [...allPlaces, ...allVendors].forEach(m => map.set(m.id, m));
    return map;
  }, [allPlaces, allVendors]);

  const filteredMarkers: MarkerData[] = useMemo(() => {
    let list = activeTab === 'places' ? allPlaces : allVendors;
    if (activeTab === 'places') {
      list = list.filter(m => m.type === 'cluster' || !isCommercialPlaceCategory(m.category));
    } else if (selectedVendorCategory) {
      list = list.filter(m => {
        const cat = (m.category || '').toLowerCase();
        return cat === selectedVendorCategory || cat.includes(selectedVendorCategory);
      });
    }
    return activeTab === 'places' ? dedupeMapMarkers(list, 0.001) : dedupeMapMarkers(list, 0.01);
  }, [allPlaces, allVendors, activeTab, selectedVendorCategory]);

  const handleMapTabChange = useCallback((tab: 'places' | 'vendors') => {
    setActiveTab(tab);
    setSelectedMarker(null);
    postToWebView({ type: 'setSelectedMarker', id: null });
    if (tab === 'vendors') {
      fetchVendors(true);
    }
  }, [fetchVendors, postToWebView]);

  const handleSelectMapCategory = useCallback((key: string) => {
    setSelectedMapCategory(key);
    fetchCounterRef.current += 1;
    const pos = effectivePositionRef.current;
    if (pos && isValidLatLng(pos.latitude, pos.longitude)) {
      postToWebView({
        type: 'flyTo',
        lat: pos.latitude,
        lng: pos.longitude,
        zoom: Math.max(currentZoomRef.current, CITY_ZOOM),
      });
    }
  }, [postToWebView]);

  const markersForMap = useMemo(() => {
    // Keep payload stable — live GPS distance used to change every tick and
    // force a full WebView pin rebuild (visible blinking).
    return filteredMarkers.map(m => ({
      id: m.id,
      name: m.name,
      lat: m.lat,
      lng: m.lng,
      category: m.category,
      type: m.type,
      color: m.color,
      emoji: m.emoji,
      sublabel: m.sublabel,
      rating: m.rating,
      offerBadge: m.offerBadge || null,
      isCityGroup: m.isCityGroup,
      clusterCount: m.clusterCount,
      labelPriority: getMarkerLabelPriority({
        category: m.category,
        rating: m.rating,
        type: m.type === 'cluster' ? undefined : m.type,
        isCityGroup: m.isCityGroup,
      }),
    }));
  }, [filteredMarkers]);

  const lastMarkersSigRef = useRef('');
  const initialFallbackRef = useRef(false);

  // Center on user only on first Map tab open — not after city search or GPS updates
  useFocusEffect(
    useCallback(() => {
      if (!mapReady) return;
      if (selectedPlaceId && selectedPlaceKey != null) return;
      if (!allowAutoRecenterRef.current) return;

      const pos = effectivePositionRef.current;
      if (pos && !hasInitialCenteredRef.current) {
        postToWebView({
          type: 'flyTo',
          lat: pos.latitude,
          lng: pos.longitude,
          zoom: MAP_TAB_ZOOM,
        });
        hasInitialCenteredRef.current = true;
        return;
      }

      if (!pos && !initialFallbackRef.current) {
        initialFallbackRef.current = true;
        hasInitialCenteredRef.current = true;
        postToWebView({
          type: 'flyTo',
          lat: INDIA_OVERVIEW.lat,
          lng: INDIA_OVERVIEW.lng,
          zoom: INDIA_OVERVIEW.zoom,
        });
      }

      return () => {
        initialFallbackRef.current = false;
      };
    }, [mapReady, postToWebView, selectedPlaceId, selectedPlaceKey]),
  );

  useEffect(() => {
    if (!mapReady) return;
    const sig = markersForMap
      .map(m => `${m.id}:${Number(m.lat).toFixed(5)},${Number(m.lng).toFixed(5)}:${m.category}:${m.emoji}`)
      .sort()
      .join('|');
    if (sig === lastMarkersSigRef.current) return;
    lastMarkersSigRef.current = sig;

    postToWebView({ type: 'setMarkers', markers: markersForMap });

    if (selectedMarkerRef.current) {
      postToWebView({ type: 'setSelectedMarker', id: selectedMarkerRef.current.id });
    }

    const pendingId = pendingSessionMarkerIdRef.current;
    if (pendingId) {
      const restored = markerLookup.get(pendingId);
      if (restored) {
        pendingSessionMarkerIdRef.current = null;
        setSelectedMarker(restored);
      }
    }
  }, [mapReady, markersForMap, postToWebView, markerLookup]);

  useFocusEffect(
    useCallback(() => {
      if (mapReady) pushUserLocationToMap();
    }, [mapReady, pushUserLocationToMap]),
  );

  useEffect(() => {
    if (mapReady && selectedMarker) {
      postToWebView({ type: 'setSelectedMarker', id: selectedMarker.id });
    } else if (mapReady) {
      postToWebView({ type: 'clearSelectedMarker' });
    }
  }, [mapReady, selectedMarker, postToWebView]);

  const handleMarkerPress = useCallback((marker: MarkerData) => {
    if (marker.type === 'cluster') {
      const nextZoom = Math.min(currentZoomRef.current + 2, 15);
      postToWebView({ type: 'flyTo', lat: marker.lat, lng: marker.lng, zoom: nextZoom });
      return;
    }
    if (!isValidLatLng(marker.lat, marker.lng)) return;
    fetchCounterRef.current += 1;
    vendorFetchCounterRef.current += 1;
    lockMapView();
    setSelectedMarker(marker);
    postToWebView({ type: 'panTo', lat: marker.lat, lng: marker.lng });
    postToWebView({ type: 'setSelectedMarker', id: marker.id });
    if (marker.type === 'place' && searchQuery.trim()) {
      recordSearchedPlace({
        id: marker.id,
        name: marker.name,
        city: marker.city,
        state: marker.state,
        category: marker.category,
      });
    }
  }, [postToWebView, searchQuery, lockMapView]);

  const mergePlaceMarkers = useCallback((batch: MarkerData[]) => {
    const touristOnly = batch.filter(m => !isCommercialPlaceCategory(m.category));
    if (!touristOnly.length) return;
    setAllPlaces(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      touristOnly.forEach(m => map.set(m.id, m));
      return dedupeMapMarkers(Array.from(map.values()));
    });
  }, []);

  // Open map detail card when Home/Search (or another screen) passes a place id
  const lastOpenedKeyRef = useRef<number | null>(null);
  const lastMapTabKeyRef = useRef<number | null>(null);

  // Home → Local Vendors (and PalPoints review flow): switch Places/Vendors layer
  useEffect(() => {
    const targetTab = initialMapTab ?? (reviewMode ? 'vendors' : null);
    if (!targetTab) return;
    if (mapTabKey != null) {
      if (lastMapTabKeyRef.current === mapTabKey) return;
      lastMapTabKeyRef.current = mapTabKey;
    }
    handleMapTabChange(targetTab);
    if (mapReady) {
      postToWebView({ type: 'clearRoute' });
    }
  }, [initialMapTab, reviewMode, mapTabKey, mapReady, postToWebView, handleMapTabChange]);

  useEffect(() => {
    if (!selectedPlaceId || selectedPlaceKey == null || !mapReady) return;
    if (lastOpenedKeyRef.current === selectedPlaceKey) return;

    let cancelled = false;

    const openMarker = (marker: MarkerData, mergeIfMissing: boolean) => {
      if (cancelled || !isValidLatLng(marker.lat, marker.lng)) return;
      lastOpenedKeyRef.current = selectedPlaceKey;
      lockMapView();
      if (mergeIfMissing) {
        mergePlaceMarkers([marker]);
      }
      setActiveTab('places');
      setSelectedMarker(marker);
      postToWebView({ type: 'flyTo', lat: marker.lat, lng: marker.lng, zoom: MARKER_FOCUS_ZOOM });
      postToWebView({ type: 'setSelectedMarker', id: marker.id });
    };

    const fromMarkers = allPlaces.find(m => m.id === selectedPlaceId);
    if (fromMarkers) {
      openMarker(fromMarkers, false);
      return () => {
        cancelled = true;
      };
    }

    const fromProps = propPlaces?.find(p => p.id === selectedPlaceId);
    if (fromProps) {
      openMarker(mapPlaceToMarker(fromProps), true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const place = await getPlaceById(selectedPlaceId);
      if (cancelled || !place) return;
      openMarker(mapPlaceToMarker(place), true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedPlaceId,
    selectedPlaceKey,
    mapReady,
    allPlaces,
    propPlaces,
    mapPlaceToMarker,
    mergePlaceMarkers,
    postToWebView,
    lockMapView,
  ]);

  // Live search suggestions from database (places + cities)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteSuggestions([]);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const gen = ++searchGenRef.current;
    searchDebounceRef.current = setTimeout(async () => {
      if (!DEV_FLAGS.USE_SERVER_API) return;
      setIsSearching(true);
      try {
        const res = await searchApi.search({ q, limit: 25, sort: 'relevance' });
        if (searchGenRef.current !== gen) return;
        const places = ((res as any)?.data || res || []) as any[];
        const mapped = places
          .filter((p: any) => parseLatLng(p.latitude, p.longitude) != null)
          .map(apiPlaceToMarker);
        setRemoteSuggestions(mapped);
        mergePlaceMarkers(mapped);
      } catch (e) {
      } finally {
        if (searchGenRef.current === gen) setIsSearching(false);
      }
    }, 350);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, apiPlaceToMarker, mergePlaceMarkers]);

  const suggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const source =
      remoteSuggestions.length > 0
        ? remoteSuggestions
        : activeTab === 'vendors'
          ? allVendors
          : [...allPlaces, ...allVendors];

    const placeHits = (remoteSuggestions.length > 0 ? remoteSuggestions : allPlaces).filter(
      item =>
        item.type === 'place' &&
        (item.name.toLowerCase().includes(query) ||
          (item.city && item.city.toLowerCase().includes(query)) ||
          (item.state && item.state.toLowerCase().includes(query)) ||
          (item.category && item.category.toLowerCase().includes(query))),
    );

    const cityCounts = new Map<string, { city: string; state?: string; places: MarkerData[] }>();
    placeHits.forEach(p => {
      if (!p.city) return;
      const key = p.city.toLowerCase();
      if (!key.includes(query) && query !== key) return;
      const existing = cityCounts.get(key);
      if (existing) existing.places.push(p);
      else cityCounts.set(key, { city: p.city, state: p.state, places: [p] });
    });

    const cityRows: MarkerData[] = Array.from(cityCounts.values())
      .filter(g => g.places.length >= 2 || g.city.toLowerCase() === query)
      .sort((a, b) => b.places.length - a.places.length)
      .slice(0, 2)
      .map(g => {
        const avgLat = g.places.reduce((s, p) => s + p.lat, 0) / g.places.length;
        const avgLng = g.places.reduce((s, p) => s + p.lng, 0) / g.places.length;
        return {
          id: `city:${g.city}`,
          name: g.city,
          lat: avgLat,
          lng: avgLng,
          category: 'city',
          type: 'place' as const,
          city: g.city,
          state: g.state,
          color: '#63300E',
          emoji: '🏙️',
          sublabel: 'City',
          isCityGroup: true,
          cityPlaceCount: g.places.length,
        };
      });

    const placeRows =
      remoteSuggestions.length > 0
        ? remoteSuggestions.slice(0, 8)
        : source
            .filter(item =>
              item.name.toLowerCase().includes(query) ||
              (item.city && item.city.toLowerCase().includes(query)) ||
              (item.state && item.state.toLowerCase().includes(query)) ||
              (item.category && item.category.toLowerCase().includes(query)),
            )
            .slice(0, 8);

    return [...cityRows, ...placeRows].slice(0, 10);
  }, [searchQuery, remoteSuggestions, allPlaces, allVendors, activeTab]);

  useEffect(() => {
    if (!isReliableUserPosition(effectivePosition)) {
      setSuggestionDistanceLabels({});
      return;
    }

    const visiblePlaces = suggestions
      .filter(item => !item.isCityGroup && item.type === 'place' && parseLatLng(item.lat, item.lng))
      .slice(0, 8);
    if (!visiblePlaces.length) {
      setSuggestionDistanceLabels({});
      return;
    }

    let cancelled = false;
    const origin = { latitude: effectivePosition.latitude, longitude: effectivePosition.longitude };
    Promise.all(
      visiblePlaces.map(async item => {
        const routed = await getRoutedDistanceFields(origin, { latitude: item.lat, longitude: item.lng });
        return [item.id, routed.distanceLabel || ''] as const;
      }),
    ).then(entries => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, label] of entries) {
        if (label) next[id] = label;
      }
      setSuggestionDistanceLabels(next);
    }).catch(() => {
      if (!cancelled) setSuggestionDistanceLabels({});
    });

    return () => {
      cancelled = true;
    };
  }, [suggestions, effectivePosition]);

  const flyToCity = useCallback(async (places: MarkerData[], cityQuery: string) => {
    lockMapView();
    const q = cityQuery.trim().toLowerCase();
    setActiveTab('places');

    const exactCity = places.filter(p => (p.city || '').toLowerCase() === q);
    const partialCity = places.filter(p => (p.city || '').toLowerCase().includes(q));
    const cityHits = exactCity.length > 0 ? exactCity : partialCity;

    if (cityHits.length >= 2) {
      mergePlaceMarkers(cityHits);
      postToWebView({
        type: 'fitBounds',
        bounds: cityHits.map(p => [p.lat, p.lng]),
        maxZoom: CITY_ZOOM,
      });
      return true;
    }

    if (cityHits.length === 1) {
      mergePlaceMarkers(cityHits);
      postToWebView({
        type: 'flyTo',
        lat: cityHits[0].lat,
        lng: cityHits[0].lng,
        zoom: CITY_ZOOM,
      });
      return true;
    }

    // Geocode city in India so we still zoom even with sparse place data
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${cityQuery}, India`)}&limit=1&countrycodes=in`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.[0]?.lat && data?.[0]?.lon) {
          postToWebView({
            type: 'flyTo',
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            zoom: CITY_ZOOM,
          });
          return true;
        }
      }
    } catch (e) {
    }

    return false;
  }, [mergePlaceMarkers, postToWebView, lockMapView]);

  const flyToSearchResults = useCallback(async (places: MarkerData[], query: string) => {
    if (!places.length) return;
    const q = query.trim().toLowerCase();

    const exactPlace = places.find(p => p.name.toLowerCase() === q);
    const exactCity = places.filter(p => (p.city || '').toLowerCase() === q);
    const cityPartial = places.filter(p => (p.city || '').toLowerCase().includes(q));
    const cityHits = exactCity.length > 0 ? exactCity : cityPartial;

    // Prefer city overview whenever the query matches a city and isn't an exact place name
    const cityNameVotes = new Map<string, number>();
    cityHits.forEach(p => {
      const c = (p.city || '').toLowerCase();
      if (!c) return;
      cityNameVotes.set(c, (cityNameVotes.get(c) || 0) + 1);
    });
    const topCity = [...cityNameVotes.entries()].sort((a, b) => b[1] - a[1])[0];
    const majorityCity =
      topCity && topCity[1] >= Math.max(2, Math.ceil(places.length * 0.4)) ? topCity[0] : null;

    const isCitySearch =
      !exactPlace &&
      (
        cityHits.length >= 2 ||
        !!majorityCity ||
        (exactCity.length >= 1) ||
        (cityPartial.length >= 1 && cityPartial.length === places.length)
      );

    if (isCitySearch) {
      const cityLabel = majorityCity || exactCity[0]?.city || cityHits[0]?.city || query;
      const ok = await flyToCity(places, cityLabel);
      if (ok) return;
    }

    const best =
      exactPlace ||
      places.find(p => p.name.toLowerCase().startsWith(q)) ||
      places[0];
    setActiveTab('places');
    handleMarkerPress(best);
  }, [handleMarkerPress, flyToCity]);

  const runPlaceSearch = useCallback(async (rawQuery?: string) => {
    const q = (rawQuery ?? searchQuery).trim();
    if (!q) return;

    postToWebView({ type: 'clearSelectedMarker' });
    setSelectedMarker(null);
    setIsSearching(true);
    setSearchFocused(false);
    try {
      let mapped = remoteSuggestions;
      if (DEV_FLAGS.USE_SERVER_API) {
        const res = await searchApi.search({ q, limit: 100, sort: 'relevance' });
        const places = ((res as any)?.data || res || []) as any[];
        mapped = places
          .filter((p: any) => parseLatLng(p.latitude, p.longitude) != null)
          .map(apiPlaceToMarker);
      }

      if (!mapped.length) {
        const local = [...allPlaces].filter(item =>
          item.name.toLowerCase().includes(q.toLowerCase()) ||
          (item.city && item.city.toLowerCase().includes(q.toLowerCase()))
        );
        if (!local.length) {
          // Still try geocoding a city name
          const zoomed = await flyToCity([], q);
          if (!zoomed) {
            Alert.alert('Not found', `No tourist places found for "${q}". Try a city or place name.`);
          }
          return;
        }
        mapped = local;
      }

      mergePlaceMarkers(mapped);
      setRemoteSuggestions(mapped.slice(0, 8));
      await flyToSearchResults(mapped, q);
    } catch (e) {
      Alert.alert('Search failed', 'Could not search places right now. Check your connection and try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, remoteSuggestions, allPlaces, apiPlaceToMarker, mergePlaceMarkers, flyToSearchResults, flyToCity, postToWebView]);

  const handleSelectSuggestion = useCallback(async (item: MarkerData) => {
    fetchCounterRef.current += 1;
    vendorFetchCounterRef.current += 1;
    searchGenRef.current += 1;
    setSearchQuery(item.name);
    setSearchFocused(false);
    if (item.type === 'place') {
      setActiveTab('places');
      if (!item.isCityGroup) {
        recordSearchedPlace({
          id: item.id,
          name: item.name,
          city: item.city,
          state: item.state,
          category: item.category,
        });
      }
      if (item.isCityGroup && item.city) {
        const sameCity = (remoteSuggestions.length ? remoteSuggestions : allPlaces).filter(
          p => p.city && p.city.toLowerCase() === item.city!.toLowerCase() && !p.isCityGroup,
        );
        const pool = sameCity.length ? sameCity : remoteSuggestions.filter(p => !p.isCityGroup);
        mergePlaceMarkers(pool.length ? pool : [item]);
        handleMarkerPress(item);
        await flyToCity(pool.length ? pool : [item], item.city);
        return;
      }
      // If the typed query matches this place's city, zoom to the city instead of one pin
      const typed = searchQuery.trim().toLowerCase();
      if (
        item.city &&
        typed &&
        (item.city.toLowerCase() === typed || item.city.toLowerCase().startsWith(typed)) &&
        item.name.toLowerCase() !== typed
      ) {
        const sameCity = (remoteSuggestions.length ? remoteSuggestions : allPlaces).filter(
          p => p.city && p.city.toLowerCase() === item.city!.toLowerCase() && !p.isCityGroup,
        );
        if (sameCity.length >= 2) {
          mergePlaceMarkers(sameCity);
          await flyToCity(sameCity, item.city);
          return;
        }
      }
      mergePlaceMarkers([item]);
      handleMarkerPress(item);
    } else {
      setActiveTab('vendors');
      handleMarkerPress(item);
    }
  }, [handleMarkerPress, remoteSuggestions, allPlaces, mergePlaceMarkers, flyToCity, searchQuery]);

  const ALLOWED_MESSAGE_TYPES = useMemo(
    () => new Set(['mapReady', 'mapBoundsChanged', 'markerPress', 'zoomChanged', 'cameraMoved', 'cameraIdle', 'mapError']),
    [],
  );

  const handleWebMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data || !data.type || !ALLOWED_MESSAGE_TYPES.has(data.type)) return;
      switch (data.type) {
        case 'mapReady':
          setMapReady(true);
          setMapError(null);
          pushUserLocationToMap();
          if (!sessionRestoredRef.current) {
            sessionRestoredRef.current = true;
            void loadMapSession().then(session => {
              if (session && !selectedPlaceId) {
                if (session.category) setSelectedMapCategory(session.category);
                if (session.tab) setActiveTab(session.tab);
                postToWebView({
                  type: 'restoreView',
                  lat: session.lat,
                  lng: session.lng,
                  zoom: session.zoom,
                });
                if (session.selectedMarkerId) {
                  pendingSessionMarkerIdRef.current = session.selectedMarkerId;
                }
              }
            });
          }
          break;
        case 'mapError':
          setMapError(data.message || 'Map failed to load');
          setMapReady(false);
          break;
        case 'mapBoundsChanged': {
          if (data.bounds) {
            const zoom = typeof data.zoom === 'number' ? data.zoom : currentZoomRef.current;
            scheduleMapFetch(data.bounds, zoom);
          }
          break;
        }
        case 'cameraIdle': {
          if (lastBoundsRef.current) {
            lastFetchKeyRef.current = null;
            if (activeTab === 'places') {
              fetchMapData(lastBoundsRef.current, typeof data.zoom === 'number' ? data.zoom : currentZoomRef.current, { force: true });
            } else {
              void fetchVendorsForViewport(lastBoundsRef.current, selectedVendorCategory || undefined);
            }
          }
          break;
        }
        case 'markerPress': {
          const marker = markerLookup.get(data.id);
          if (marker) handleMarkerPress(marker);
          break;
        }
      }
    } catch { }
  }, [markerLookup, handleMarkerPress, scheduleMapFetch, fetchMapData, fetchVendorsForViewport, activeTab, selectedVendorCategory, pushUserLocationToMap, ALLOWED_MESSAGE_TYPES, selectedPlaceId, postToWebView]);

  useEffect(() => {
    if (mapReady || mapError) return;
    const t = setTimeout(() => {
      setMapError('Map is taking too long. Tap Retry.');
    }, 20000);
    return () => clearTimeout(t);
  }, [mapReady, mapError, webViewKey]);

  const reloadMap = useCallback(() => {
    setMapReady(false);
    setMapError(null);
    setWebViewKey(k => k + 1);
  }, []);

  const handleAddPhoto = useCallback(async (marker: MarkerData) => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 1 });
    if (result.didCancel || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    try {
      const uploadRes = await uploadApi.uploadImage(uri);
      const contributed = await userPlaceImagesApi.contribute(marker.id, uploadRes.url);
      const points =
        typeof (contributed as { points?: number })?.points === 'number' &&
        (contributed as { points: number }).points > 0
          ? (contributed as { points: number }).points
          : 0;
      Alert.alert(
        points > 0 ? 'PalPoints earned' : 'Submitted',
        points > 0
          ? `+${points} PalPoints added. Your photo is under review.`
          : 'Your photo has been submitted for admin review. You will get a notification when it is reviewed.',
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to submit photo';
      Alert.alert('Error', msg);
    }
  }, []);

  const closeSheet = useCallback(() => {
    postToWebView({ type: 'clearSelectedMarker' });
    postToWebView({ type: 'clearRoute' });
    setSelectedMarker(null);
  }, [postToWebView]);

  const handleOpenPlace = useCallback(() => {
    if (!selectedMarker || selectedMarker.type !== 'place') return;
    navigation.navigate('SpotDetail', { spotId: selectedMarker.id });
  }, [selectedMarker, navigation]);

  const handleSavePlace = useCallback(async () => {
    if (!selectedMarker || selectedMarker.type !== 'place') return;
    setPlaceSavingId(selectedMarker.id);
    try {
      if (savedPlaceIds.has(selectedMarker.id)) {
        await placesApi.unsave(selectedMarker.id);
        setSavedPlaceIds(prev => { const n = new Set(prev); n.delete(selectedMarker.id); return n; });
        showSuccess('Removed from saved');
      } else {
        await placesApi.save(selectedMarker.id);
        setSavedPlaceIds(prev => new Set(prev).add(selectedMarker.id));
        showSuccess('Place saved');
      }
    } catch {
      showError('Could not update saved places');
    } finally {
      setPlaceSavingId(null);
    }
  }, [selectedMarker, savedPlaceIds, showSuccess, showError]);

  const handleNavigate = useCallback(async () => {
    if (!selectedMarker) return;
    const marker = selectedMarker;
    const dest = parseLatLng(marker.lat, marker.lng);
    if (!dest) {
      Alert.alert('Location unavailable', 'This place does not have valid coordinates.');
      return;
    }

    postToWebView({ type: 'clearSelectedMarker' });
    setSelectedMarker(null);

    let pos = effectivePositionRef.current ?? effectivePosition;
    if (!isReliableUserPosition(pos)) {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert('Permission Denied', 'Need location access to navigate from your current location.');
          return;
        }
        pos = effectivePositionRef.current ?? effectivePosition;
      }
    }
    const origin = pos ? parseLatLng(pos.latitude, pos.longitude) : null;
    if (!origin || !isReliableUserPosition(pos)) {
      Alert.alert('Location unavailable', 'Waiting for a more accurate GPS fix. Please keep location on and try again.');
      return;
    }

    postToWebView({ type: 'clearRoute' });

    try {
      const route = await fetchDrivingRoute(origin, dest, { geometry: true });
      if (route?.geometry?.length) {
        postToWebView({ type: 'drawRoute', coords: route.geometry });
        setIsNavigating(true);
      } else {
        Alert.alert('Route not found', 'Could not find a driving route to this location.');
      }
    } catch {
      Alert.alert('Navigation Error', 'Could not fetch route data.');
    }
  }, [selectedMarker, effectivePosition, hasPermission, requestPermission, postToWebView]);

  const handleEndNavigation = useCallback(() => {
    setIsNavigating(false);
    postToWebView({ type: 'clearRoute' });
  }, [postToWebView]);

  const _handleCall = useCallback(() => {
    if (!selectedMarker) return;
    const phone = selectedMarker.contactPhone || selectedMarker.phone;
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => {});
    } else {
      Alert.alert('Not Available', 'No phone number listed for this place.');
    }
  }, [selectedMarker]);

  const _handleWebsite = useCallback(() => {
    if (!selectedMarker) return;
    const website = selectedMarker.website;
    if (website) {
      Linking.openURL(website).catch(() => {});
    } else {
      Linking.openURL('https://www.google.com/search?q=' + encodeURIComponent(selectedMarker.name)).catch(() => {});
    }
  }, [selectedMarker]);

  const refreshItineraryPlaceIds = useCallback(async () => {
    if (isGuest) return;
    const ids = await loadItineraryPlaceIdSet(user?.currentItinerary);
    setAddedPlaceIds(ids);
  }, [isGuest, user?.currentItinerary]);

  useEffect(() => {
    void refreshItineraryPlaceIds();
  }, [refreshItineraryPlaceIds]);

  useFocusEffect(
    useCallback(() => {
      void refreshItineraryPlaceIds();
    }, [refreshItineraryPlaceIds]),
  );

  const handleAddToItinerary = useCallback(async () => {
    if (!selectedMarker || selectedMarker.type === 'vendor') return;
    const id = selectedMarker.id;

    if (isPlaceInItinerary(id, addedPlaceIds)) return;
    if (pendingItineraryAddsRef.current.has(id)) return;

    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to save places to your itinerary.');
      return;
    }

    const place: TouristSpot = {
      id,
      name: selectedMarker.name,
      city: selectedMarker.city || '',
      state: selectedMarker.state || 'Madhya Pradesh',
      latitude: selectedMarker.lat,
      longitude: selectedMarker.lng,
      category: selectedMarker.category || 'heritage',
      difficulty: 'easy',
      description: selectedMarker.description || '',
      shortDescription: selectedMarker.description || '',
      imageUri: selectedMarker.image || null,
      rating: selectedMarker.rating,
    };
    cacheItineraryPlace(place);

    pendingItineraryAddsRef.current.add(id);
    setAddingPlaceId(id);
    setAddedPlaceIds(prev => new Set(prev).add(id));
    setUser(prev => {
      const list = prev.currentItinerary || [];
      if (list.includes(id)) return prev;
      return { ...prev, currentItinerary: [...list, id] };
    });
    showSuccess('Added to your itinerary');

    try {
      const draftTripId = await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);
      const result = await quickAddPlaceToTrip(id, {
        name: selectedMarker.name,
        city: selectedMarker.city,
        tripId: draftTripId || undefined,
      });
      tripsApi.getById(result.tripId).then(seedDraftTripCache).catch(() => {});
    } catch (err: any) {
      setAddedPlaceIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setUser(prev => ({
        ...prev,
        currentItinerary: (prev.currentItinerary || []).filter(placeId => placeId !== id),
      }));
      if (err?.status === 401) {
        Alert.alert('Sign In Required', 'Create an account or sign in to save places to your itinerary.');
      } else {
        showError(err?.message || 'Could not add this place to your itinerary.');
      }
    } finally {
      pendingItineraryAddsRef.current.delete(id);
      setAddingPlaceId(current => (current === id ? null : current));
    }
  }, [selectedMarker, setUser, isGuest, addedPlaceIds, showSuccess, showError]);

  const handleBookRide = useCallback(() => {
    if (!selectedMarker) return;
    if (!isValidLatLng(selectedMarker.lat, selectedMarker.lng)) {
      Alert.alert('Location unavailable', 'This place does not have valid coordinates.');
      return;
    }
    setRideSheetVisible(true);
  }, [selectedMarker]);

  const _handleRedeemOffer = useCallback(() => {
    if (!selectedMarker) return;
    closeSheet();
  }, [selectedMarker, closeSheet]);

  const handleFlyToLocation = useCallback(async () => {
    let pos = effectivePosition;
    if (!pos) {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) return;
        pos = effectivePosition;
      }
      if (!pos) {
        postToWebView({ type: 'flyTo', lat: INDIA_OVERVIEW.lat, lng: INDIA_OVERVIEW.lng, zoom: INDIA_OVERVIEW.zoom });
        return;
      }
    }
    postToWebView({ type: 'flyTo', lat: pos.latitude, lng: pos.longitude, zoom: MAP_TAB_ZOOM });
    pushUserLocationToMap(pos);
  }, [effectivePosition, hasPermission, requestPermission, postToWebView, pushUserLocationToMap]);

  const handleZoomIn = useCallback(() => {
    postToWebView({ type: 'zoomIn' });
  }, [postToWebView]);

  const handleZoomOut = useCallback(() => {
    postToWebView({ type: 'zoomOut' });
  }, [postToWebView]);

  const _handleRetry = useCallback(() => {
    setLoadError(null);
    setIsLoading(true);
    if (onRetry) onRetry();
    setIsLoading(false);
  }, [onRetry]);

  const travelOrigin = isReliableUserPosition(effectivePosition)
    ? parseLatLng(effectivePosition!.latitude, effectivePosition!.longitude)
    : null;
  const travelDest = selectedMarker ? parseLatLng(selectedMarker.lat, selectedMarker.lng) : null;
  const { result: travelTime } = useTravelTime(
    travelOrigin,
    travelDest,
    selectedMarker?.id,
  );
  const routedTravelTime = travelTime?.source === 'routing' ? travelTime : null;
  const selectedDistanceLabel = useMemo(() => {
    if (!selectedMarker) return undefined;
    if (!isReliableUserPosition(effectivePosition)) return undefined;
    if (!travelDest) return undefined;
    const meters = routedTravelTime?.distanceMeters;
    if (!Number.isFinite(meters)) return undefined;
    const label = formatDistanceFromYou(meters as number);
    return label || undefined;
  }, [selectedMarker, effectivePosition, travelDest, routedTravelTime?.distanceMeters]);

  const handleVendorAddToTrip = useCallback(async () => {
    if (!selectedMarker || selectedMarker.type !== 'vendor') return;
    const id = selectedMarker.id;

    if (isPlaceInItinerary(id, addedPlaceIds)) return;
    if (pendingItineraryAddsRef.current.has(id)) return;

    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to save places to your itinerary.');
      return;
    }

    const place: TouristSpot = {
      id,
      name: selectedMarker.name,
      city: selectedMarker.city || '',
      state: selectedMarker.state || 'Madhya Pradesh',
      latitude: selectedMarker.lat,
      longitude: selectedMarker.lng,
      category: selectedMarker.category || 'local_experience',
      difficulty: 'easy',
      description: selectedMarker.description || '',
      shortDescription: selectedMarker.description || '',
      imageUri: selectedMarker.image || null,
      rating: selectedMarker.rating,
    };
    cacheItineraryPlace(place);

    pendingItineraryAddsRef.current.add(id);
    setAddingPlaceId(id);
    setAddedPlaceIds(prev => new Set(prev).add(id));
    setUser(prev => {
      const list = prev.currentItinerary || [];
      if (list.includes(id)) return prev;
      return { ...prev, currentItinerary: [...list, id] };
    });
    showSuccess('Added to your itinerary');

    try {
      const draftTripId = await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);
      const result = await quickAddPlaceToTrip(id, {
        name: selectedMarker.name,
        city: selectedMarker.city,
        tripId: draftTripId || undefined,
      });
      tripsApi.getById(result.tripId).then(seedDraftTripCache).catch(() => {});
    } catch (err: any) {
      setAddedPlaceIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setUser(prev => ({
        ...prev,
        currentItinerary: (prev.currentItinerary || []).filter(placeId => placeId !== id),
      }));
      if (err?.status === 401) {
        Alert.alert('Sign In Required', 'Create an account or sign in to save places to your itinerary.');
      } else {
        showError(err?.message || 'Could not add this place to your itinerary.');
      }
    } finally {
      pendingItineraryAddsRef.current.delete(id);
      setAddingPlaceId(current => (current === id ? null : current));
    }
  }, [selectedMarker, setUser, isGuest, addedPlaceIds, showSuccess, showError]);

  const handleWriteVendorReview = useCallback((vendorId: string) => {
    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to review this business.');
      return;
    }
    handleMapTabChange('vendors');
    closeSheet();
    navigation.navigate('VendorProfile', { vendorId, openReview: true });
  }, [closeSheet, handleMapTabChange, isGuest, navigation]);

  const detailBottomInset = tabClearance - MAIN_TAB_CONTENT_GAP - 16;
  const controlsBottom = selectedMarker
    ? detailBottomInset + Math.min(selectedMarker.type === 'vendor' ? 280 : 340, SCREEN_H * 0.42)
    : tabClearance + 8;
  const fetchingChipTop = insets.top + (responsive.isSmallPhone ? 72 : 88);

  const bgColor = MapExploreTheme.background;
  const cardBg = '#FFFFFF';
  const borderClr = 'rgba(200, 155, 60, 0.15)';
  const headerText = '#2C1810';
  const mutedText = '#8B7355';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <SafeWebView
        key={webViewKey}
        ref={webViewRef}
        source={{ html: MAP_HTML, baseUrl: 'about:blank' }}
        originWhitelist={['*']}
        style={styles.map}
        onMessage={handleWebMessage}
        onError={() => {
          setMapError('WebView failed to load the map');
        }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        allowsBackForwardNavigationGestures={false}
        mixedContentMode="always"
        mediaPlaybackRequiresUserAction={false}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        onLoadEnd={() => {
          // Soft bump: if HTML loaded but mapReady was lost, ask page to re-announce
          webViewRef.current?.injectJavaScript(`
            (function(){
              try {
                if (window.L && document.getElementById('map') && window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
                }
              } catch (e) {}
              true;
            })();
          `);
        }}
      />

      {!mapReady && (
        <View style={[styles.mapLoadingOverlay, { backgroundColor: mapError ? bgColor : 'rgba(11,18,32,0.88)' }]}>
          {!mapError && (
            <Image
              source={require('../assets/explore_map.png')}
              style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
              resizeMode="cover"
            />
          )}
          {mapError ? (
            <>
              <Icon name="cloud-offline-outline" size={36} color={Pal.colors.light.primary} />
              <Text style={[styles.loadingText, { color: headerText, marginTop: 12 }]}>Map unavailable</Text>
              <Text style={[styles.loadingSubtext, { color: mutedText }]}>{mapError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={reloadMap} activeOpacity={0.8}>
                <Icon name="refresh" size={18} color="#FFF" />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#F5D0A9" />
              <Text style={[styles.loadingText, { color: '#FFFFFF', marginTop: 12 }]}>Loading hybrid map...</Text>
            </>
          )}
        </View>
      )}

      {isNavigating && (
        <View style={[styles.navigatingContainer, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.endNavBtn} onPress={handleEndNavigation} activeOpacity={0.8}>
            <Icon name="close-circle" size={20} color="#FFF" />
            <Text style={styles.endNavText}>End Navigation</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={[styles.tabContainer, { paddingTop: insets.top + 6, opacity: fadeAnim }]}>
        <MapExploreSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 220)}
          onSubmit={() => runPlaceSearch()}
          onClear={() => {
            setSearchQuery('');
            setRemoteSuggestions([]);
          }}
          onMenu={() => Alert.alert('Map menu', 'Filters and saved places')}
          onFilterToggle={() => setShowFilters(prev => !prev)}
          filtersOpen={showFilters}
          loading={isSearching}
        />

        {showFilters && (
          <View style={styles.filterSection}>
            <MapSegmentControl active={activeTab} onChange={handleMapTabChange} />

            {activeTab === 'places' && (
              <MapCategoryChips
                selected={selectedMapCategory}
                onSelect={handleSelectMapCategory}
                chips={mapCategoryChips.length > 0 ? mapCategoryChips : undefined}
              />
            )}

            {activeTab === 'vendors' && (
              <MapVendorCategoryChips
                selected={selectedVendorCategory}
                onSelect={setSelectedVendorCategory}
              />
            )}

            {reviewMode && activeTab === 'vendors' ? (
              <View style={styles.reviewModeBanner}>
                <Icon name="create-outline" size={16} color="#6D5948" />
                <Text style={styles.reviewModeBannerText}>Choose a business to review.</Text>
              </View>
            ) : null}
          </View>
        )}

        {searchFocused && (
          <View style={styles.luxurySuggestionsContainer}>
            {/* Subhead Header Row */}
            <View style={styles.resultsHeaderRow}>
              <View style={styles.resultsHeaderLeft}>
                <Icon name="location-outline" size={14} color="#6D5948" />
                <Text style={styles.resultsHeaderCityText} numberOfLines={1}>
                  {searchQuery.trim()
                    ? `Search results for "${searchQuery.trim()}"`
                    : suggestions.find(s => s.city)?.city
                      ? `Results near ${suggestions.find(s => s.city)?.city}${suggestions.find(s => s.state)?.state ? `, ${suggestions.find(s => s.state)?.state}` : ''}`
                      : 'Suggested places & spots'}
                </Text>
              </View>
              <Text style={styles.resultsHeaderCountText}>
                {suggestions.length > 0 ? `${suggestions.length}+ places found` : 'Searching places...'}
              </Text>
            </View>

            {/* Scrollable Luxury Result Cards */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {suggestions.map((item) => {
                const catTheme = getCategoryColor(item.category || item.sublabel);
                const pillTag = getPlacePillTag(item);
                const distLabel = suggestionDistanceLabels[item.id] || '';
                const distStr = distLabel || '';

                return (
                  <TouchableOpacity
                    key={`${item.type}-${item.id}`}
                    style={styles.luxurySearchCard}
                    onPress={() => handleSelectSuggestion(item)}
                    activeOpacity={0.88}
                  >
                    {/* Left Image Thumbnail Container with Overlapping Pin Badge */}
                    <View style={styles.cardImageWrapper}>
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={styles.cardImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.cardImgPlaceholder, { backgroundColor: catTheme.bg }]}>
                          <Icon name={catTheme.icon} size={28} color={catTheme.text} />
                        </View>
                      )}

                      {/* Category Pin Badge Overlapping Right Edge */}
                      <View style={[styles.categoryPinBadge, { backgroundColor: catTheme.bg }]}>
                        <Icon name={catTheme.icon} size={15} color={catTheme.text} />
                      </View>
                    </View>

                    {/* Right Content Details */}
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.name}
                      </Text>

                      <Text style={[styles.cardCategoryText, { color: catTheme.text }]}>
                        {item.sublabel || item.category || 'Tourist Spot'}
                      </Text>

                      <View style={styles.cardLocationRow}>
                        <Icon name="location-outline" size={13} color="#6D5948" />
                        <Text style={styles.cardLocationText} numberOfLines={1}>
                          {[item.city, item.state].filter(Boolean).join(', ')}
                        </Text>
                        {distStr ? <Text style={styles.cardDistText}>{distStr}</Text> : null}
                        <Icon name="chevron-forward" size={14} color="#6D5948" style={{ marginLeft: 2 }} />
                      </View>

                      {/* Metadata Pills Row */}
                      <View style={styles.cardPillRow}>
                        <View style={styles.cardPill}>
                          <Icon name="time-outline" size={11} color="#6D5948" />
                          <Text style={styles.cardPillText}>
                            {item.estimatedDuration ? `${item.estimatedDuration} mins` : (item.isCityGroup ? 'City' : '1–2 hrs')}
                          </Text>
                        </View>

                        <View style={styles.cardPill}>
                          <Icon name={pillTag.icon} size={11} color={pillTag.color} />
                          <Text style={[styles.cardPillText, { color: pillTag.color }]}>
                            {pillTag.label}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Bottom "Can't find what you're looking for?" Banner Card */}
              <View style={styles.addMissingPlaceBanner}>
                <View style={styles.addMissingLeft}>
                  <View style={styles.addMissingPlusDisc}>
                    <Icon name="add" size={20} color="#6D5948" />
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.addMissingTitle}>Can't find what you're looking for?</Text>
                    <Text style={styles.addMissingSub} numberOfLines={1}>Add a missing place to help other travellers.</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.addMissingBtn}
                  onPress={() => {
                    setSearchFocused(false);
                    navigation.navigate('AddHiddenGem');
                  }}
                  activeOpacity={0.85}
                >
                  <Icon name="create-outline" size={13} color="#6D5948" style={{ marginRight: 4 }} />
                  <Text style={styles.addMissingBtnText}>Add a Place</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}
      </Animated.View>

      {/* Map status chip + offline badge */}
      {!searchFocused && (loadChip.visible || isMapFetching) && (
        <View style={{ position: 'absolute', top: fetchingChipTop, alignSelf: 'center', backgroundColor: 'rgba(30,30,50,0.88)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', pointerEvents: 'none' }}>
          {isMapFetching && <ActivityIndicator size="small" color={Pal.colors.light.primary} />}
          <Text style={{ marginLeft: isMapFetching ? 8 : 0, color: '#FFF', fontSize: 13, fontWeight: '600' }}>
            {loadChip.message || (activeTab === 'vendors' ? 'Loading nearby vendors…' : 'Loading nearby places…')}
          </Text>
        </View>
      )}
      {isOffline && (
        <View style={{ position: 'absolute', top: fetchingChipTop + 44, alignSelf: 'center', backgroundColor: 'rgba(180,83,9,0.92)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Offline Mode</Text>
        </View>
      )}

      <MapFloatingControls
        bottom={controlsBottom}
        topOffset={insets.top + (responsive.isSmallPhone ? 88 : 104)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onLocate={handleFlyToLocation}
      />

      {/* Place detail card */}
      {selectedMarker && selectedMarker.type === 'vendor' && (
        <MapVendorDetailCard
          vendorId={selectedMarker.id}
          distanceLabel={selectedDistanceLabel}
          bottomInset={detailBottomInset}
          navPreview={
            travelTime
              ? {
                  etaMin: Math.max(1, Math.round(travelTime.durationSeconds / 60)),
                  distanceKm: (travelTime.distanceMeters / 1000).toFixed(1),
                }
              : null
          }
          onClose={closeSheet}
          onBookRide={handleBookRide}
          onAddToTrip={handleVendorAddToTrip}
          inItinerary={isPlaceInItinerary(selectedMarker.id, addedPlaceIds)}
          addingToItinerary={addingPlaceId === selectedMarker.id}
          onNavigate={handleNavigate}
          onOpenProfile={() => {
            closeSheet();
            navigation.navigate('VendorProfile', { vendorId: selectedMarker.id });
          }}
          onOpenReel={(reelId, extras) => {
            navigation.navigate('ReelDetail', {
              reelId,
              reels: extras?.reels,
              initialIndex: extras?.initialIndex,
            });
          }}
          onOpenVendorReels={() => {
            closeSheet();
            navigation.navigate('VendorReels', {
              vendorId: selectedMarker.id,
              vendorName: selectedMarker.name
            });
          }}
          onViewAllOffers={() => {
            closeSheet();
            onViewVendorContent?.(selectedMarker.id, selectedMarker.name, 'offers');
          }}
          onOpenOffer={offerId => {
            closeSheet();
            navigation.navigate('VendorOfferDetail', { offerId });
          }}
          onWriteReview={() => handleWriteVendorReview(selectedMarker.id)}
        />
      )}

      {selectedMarker && selectedMarker.type === 'place' && (
        <MapPlaceDetailCard
          marker={{
            id: selectedMarker.id,
            name: selectedMarker.name,
            lat: selectedMarker.lat,
            lng: selectedMarker.lng,
            category: selectedMarker.category,
            type: 'place',
            image: selectedMarker.image,
            rating: selectedMarker.rating,
            reviewCount: selectedMarker.reviewCount,
            description:
              selectedMarker.shortDescription ||
              selectedMarker.description ||
              undefined,
            city: selectedMarker.city,
            state: selectedMarker.state,
            color: selectedMarker.color,
            sublabel: selectedMarker.sublabel,
            needsImage: selectedMarker.needsImage,
            entryFee: selectedMarker.entryFee,
            estimatedDuration: selectedMarker.estimatedDuration,
            isOpen: null,
          }}
          isVendor={false}
          locationUnavailable={!isReliableUserPosition(effectivePosition)}
          inItinerary={isPlaceInItinerary(selectedMarker.id, addedPlaceIds)}
          addingToItinerary={addingPlaceId === selectedMarker.id}
          bottomInset={detailBottomInset}
          onClose={closeSheet}
          onBookRide={handleBookRide}
          onAddToTrip={handleAddToItinerary}
          onNavigate={handleNavigate}
          onAddImage={() => handleAddPhoto(selectedMarker)}
          onReelsPress={() => {
            navigation.navigate('PlaceReels', {
              placeId: selectedMarker.id,
              placeName: selectedMarker.name,
              placeCity: selectedMarker.city,
              placeState: selectedMarker.state,
              placeImage: selectedMarker.image,
            });
          }}
        />
      )}

      <RideOptionsSheet
        visible={
          rideSheetVisible &&
          !!selectedMarker &&
          isValidLatLng(selectedMarker.lat, selectedMarker.lng)
        }
        onClose={() => setRideSheetVisible(false)}
        destLat={selectedMarker && isValidLatLng(selectedMarker.lat, selectedMarker.lng) ? selectedMarker.lat : Number.NaN}
        destLng={selectedMarker && isValidLatLng(selectedMarker.lat, selectedMarker.lng) ? selectedMarker.lng : Number.NaN}
        destName={selectedMarker?.name || 'Selected Place'}
        destAddress={
          selectedMarker
            ? [selectedMarker.city, selectedMarker.state].filter(Boolean).join(', ')
            : undefined
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  mapLoadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  loadingIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(0,168,168,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  loadingText: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  loadingSubtext: { fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
  errorIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(0,168,168,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 20,
    backgroundColor: Pal.colors.light.primary,
    shadowColor: Pal.colors.light.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  retryBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter-SemiBold', marginLeft: 8 },

  tabContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  filterSection: {
    marginTop: 10,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  reviewModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDE4D8',
  },
  reviewModeBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#4E2A10',
  },
  tabRow: {
    flexDirection: 'row', borderRadius: 14, padding: 4, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  tabChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, gap: 6,
  },
  tabChipActive: {
    backgroundColor: '#000000',
  },
  tabChipText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  searchRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  clearSearchBtn: { paddingHorizontal: 4, marginRight: 4 },
  searchActionBtn: {
    backgroundColor: '#63300E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  searchActionText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold' },
  categoryRow: { gap: 8, paddingRight: 16 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.18)',
  },
  categoryChipAllActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterSettingsBtn: {
    width: 40,
    height: 36,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryChipText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  zoomBtn: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  detailCard: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    maxHeight: '52%',
    borderRadius: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
    overflow: 'hidden',
  },
  detailClose: {
    position: 'absolute', top: 10, right: 10, zIndex: 2,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  detailScroll: { flexGrow: 0 },
  detailImage: { width: '100%', height: 140 },
  detailImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  detailBody: { padding: 14, paddingTop: 12 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingRight: 28 },
  detailTitle: { fontSize: 18, fontFamily: 'Inter-Bold', flex: 1 },
  detailRating: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFD70018', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  detailRatingText: { fontSize: 13, fontFamily: 'Inter-Bold', color: '#B8860B' },
  detailMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  detailMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  detailMetaText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  detailDescription: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 21, marginTop: 12 },
  detailActions: { marginTop: 14, gap: 10 },
  detailActionsFixed: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  rideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#B9834B', paddingVertical: 12, borderRadius: 12,
  },
  rideBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' },
  detailActionsRow: { flexDirection: 'row', gap: 10 },
  detailActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 6,
  },
  detailActionPrimary: { backgroundColor: '#63300E' },
  detailActionPrimaryText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-SemiBold' },
  detailActionOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  detailActionOutlineText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },

  mapControls: {
    position: 'absolute', right: 16, zIndex: 10, alignItems: 'center', gap: 8,
  },
  filterBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  filterSheet: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  filterSheetTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8B7355',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterSheetRowActive: {
    backgroundColor: 'rgba(185,131,75,0.1)',
  },
  filterSheetRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#2C1810',
  },
  filterSheetRowTextActive: {
    color: '#63300E',
    fontWeight: '800',
  },
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 25,
  },
  bottomSheet: {
    position: 'absolute', left: 0, right: 0, height: '100%',
    bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.2, shadowRadius: 32, elevation: 25, zIndex: 30, overflow: 'hidden',
  },
  sheetHandle: { alignItems: 'center', paddingVertical: 12, paddingTop: 14 },
  sheetHandleBar: { width: 40, height: 5, borderRadius: 2.5 },
  sheetNoImage: {
    height: 130, justifyContent: 'center', alignItems: 'center',
  },
  sheetNoImageIcon: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
  },
  sheetTitle: { fontSize: 22, fontFamily: 'Inter-Bold', letterSpacing: -0.5 },
  sheetMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' },
  sheetMetaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  sheetMetaText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  sheetDescription: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 22, marginTop: 14 },
  sheetImage: {
    width: '100%', height: 130, borderRadius: 12, marginTop: 12,
  },
  sheetRideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFD700', marginTop: 14, paddingVertical: 10,
    borderRadius: 12, width: '100%',
  },
  sheetRideBtnText: {
    color: '#000', fontSize: 13, fontFamily: 'Inter-Bold',
  },
  sheetActionsFixed: {
    paddingHorizontal: 20, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(25,25,35,0.98)',
  },
  sheetActionsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sheetShareBtn: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 6,
  },
  sheetActionPrimary: {
    backgroundColor: Pal.colors.light.primary,
    shadowColor: Pal.colors.light.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  sheetActionOutline: {
    backgroundColor: 'transparent', borderWidth: 1.5,
  },
  sheetActionText: { color: '#FFF', fontSize: 14, fontFamily: 'Inter-SemiBold' },
  navigatingContainer: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', zIndex: 50,
  },
  endNavBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E53935',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, gap: 6,
    shadowColor: '#E53935', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  endNavText: { color: '#FFF', fontSize: 14, fontFamily: 'Inter-Bold' },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 8,
    height: 50,
    borderWidth: 1,
    shadowColor: '#63300E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    paddingVertical: 0,
    minHeight: 44,
  },
  suggestionsContainer: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  luxurySuggestionsContainer: {
    marginTop: 8,
    backgroundColor: '#FCFAF7',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F2EDE6',
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  resultsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  resultsHeaderCityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D5948',
  },
  resultsHeaderCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A5217',
  },
  luxurySearchCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3EEE7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImageWrapper: {
    position: 'relative',
    width: 88,
    height: 88,
  },
  cardImg: {
    width: 88,
    height: 88,
    borderRadius: 16,
  },
  cardImgPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPinBadge: {
    position: 'absolute',
    right: -10,
    top: 26,
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    flex: 1,
    marginLeft: 18,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#1F1A17',
    lineHeight: 20,
  },
  cardCategoryText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 3,
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardLocationText: {
    fontSize: 12,
    color: '#6D5948',
    flex: 1,
    marginLeft: 3,
  },
  cardDistText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F1A17',
    marginLeft: 4,
  },
  cardPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF6F0',
    borderWidth: 1,
    borderColor: '#EFE8DD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  cardPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6D5948',
  },
  addMissingPlaceBanner: {
    backgroundColor: '#FFFBF5',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F2E9DE',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 6,
  },
  addMissingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  addMissingPlusDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5EBE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMissingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C1810',
  },
  addMissingSub: {
    fontSize: 11,
    color: '#7C6C60',
    marginTop: 1,
  },
  addMissingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#8C7765',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  addMissingBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6D5948',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  suggestionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionEmoji: { fontSize: 16 },
  suggestionTextContainer: { flex: 1 },
  suggestionName: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  suggestionLocation: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
});
