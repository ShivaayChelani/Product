import { View, Text, TextInput, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useLocationContext } from '../context/LocationContext';
import { searchUniversal, UniversalSearchResult } from '../services/searchService';
import { getNearbyPlaces, getHiddenGems } from '../services/placesService';
import { isNearbySearchQuery } from '../hooks/useNearbyPlacesFromGps';
import { haversineDistance, isReliableUserPosition } from '../services/location/distance';
import { withRoutedDistanceFields } from '../services/location/routedDistance';
import { NEARBY_SEARCH_RADIUS_M } from '../services/location/categoryNearbyFilter';
import { searchHomeCategory, type CityCategorySearchResult } from '../services/homeCategorySearch';
import { getHomeCategoryById, getHomeCategoryForQuery } from '../components/home/constants';
import { recordSearchedPlace } from '../utils/passportPlaces';
import { useHeaderSafePadding, useBottomSafePadding, useResponsive } from '../design/responsive';
import { isGenericDestination, placeBelongsToDestination } from '../utils/destination';
import {
  buildNearbyRenderableRows,
  buildUniversalRenderableRows,
  isCityFilterActive,
  resultMatchesFilter,
  type SearchRenderableRow,
} from '../utils/searchItineraryRows';

// -----------------------------------------------------------------------------
// Local skin/bronze/cream design system for the search experience
// -----------------------------------------------------------------------------
const C = {
  primary: '#B9834B',
  primaryDark: '#63300E',
  sky: '#D4A87A',
  primarySoft: 'rgba(185, 131, 75, 0.10)',
  primarySofter: 'rgba(185, 131, 75, 0.06)',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#FFFFFF',
  skeleton: '#E8D9C4',
  border: 'rgba(200, 155, 60, 0.15)',
  borderStrong: 'rgba(200, 155, 60, 0.30)',
  text: '#2C1810',
  textSecondary: '#8B7355',
  textMuted: '#B8A88A',
  rating: '#FF9F1C',
  white: '#FFFFFF',
  cardShadow: 'rgba(185, 131, 75, 0.15)',
} as const;

const FILTERS = ['All', 'Places', 'Hidden Gems', 'Vendors', 'Offers', 'Events'] as const;
type SearchFilter = typeof FILTERS[number];

type NearbyPlaceResult = {
  id: string;
  name: string;
  city?: string;
  state?: string;
  category?: string;
  rating?: number;
  thumbnail?: string | null;
  imageUrl?: string | null;
  slug?: string;
  latitude?: number | null;
  longitude?: number | null;
  distanceLabel: string;
  distanceMeters?: number;
  straightLineMeters?: number;
};

function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/^\?+\s*/, '');
}

function resolveCityCategoryId(categoryId?: string, query?: string): string | null {
  if (categoryId) {
    const cat = getHomeCategoryById(categoryId);
    if (cat && cat.mode !== 'gps_nearby' && cat.mode !== 'universal') return cat.id;
  }
  const fromQuery = getHomeCategoryForQuery(query || '');
  if (fromQuery && fromQuery.mode !== 'gps_nearby' && fromQuery.mode !== 'universal') {
    return fromQuery.id;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Small reusable UI pieces
// -----------------------------------------------------------------------------

function SearchHeader({ onBack, title }: { onBack?: () => void; title: string }) {
  return (
    <View style={styles.headerRow}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          activeOpacity={0.8}
        >
          <Icon name="arrow-back-outline" size={22} color={C.text} />
        </TouchableOpacity>
      ) : null}
      <Text style={styles.screenTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
    >
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : styles.chipLabelInactive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResultCard({
  type,
  item,
  onPress,
  added = false,
  actionLabel,
  onAddPress,
  cityMismatch = false,
}: {
  type: string;
  item: any;
  onPress: () => void;
  added?: boolean;
  actionLabel?: string;
  onAddPress?: () => void;
  cityMismatch?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUri =
    item.thumbnail || item.imageUrl || item.imageUri || item.avatarUrl || item.thumbnailUrl || null;
  const showImage = !!imageUri && !imageFailed;

  const title = item.name || item.title || item.businessName || item.fullName || 'Untitled';
  const cityPart = item.city ? (item.state ? `${item.city}, ${item.state}` : item.city) : item.subtitle || '';
  const locationLabel = item.distanceLabel || cityPart;
  const rating = Number(item.rating) > 0 ? Number(item.rating) : null;
  const categoryLabel = item.category ? String(item.category) : type;
  const showAddAction = Boolean(onAddPress || actionLabel);

  return (
    <TouchableOpacity
      style={[styles.card, added && styles.cardAdded]}
      onPress={added ? undefined : onPress}
      activeOpacity={added ? 1 : 0.85}
      disabled={added && !onAddPress}
    >
      <View style={styles.cardImageWrap}>
        {showImage ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Icon name="image-outline" size={26} color={C.textMuted} />
          </View>
        )}
        {cityMismatch ? (
          <View style={styles.cityMismatchBadge}>
            <Icon name="warning-outline" size={12} color={C.primaryDark} />
            <Text style={styles.cityMismatchText}>Different city</Text>
          </View>
        ) : null}
        {!showAddAction ? (
          <View style={styles.bookmarkBtn} pointerEvents="none">
            <Icon name="heart-outline" size={16} color={C.primary} />
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {locationLabel ? (
          <View style={styles.cardLocationRow}>
            <Icon name="location-outline" size={13} color={C.textMuted} />
            <Text style={styles.cardLocation} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>
        ) : null}
        <View style={styles.cardMetaRow}>
          {rating ? (
            <>
              <Icon name="star" size={13} color={C.rating} />
              <Text style={styles.cardRating}>{rating.toFixed(1)}</Text>
              <Text style={styles.metaSep}>•</Text>
            </>
          ) : null}
          <Text style={styles.cardCategory} numberOfLines={1}>
            {categoryLabel}
          </Text>
        </View>
        {showAddAction ? (
          <TouchableOpacity
            style={[styles.addBtn, added && styles.addBtnDisabled]}
            onPress={onAddPress || onPress}
            disabled={added}
            activeOpacity={0.85}
          >
            <Text style={[styles.addBtnText, added && styles.addBtnTextDisabled]}>
              {actionLabel || (added ? '✓ Added' : 'Add')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function RecentSearchChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.recentChip} onPress={onPress} activeOpacity={0.8}>
      <Icon name="clock-outline" size={14} color={C.textMuted} />
      <Text style={styles.recentChipText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function EmptyState({
  icon,
  iconColor = C.primary,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  iconColor?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Icon name={icon} size={30} color={iconColor} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.emptyBtn} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.emptyBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={styles.skeletonCard}>
      <Animated.View style={[styles.skeletonImage, { opacity }]} />
      <View style={styles.skeletonBody}>
        <Animated.View style={[styles.skeletonLine, { width: '70%', opacity }]} />
        <Animated.View style={[styles.skeletonLine, { width: '45%', opacity }]} />
        <Animated.View style={[styles.skeletonLine, { width: '30%', opacity }]} />
      </View>
    </View>
  );
}

function SavedHero() {
  return (
    <View style={styles.savedHero}>
      <Image source={require('../assets/saved_places.png')} style={styles.savedHeroImage} resizeMode="cover" />
    </View>
  );
}

export default function SearchScreen({
  onBack,
  onSelectSpot,
  onSelectVendor,
  onSelectOffer,
  onReplacePlace,
  onAddToItinerary,
  initialQuery,
  categoryId,
  mode,
  destination,
  excludePlaceIds = [],
}: {
  onBack?: () => void;
  onSelectSpot?: (spotId: string) => void;
  onSelectVendor?: (vendorId: string) => void;
  onSelectOffer?: (offerId: string) => void;
  onReplacePlace?: (placeId: string) => void;
  onAddToItinerary?: (placeId: string, meta?: { name?: string; city?: string }) => void | Promise<void>;
  initialQuery?: string;
  categoryId?: string;
  mode?: 'replace' | 'itinerary';
  destination?: string;
  excludePlaceIds?: string[];
}) {
  const isReplaceMode = mode === 'replace';
  const isItineraryMode = mode === 'itinerary';
  const excluded = useMemo(() => new Set(excludePlaceIds), [excludePlaceIds]);
  const { theme } = useTheme();
  const { effectivePosition, requestPermission, openLocationSettings } = useLocationContext();
  const responsive = useResponsive();
  const headerPadTop = useHeaderSafePadding(12);
  const scrollPadBottom = useBottomSafePadding(24);
  const screenPad = responsive.contentPad;
  const [query, setQuery] = useState(
    initialQuery?.trim() || (isReplaceMode && destination ? destination : ''),
  );

  const [results, setResults] = useState<UniversalSearchResult | null>(null);
  const [nearbyResults, setNearbyResults] = useState<NearbyPlaceResult[] | null>(null);
  const [cityResults, setCityResults] = useState<CityCategorySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetryNonce, setSearchRetryNonce] = useState(0);
  const [awaitingGps, setAwaitingGps] = useState(false);
  const [locationRequired, setLocationRequired] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<SearchFilter>(() =>
    mode === 'itinerary' ? 'Places' : 'All',
  );
  const [hiddenGemBrowseRows, setHiddenGemBrowseRows] = useState<SearchRenderableRow[] | null>(null);
  const [hiddenGemBrowseLoading, setHiddenGemBrowseLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (initialQuery?.trim()) setQuery(initialQuery.trim());
    else if (isReplaceMode && destination) setQuery(destination);
  }, [initialQuery, isReplaceMode, destination]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const saved = await AsyncStorage.getItem('@search_history');
      if (saved) setHistory(JSON.parse(saved));
    } catch { }
  };

  const saveToHistory = async (q: string) => {
    const newHist = [q, ...history.filter(h => h !== q)].slice(0, 10);
    setHistory(newHist);
    await AsyncStorage.setItem('@search_history', JSON.stringify(newHist));
  };

  const clearHistory = async () => {
    setHistory([]);
    await AsyncStorage.removeItem('@search_history');
  };

  const runNearbySearch = useCallback(async (q: string) => {
    if (!isReliableUserPosition(effectivePosition)) return;
    const lat = effectivePosition.latitude;
    const lng = effectivePosition.longitude;

    const gen = ++fetchGenRef.current;
    setLoading(true);
    setAwaitingGps(false);
    setNearbyResults(null);
    setResults(null);
    setCityResults(null);

    try {
      const spots = await getNearbyPlaces(lat, lng, NEARBY_SEARCH_RADIUS_M);
      if (fetchGenRef.current !== gen) return;

      const seen = new Set<string>();
      const places: NearbyPlaceResult[] = [];
      for (const spot of spots) {
        if (seen.has(spot.id)) continue;
        seen.add(spot.id);
        const meters = haversineDistance(lat, lng, spot.latitude, spot.longitude);
        places.push({
          id: spot.id,
          name: spot.name,
          city: spot.city,
          state: spot.state,
          category: String(spot.category),
          rating: spot.rating,
          thumbnail: spot.imageUrl,
          imageUrl: spot.imageUrl,
          latitude: spot.latitude,
          longitude: spot.longitude,
          distanceLabel: '',
          straightLineMeters: meters,
        });
      }

      const closestCandidates = places
        .sort((a, b) => (a.straightLineMeters ?? Infinity) - (b.straightLineMeters ?? Infinity))
        .slice(0, 20);
      const routedPlaces = await withRoutedDistanceFields(
        { latitude: lat, longitude: lng },
        closestCandidates,
        item => ({ latitude: item.latitude, longitude: item.longitude }),
      );
      routedPlaces.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
      setNearbyResults(routedPlaces);
      saveToHistory(q);
    } catch {
      if (fetchGenRef.current === gen) setNearbyResults([]);
    } finally {
      if (fetchGenRef.current === gen) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePosition]);

  const runCityCategorySearch = useCallback(async (activeCategoryId: string, q: string) => {
    if (!isReliableUserPosition(effectivePosition)) return;
    const lat = effectivePosition.latitude;
    const lng = effectivePosition.longitude;

    const gen = ++fetchGenRef.current;
    setLoading(true);
    setAwaitingGps(false);
    setNearbyResults(null);
    setResults(null);
    setCityResults(null);

    try {
      const payload = await searchHomeCategory(activeCategoryId, lat, lng);
      if (fetchGenRef.current !== gen) return;
      setCityResults(payload);
      saveToHistory(q);
    } catch {
      if (fetchGenRef.current === gen) {
        setCityResults({
          category: getHomeCategoryById(activeCategoryId)!,
          city: null,
          items: [],
          unavailable: true,
          unavailableMessage: 'Could not load results. Try again.',
        });
      }
    } finally {
      if (fetchGenRef.current === gen) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePosition]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = normalizeSearchQuery(query);
    if (!q) {
      setResults(null);
      setNearbyResults(null);
      setCityResults(null);
      setAwaitingGps(false);
      setLocationRequired(false);
      setSearchError(null);
      setLoading(false);
      return;
    }

    const cityCategoryId = resolveCityCategoryId(categoryId, q);
    const needsGps = isNearbySearchQuery(q) || !!cityCategoryId;

    if (needsGps) {
      setResults(null);
      if (!isReliableUserPosition(effectivePosition)) {
        setLoading(true);
        setAwaitingGps(true);
        setLocationRequired(false);
        void requestPermission().then(granted => {
          if (!granted) {
            setAwaitingGps(false);
            setLoading(false);
            setLocationRequired(true);
            setNearbyResults(null);
            setCityResults(null);
          }
        });
        return;
      }
      setLocationRequired(false);
      setLoading(true);
      if (isNearbySearchQuery(q)) {
        timerRef.current = setTimeout(() => runNearbySearch(q), 250);
      } else if (cityCategoryId) {
        timerRef.current = setTimeout(() => runCityCategorySearch(cityCategoryId, q), 250);
      }
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }

    setNearbyResults(null);
    setCityResults(null);
    setAwaitingGps(false);
    setLoading(true);
    setSearchError(null);
    timerRef.current = setTimeout(async () => {
      const gen = ++fetchGenRef.current;
      try {
        const data = await searchUniversal(q);
        if (fetchGenRef.current !== gen) return;
        setResults(data);
        saveToHistory(q);
      } catch {
        if (fetchGenRef.current !== gen) return;
        setResults(null);
        setSearchError('Search is temporarily unavailable. Check your connection and try again.');
      } finally {
        if (fetchGenRef.current === gen) setLoading(false);
      }
    }, 500);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId, effectivePosition?.latitude, effectivePosition?.longitude, runNearbySearch, runCityCategorySearch, searchRetryNonce]);

  useEffect(() => {
    if (
      normalizeSearchQuery(query) ||
      activeFilter !== 'Hidden Gems' ||
      isItineraryMode ||
      isReplaceMode
    ) {
      setHiddenGemBrowseRows(null);
      setHiddenGemBrowseLoading(false);
      return;
    }

    let cancelled = false;
    setHiddenGemBrowseLoading(true);
    void getHiddenGems()
      .then(spots => {
        if (cancelled) return;
        const excludedIds = new Set(excludePlaceIds);
        setHiddenGemBrowseRows(
          spots.map(spot => ({
            key: `Hidden Gem-${spot.id}`,
            type: 'Hidden Gem',
            item: {
              id: spot.id,
              name: spot.name,
              city: spot.city,
              state: spot.state,
              category: spot.category,
              rating: spot.rating,
              thumbnail: spot.imageUrl,
              imageUrl: spot.imageUrl,
            },
            added: excludedIds.has(spot.id),
            cityMismatch: false,
            actionLabel: excludedIds.has(spot.id) ? '✓ Added' : 'Add',
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setHiddenGemBrowseRows([]);
      })
      .finally(() => {
        if (!cancelled) setHiddenGemBrowseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, activeFilter, isItineraryMode, isReplaceMode, excludePlaceIds]);

  const cityFilterActive = isCityFilterActive(isReplaceMode ? 'replace' : isItineraryMode ? 'itinerary' : undefined, destination);

  const placeMatchesKnownCity = (item: { city?: string; state?: string; name?: string }) => {
    if (!cityFilterActive || !destination) return true;
    return placeBelongsToDestination(item, destination);
  };

  const rowBuildOptions = useMemo(
    () => ({
      mode: (isReplaceMode ? 'replace' : isItineraryMode ? 'itinerary' : undefined) as 'replace' | 'itinerary' | undefined,
      destination,
      excludePlaceIds,
      activeFilter,
      itineraryPlacesOnly: isReplaceMode || isItineraryMode,
    }),
    [isReplaceMode, isItineraryMode, destination, excludePlaceIds, activeFilter],
  );

  const universalRenderableRows = useMemo(
    () => buildUniversalRenderableRows(results, rowBuildOptions),
    [results, rowBuildOptions],
  );

  const nearbyRenderableRows = useMemo(
    () => buildNearbyRenderableRows(nearbyResults as Array<Record<string, unknown>> | null, rowBuildOptions),
    [nearbyResults, rowBuildOptions],
  );

  const cityRenderableRows = useMemo(() => {
    if (!cityResults?.items?.length) return [] as SearchRenderableRow[];
    const excluded = new Set(excludePlaceIds);
    const rows: SearchRenderableRow[] = [];
    for (const item of cityResults.items) {
      if (!resultMatchesFilter(item.resultType, activeFilter)) continue;
      if (isReplaceMode && cityFilterActive && !placeMatchesKnownCity(item)) continue;
      const placeId = String(item.placeId || item.id || '');
      const cityMismatch = cityFilterActive && !placeMatchesKnownCity(item);
      rows.push({
        key: `${item.resultType}-${placeId}`,
        type: item.resultType,
        item: item as Record<string, unknown>,
        added: excluded.has(placeId),
        cityMismatch,
        actionLabel: excluded.has(placeId) ? '✓ Added' : 'Add',
      });
    }
    return rows;
  }, [cityResults, rowBuildOptions, excludePlaceIds, activeFilter, cityFilterActive, isReplaceMode, destination]);

  const handleResultPress = (type: string, item: any) => {
    const placeId = item.placeId || item.id;
    if (isReplaceMode) {
      if (type.toLowerCase() !== 'place' && type.toLowerCase() !== 'hidden gem' && type.toLowerCase() !== 'event') {
        Alert.alert('Places only', 'Choose a verified tourist place from the database.');
        return;
      }
      if (excluded.has(placeId)) {
        Alert.alert('Already in trip', 'This place is already on your itinerary.');
        return;
      }
      onReplacePlace?.(placeId);
      return;
    }
    if (isItineraryMode) {
      if (type.toLowerCase() !== 'place' && type.toLowerCase() !== 'hidden gem' && type.toLowerCase() !== 'event') {
        Alert.alert('Places only', 'Choose a tourist place to add to your itinerary.');
        return;
      }
      if (excluded.has(placeId)) {
        return;
      }
      void onAddToItinerary?.(placeId, { name: item.name, city: item.city });
      return;
    }
    switch (type.toLowerCase()) {
      case 'place':
      case 'hidden gem':
      case 'event':
        recordSearchedPlace({
          id: item.id || item.slug,
          name: item.name,
          city: item.city,
          state: item.state,
          category: item.category,
          isHiddenGem: type.toLowerCase() === 'hidden gem' || item.isHiddenGem,
          slug: item.slug,
        } as any);
        onSelectSpot?.(item.placeId || item.id);
        break;
      case 'vendor':
        if (onSelectVendor) onSelectVendor(item.vendorId || item.id);
        else onSelectSpot?.(item.placeId || item.id);
        break;
      case 'offer':
        if (onSelectOffer) onSelectOffer(item.offerId || item.id);
        else if (item.vendorId) onSelectVendor?.(item.vendorId);
        break;
      case 'reel':
        onSelectSpot?.(item.placeId || item.id);
        break;
      case 'creator':
        Alert.alert(item.name || item.fullName || 'Creator', item.bio || 'Creator profile');
        break;
      default:
        onSelectSpot?.(item.placeId || item.id);
    }
  };

  const renderSearchRow = ({ item: row }: { item: SearchRenderableRow }) => (
    <ResultCard
      type={row.type}
      item={row.item}
      added={row.added}
      actionLabel={isItineraryMode ? row.actionLabel : undefined}
      cityMismatch={isItineraryMode ? row.cityMismatch : false}
      onAddPress={isItineraryMode ? () => handleResultPress(row.type, row.item) : undefined}
      onPress={() => handleResultPress(row.type, row.item)}
    />
  );

  const activeRenderableRows = useMemo(() => {
    if (hiddenGemBrowseRows) return hiddenGemBrowseRows;
    if (cityResults) return cityRenderableRows;
    if (nearbyResults) return nearbyRenderableRows;
    if (results) return universalRenderableRows;
    return [] as SearchRenderableRow[];
  }, [hiddenGemBrowseRows, cityResults, nearbyResults, results, cityRenderableRows, nearbyRenderableRows, universalRenderableRows]);

  const nearbyCount = nearbyResults?.length ?? 0;
  const isSavedQuery = normalizeSearchQuery(query).toLowerCase() === 'saved';
  const renderableCount = activeRenderableRows.length;
  const isHiddenGemBrowse = activeFilter === 'Hidden Gems' && !normalizeSearchQuery(query) && !isItineraryMode && !isReplaceMode;

  const resultsListHeader = (
    <>
      {isSavedQuery && (cityResults || results) ? <SavedHero /> : null}
      {cityResults && !cityResults.unavailable ? (
        <>
          <View style={styles.locationRow}>
            <Icon name="location-outline" size={15} color={C.primary} />
            <Text style={styles.nearTitle}>
              {cityResults.city?.city ? `Places near ${cityResults.city.city}` : 'Near you'}
            </Text>
          </View>
          <Text style={styles.sectionCount}>
            {renderableCount} {cityResults.category.name.toLowerCase()} · closest first
          </Text>
        </>
      ) : null}
      {nearbyResults && nearbyCount > 0 ? (
        <>
          <View style={styles.locationRow}>
            <Icon name="location-outline" size={15} color={C.primary} />
            <Text style={styles.nearTitle}>Near you</Text>
          </View>
          <Text style={styles.sectionCount}>{renderableCount} places · closest first</Text>
        </>
      ) : null}
      {results && !cityResults && !nearbyResults && !isHiddenGemBrowse ? (
        <Text style={styles.sectionCount}>{renderableCount} results found</Text>
      ) : null}
      {isHiddenGemBrowse && renderableCount > 0 ? (
        <Text style={styles.sectionCount}>{renderableCount} hidden gems</Text>
      ) : null}
    </>
  );

  const resultsEmptyComponent =
    cityResults?.unavailable ? (
      <EmptyState
        icon="location-outline"
        title="Not available"
        message={cityResults.unavailableMessage || 'Could not load results. Try again.'}
      />
    ) : nearbyResults && nearbyCount === 0 ? (
      <EmptyState
        icon="location-outline"
        title="No places nearby"
        message="No places within 30 km. Try the map to explore further from your location."
      />
    ) : (
      <EmptyState
        icon="search-outline"
        title={
          activeFilter === 'All'
            ? 'No places found'
            : `No ${activeFilter.toLowerCase()} found`
        }
        message={
          isItineraryMode
            ? 'Try another place name or adjust your filter.'
            : 'Try searching for another destination, place or experience.'
        }
      />
    );

  return (
    <View style={[styles.screen, { backgroundColor: C.background, paddingTop: headerPadTop, paddingHorizontal: screenPad }]}>
      <SearchHeader onBack={onBack} title="Search PalSafar" />

      <View style={styles.searchBar}>
        <Icon name="search-outline" size={20} color={C.textMuted} />
        <TextInput
          placeholder={
            isReplaceMode
              ? 'Search verified places...'
              : isItineraryMode
                ? 'Search places to add...'
                : 'Search places, cities...'
          }
          placeholderTextColor={C.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.closeBtn}
            activeOpacity={0.8}
          >
            <Icon name="close" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {isReplaceMode && (
        <View style={styles.infoBanner}>
          <Icon name="information-circle-outline" size={16} color={C.primary} />
          <Text style={styles.infoBannerText}>
            Replace with a verified place{destination ? ` in ${destination}` : ''}. Database only, no invented locations.
          </Text>
        </View>
      )}
      {isItineraryMode && (
        <View style={styles.infoBanner}>
          <Icon name="information-circle-outline" size={16} color={C.primary} />
          <Text style={styles.infoBannerText}>
            Tap a place to add it to your itinerary{destination && !isGenericDestination(destination) ? ` in ${destination}` : ''}. You can add multiple places, then go back to review your trip.
          </Text>
        </View>
      )}

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map(f => (
            <FilterChip key={f} label={f} active={activeFilter === f} onPress={() => setActiveFilter(f)} />
          ))}
        </ScrollView>
      </View>

      {!normalizeSearchQuery(query) ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: scrollPadBottom }]}
        >
          {isHiddenGemBrowse && hiddenGemBrowseLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={styles.loadingText}>Loading hidden gems...</Text>
            </View>
          ) : isHiddenGemBrowse && hiddenGemBrowseRows && hiddenGemBrowseRows.length > 0 ? (
            <>
              <Text style={styles.sectionCount}>{hiddenGemBrowseRows.length} hidden gems</Text>
              {hiddenGemBrowseRows.map(row => (
                <ResultCard
                  key={row.key}
                  type={row.type}
                  item={row.item}
                  onPress={() => handleResultPress(row.type, row.item)}
                />
              ))}
            </>
          ) : isHiddenGemBrowse ? (
            <EmptyState
              icon="diamond-outline"
              title="No hidden gems yet"
              message="Approved hidden gems from the community will appear here."
            />
          ) : isItineraryMode ? (
            <EmptyState
              icon="search-outline"
              title="Add places to your trip"
              message="Search for places to add to your itinerary"
            />
          ) : history.length > 0 ? (
            <View style={styles.recentSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent searches</Text>
                <TouchableOpacity onPress={clearHistory} hitSlop={8} activeOpacity={0.7}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.recentWrap}>
                {history.map(s => (
                  <RecentSearchChip key={s} label={s} onPress={() => setQuery(s)} />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : locationRequired ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollPadBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <EmptyState
            icon="location-outline"
            title="Location required"
            message="Turn on location to see places and vendors near you. PalSafar will not show unrelated cities as nearby."
            actionLabel="Enable location"
            onAction={() => {
              void requestPermission().then(granted => {
                if (granted) {
                  setLocationRequired(false);
                  setAwaitingGps(true);
                  setSearchRetryNonce(n => n + 1);
                } else {
                  openLocationSettings();
                }
              });
            }}
          />
        </ScrollView>
      ) : loading || awaitingGps ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollPadBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>
              {awaitingGps ? 'Getting your location...' : 'Searching PalSafar...'}
            </Text>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        </ScrollView>
      ) : searchError ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollPadBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <EmptyState
            icon="alert-circle-outline"
            iconColor={theme.danger}
            title="Search unavailable"
            message={searchError}
            actionLabel="Try Again"
            onAction={() => setSearchRetryNonce(n => n + 1)}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={activeRenderableRows}
          keyExtractor={item => item.key}
          renderItem={renderSearchRow}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: scrollPadBottom }]}
          ListHeaderComponent={renderableCount > 0 ? resultsListHeader : null}
          ListEmptyComponent={resultsEmptyComponent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  screenTitle: {
    flex: 1,
    fontFamily: 'Inter-SemiBold',
    fontSize: 21,
    color: C.text,
  },
  searchBar: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: C.text,
    fontFamily: 'Inter-Regular',
    paddingVertical: 0,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.primarySofter,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  infoBannerText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },
  chipsWrap: {
    marginTop: 12,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  chipInactive: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  chipLabelActive: {
    color: C.white,
  },
  chipLabelInactive: {
    color: C.textSecondary,
  },
  content: {
    paddingTop: 18,
  },
  recentSection: {
    paddingTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: C.text,
  },
  clearText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: C.primary,
  },
  recentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    maxWidth: '100%',
  },
  recentChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: C.textSecondary,
    flexShrink: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  nearTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: C.text,
  },
  sectionCount: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 14,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardImageWrap: {
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: C.surfaceMuted,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceMuted,
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 12,
  },
  cardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: C.text,
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  cardLocation: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: C.textSecondary,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  cardRating: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: C.text,
  },
  metaSep: {
    fontSize: 12,
    color: C.textMuted,
  },
  cardCategory: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: C.textMuted,
  },
  cardAdded: {
    opacity: 0.88,
  },
  cityMismatchBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 248, 235, 0.95)',
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  cityMismatchText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: C.primaryDark,
  },
  addBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: C.primary,
  },
  addBtnDisabled: {
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.border,
  },
  addBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: C.white,
  },
  addBtnTextDisabled: {
    color: C.textMuted,
  },
  loadingWrap: {
    alignItems: 'center',
    marginTop: 28,
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: C.textMuted,
    marginBottom: 6,
  },
  skeletonCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  skeletonImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: C.skeleton,
  },
  skeletonBody: {
    padding: 12,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: C.skeleton,
  },
  savedHero: {
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  savedHeroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 44,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: C.text,
    textAlign: 'center',
  },
  emptyMessage: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: C.primary,
  },
  emptyBtnText: {
    color: C.white,
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
});
