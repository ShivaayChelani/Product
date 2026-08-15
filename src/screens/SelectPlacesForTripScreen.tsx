import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StatusBar,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { placesApi, PlaceResponse } from '../services/api/places';
import { searchApi } from '../services/api/search';
import {
  canonicalizeDestination,
  extractMustVisitHints,
  formatDestinationLabel,
  placeBelongsToDestination,
} from '../utils/destination';

export type SelectPlacesParams = {
  destination: string;
  days: number;
  pace?: string;
  travelers?: string;
  budget?: string;
  customBudgetAmount?: number;
  interests?: string[];
  timePreference?: string;
  avoid?: string[];
  prompt?: string;
  tripId?: string;
};

const C = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  navy: '#1E2A3A',
  ink: '#63300E',
  text: '#2C1810',
  textSub: '#8B7355',
  textMuted: '#B8A88A',
  border: 'rgba(200, 155, 60, 0.18)',
  banner: '#FBF0D9',
  bannerBorder: 'rgba(200, 155, 60, 0.25)',
  green: '#059669',
  chipBg: '#F3F4F6',
};

const H_PAD = 16;

const CATEGORY_CHIPS = [
  { key: 'all', label: 'All', icon: 'grid-outline' as const },
  { key: 'temple', label: 'Temples', icon: 'business-outline' as const },
  { key: 'waterfall', label: 'Waterfalls', icon: 'water-outline' as const },
  { key: 'heritage', label: 'Heritage', icon: 'library-outline' as const },
  { key: 'nature', label: 'Nature', icon: 'leaf-outline' as const },
  { key: 'more', label: 'More', icon: 'chevron-down' as const },
];

const MORE_CATEGORIES = ['park', 'fort', 'museum', 'lake', 'monument', 'ghat', 'adventure'];

function parseEntryFee(ticketPrice: unknown): number | null {
  if (!ticketPrice || typeof ticketPrice !== 'object') return null;
  const tp = ticketPrice as { adult?: number; child?: number; foreigner?: number };
  if (typeof tp.adult === 'number') return tp.adult;
  if (typeof tp.foreigner === 'number') return tp.foreigner;
  if (typeof tp.child === 'number') return tp.child;
  return null;
}

function placeImage(place: PlaceResponse): string | null {
  if (place.thumbnail) return place.thumbnail;
  if (place.images?.length) return place.images[0];
  return null;
}

function dedupePlaces(places: PlaceResponse[]): PlaceResponse[] {
  const seenIds = new Set<string>();
  const groups: { key: string; lat: number; lng: number; items: PlaceResponse[] }[] = [];

  for (const p of places) {
    if (p.id && seenIds.has(p.id)) continue;
    if (p.latitude == null || p.longitude == null) {
      groups.push({ key: p.id || p.name, lat: 0, lng: 0, items: [p] });
      continue;
    }
    const key = (p.name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim();
    const match = groups.find(
      (g) => g.key === key
        && g.lat !== 0
        && Math.abs(g.lat - p.latitude!) < 0.003
        && Math.abs(g.lng - p.longitude!) < 0.003,
    );
    if (match) {
      match.items.push(p);
    } else {
      groups.push({ key, lat: p.latitude, lng: p.longitude, items: [p] });
    }
    if (p.id) seenIds.add(p.id);
  }

  return groups.map((g) =>
    g.items.reduce((best, cur) => ((cur.rating ?? 0) > (best.rating ?? 0) ? cur : best)),
  );
}

function formatReviews(count?: number): string {
  if (!count) return '';
  if (count >= 1000) return `(${(count / 1000).toFixed(1)}k)`;
  return `(${count})`;
}

function formatDuration(mins?: number | null): string {
  const m = mins || 60;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function formatCategory(cat?: string): string {
  if (!cat) return 'Place';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function categoryIcon(cat?: string): string {
  const c = (cat || '').toLowerCase();
  if (c.includes('temple') || c.includes('gurudwara') || c.includes('mosque')) return 'business-outline';
  if (c.includes('waterfall')) return 'water-outline';
  if (c.includes('fort') || c.includes('heritage') || c.includes('monument')) return 'library-outline';
  if (c.includes('park') || c.includes('nature') || c.includes('lake')) return 'leaf-outline';
  return 'location-outline';
}

function matchesCategory(place: PlaceResponse, key: string, showMore: boolean): boolean {
  if (key === 'all') return true;
  if (key === 'more') return showMore ? MORE_CATEGORIES.some(m => (place.category || '').toLowerCase().includes(m)) : true;
  const cat = (place.category || '').toLowerCase();
  if (key === 'temple') return cat.includes('temple') || cat.includes('gurudwara') || cat.includes('mosque') || cat.includes('church');
  if (key === 'waterfall') return cat.includes('waterfall');
  if (key === 'heritage') return cat.includes('heritage') || cat.includes('fort') || cat.includes('monument') || cat.includes('museum');
  if (key === 'nature') return cat.includes('nature') || cat.includes('park') || cat.includes('lake') || cat.includes('trek');
  return true;
}

function entryLabel(fee: number | null): { text: string; free: boolean } {
  if (fee === null) return { text: 'Entry —', free: false };
  if (fee <= 0) return { text: 'Entry Free', free: true };
  return { text: `Entry ₹${fee}`, free: false };
}

export default function SelectPlacesForTripScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const params: SelectPlacesParams = route.params || {};
  const destination = (params.destination || '').trim();
  const destLabel = formatDestinationLabel(canonicalizeDestination(destination) || destination);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [places, setPlaces] = useState<PlaceResponse[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [fillWithAi] = useState(true);

  const loadPlaces = useCallback(async () => {
    if (!destination) {
      setError('No destination was provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const destKey = canonicalizeDestination(destination) || destination;
      const label = formatDestinationLabel(destKey);
      const [byCity, bySearch] = await Promise.all([
        placesApi.list({ city: label, status: 'APPROVED', limit: 100 }),
        searchApi.search({ q: label, limit: 50, sort: 'relevance' }).catch(() => ({ data: [] as PlaceResponse[] })),
      ]);
      const cityPlaces = Array.isArray(byCity.data) ? byCity.data : [];
      const searchPlaces = Array.isArray(bySearch.data) ? bySearch.data : [];

      const belonging = dedupePlaces([...cityPlaces, ...searchPlaces]).filter(p =>
        placeBelongsToDestination(p, destKey),
      );

      const interests = (params.interests || []).map(i => i.toLowerCase());
      const promptHints = extractMustVisitHints(params.prompt, destKey).map(h => h.toLowerCase());

      const sorted = [...belonging].sort((a, b) => {
        const score = (p: PlaceResponse) => {
          let s = (p.rating || 0) * 10 + (p.reviewCount || 0) * 0.01;
          const hay = `${p.category} ${(p.tags || []).join(' ')} ${p.name}`.toLowerCase();
          if (interests.some(i => hay.includes(i) || i.split(' ').some(w => w.length > 2 && hay.includes(w)))) s += 20;
          if (promptHints.some(h => p.name.toLowerCase().includes(h) || h.includes(p.name.toLowerCase()))) s += 40;
          if ((p.city || '').toLowerCase().trim() === destKey) s += 15;
          return s;
        };
        return score(b) - score(a);
      });

      setPlaces(sorted);

      if (promptHints.length > 0 && sorted.length > 0) {
        const auto: string[] = [];
        for (const hint of promptHints) {
          const match = sorted.find(
            p => p.name.toLowerCase().includes(hint) || hint.includes(p.name.toLowerCase()),
          );
          if (match && !auto.includes(match.id)) auto.push(match.id);
        }
        if (auto.length > 0) setSelectedOrder(auto);
      }

      if (sorted.length === 0) {
        setError(`No places found for "${label}". Try another city or let AI choose.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load places. Check your connection and try again.');
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [destination, params.interests, params.prompt]);

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder]);

  const filteredPlaces = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return places.filter(p => {
      if (!matchesCategory(p, category, showMoreCategories)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q))
      );
    });
  }, [places, filter, category, showMoreCategories]);

  const toggle = (id: string) => {
    setSelectedOrder(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const selectedPlaces = useMemo(
    () => selectedOrder.map(id => places.find(p => p.id === id)).filter(Boolean) as PlaceResponse[],
    [places, selectedOrder],
  );

  const estTimeMins = useMemo(() => {
    const visit = selectedPlaces.reduce((s, p) => s + (p.estimatedDurationMinutes || 60), 0);
    const travel = selectedPlaces.length > 1 ? (selectedPlaces.length - 1) * 20 : 0;
    return visit + travel;
  }, [selectedPlaces]);

  const estTimeLabel = useMemo(() => {
    if (selectedPlaces.length === 0) return '—';
    const h = Math.floor(estTimeMins / 60);
    const m = estTimeMins % 60;
    if (h === 0) return `~${m}m`;
    return m ? `~${h}h ${m}m` : `~${h}h`;
  }, [estTimeMins, selectedPlaces.length]);

  const goGenerate = (manualPlaceIds: string[]) => {
    navigation.navigate('GenerateLoading', {
      destination,
      days: params.days,
      pace: params.pace,
      travelers: params.travelers,
      budget: params.budget,
      customBudgetAmount: params.customBudgetAmount,
      interests: params.interests,
      timePreference: params.timePreference,
      avoid: params.avoid,
      prompt: params.prompt,
      tripId: params.tripId,
      manualPlaceIds,
      fillWithAi: fillWithAi && manualPlaceIds.length > 0 ? true : undefined,
    });
  };

  const handleBuild = () => {
    if (selectedOrder.length === 0) {
      goGenerate([]);
      return;
    }
    goGenerate(selectedOrder);
  };

  const handleCategoryPress = (key: string) => {
    if (key === 'more') {
      setShowMoreCategories(v => !v);
      setCategory('more');
      return;
    }
    setCategory(key);
    if (key !== 'more') setShowMoreCategories(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Pick Places in {destLabel}</Text>
          <Text style={styles.subtitle}>Choose the spots you love and we'll build your itinerary.</Text>
        </View>
        <TouchableOpacity
          style={styles.mapViewBtn}
          onPress={() => navigation.navigate('MainTabs', { screen: 'Map' })}
        >
          <Icon name="map-outline" size={14} color={C.navy} />
          <Text style={styles.mapViewText}>Map View</Text>
        </TouchableOpacity>
      </View>

      {/* AI banner */}
      <View style={styles.aiBanner}>
        <MaterialCommunityIcons name="creation" size={18} color={C.ink} />
        <Text style={styles.aiBannerText} numberOfLines={2}>
          AI will suggest the best order, travel time, costs & daily plan.
        </Text>
        <TouchableOpacity
          hitSlop={8}
          style={styles.learnMoreBtn}
          onPress={() => Alert.alert(
            'AI Itinerary',
            'Select places you want to visit. AI will order them for less travel, estimate times and costs, and split them across your trip days.',
          )}
        >
          <Icon name="information-circle-outline" size={16} color="#B9834B" />
          <Text style={styles.learnMore}>Learn more</Text>
        </TouchableOpacity>
      </View>

      {/* Search + filters */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search places, attractions..."
            placeholderTextColor={C.textMuted}
            value={filter}
            onChangeText={setFilter}
          />
          {filter.length > 0 && (
            <TouchableOpacity onPress={() => setFilter('')}>
              <Icon name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.filterBtn}>
          <Icon name="options-outline" size={18} color={C.navy} />
          <Text style={styles.filterBtnText}>Filters</Text>
        </TouchableOpacity>
      </View>

      {/* Category chips */}
      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
        >
          {CATEGORY_CHIPS.map(chip => {
            const active = category === chip.key || (chip.key === 'more' && showMoreCategories);
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleCategoryPress(chip.key)}
                activeOpacity={0.85}
              >
                <Icon name={chip.icon} size={14} color={active ? '#FFF' : C.textSub} />
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.navy} />
          <Text style={styles.loadingText}>Finding places in {destLabel}…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 200, paddingHorizontal: H_PAD }}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {filteredPlaces.map((place, placeIdx) => {
            const selected = selectedSet.has(place.id);
            const fee = parseEntryFee(place.ticketPrice);
            const entry = entryLabel(fee);
            const img = placeImage(place);
            const duration = place.estimatedDurationMinutes || 60;

            return (
              <TouchableOpacity
                key={`${place.id}-${placeIdx}`}
                activeOpacity={0.9}
                onPress={() => toggle(place.id)}
                style={[styles.placeCard, selected && styles.placeCardSelected]}
              >
                <TouchableOpacity
                  style={[styles.checkBox, selected && styles.checkBoxOn]}
                  onPress={() => toggle(place.id)}
                >
                  {selected ? <Icon name="checkmark" size={14} color="#FFF" /> : null}
                </TouchableOpacity>

                {img ? (
                  <Image source={{ uri: img }} style={styles.placeThumb} />
                ) : (
                  <View style={[styles.placeThumb, styles.placeThumbFallback]}>
                    <Icon name="image-outline" size={20} color={C.textMuted} />
                  </View>
                )}

                <View style={styles.placeBody}>
                  <View style={styles.placeTitleRow}>
                    <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                    <Icon name={categoryIcon(place.category) as any} size={14} color={C.textSub} />
                  </View>
                  {place.rating ? (
                    <View style={styles.ratingRow}>
                      <Icon name="star" size={12} color="#FBBF24" />
                      <Text style={styles.ratingText}>
                        {place.rating.toFixed(1)} {formatReviews(place.reviewCount)}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.breadcrumb} numberOfLines={1}>
                    {formatCategory(place.category)} • {place.city || destLabel}
                  </Text>
                  {(place.shortDescription || place.description) ? (
                    <Text style={styles.placeDesc} numberOfLines={2}>
                      {place.shortDescription || place.description}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.placeMeta}>
                  <View style={styles.timeRow}>
                    <Icon name="time-outline" size={12} color={C.textSub} />
                    <Text style={styles.timeText}>{formatDuration(duration)}</Text>
                  </View>
                  <Text style={[styles.entryText, entry.free && styles.entryFree]}>{entry.text}</Text>
                  {!selected && (
                    <MaterialCommunityIcons name="drag" size={18} color={C.textMuted} style={styles.dragHandle} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.footerBar}>
          <View>
            <Text style={styles.footerCount}>{selectedOrder.length} selected</Text>
            <Text style={styles.footerTime}>Est. time: {estTimeLabel}</Text>
          </View>
          <TouchableOpacity style={styles.buildBtn} onPress={handleBuild} activeOpacity={0.88}>
            <MaterialCommunityIcons name="creation" size={16} color="#FFF" />
            <Text style={styles.buildBtnText}>Let AI build my itinerary</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontFamily: 'Inter-Medium', color: C.textSub },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: H_PAD,
    gap: 8,
    marginBottom: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  headerText: { flex: 1, minWidth: 0, paddingTop: 2 },
  title: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 12, fontFamily: 'Inter-Medium', color: C.textSub, marginTop: 4, lineHeight: 17 },
  mapViewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  mapViewText: { fontSize: 11, fontFamily: 'Inter-SemiBold', color: C.navy },

  aiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: H_PAD, marginBottom: 12,
    backgroundColor: C.banner, borderRadius: 12, borderWidth: 1, borderColor: C.bannerBorder,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  aiBannerText: { flex: 1, fontSize: 11, fontFamily: 'Inter-Medium', color: C.ink, lineHeight: 16 },
  learnMoreBtn: { alignItems: 'center' },
  learnMore: { fontSize: 10, fontFamily: 'Inter-Bold', color: '#B9834B', marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: H_PAD, marginBottom: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, borderRadius: 12, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Inter-Regular', color: C.text, paddingVertical: 0 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 44, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  filterBtnText: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: C.navy },

  chipsWrap: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 10,
  },
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    flexShrink: 0,
    alignSelf: 'center',
  },
  chipActive: { backgroundColor: C.navy, borderColor: C.navy },
  chipText: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: C.textSub, flexShrink: 0 },
  chipTextActive: { color: '#FFF' },

  list: { flex: 1 },
  errorBox: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#92400E' },

  placeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 10, marginBottom: 10,
  },
  placeCardSelected: { borderColor: 'rgba(30, 42, 58, 0.35)', backgroundColor: '#FAFBFC' },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  checkBoxOn: { backgroundColor: C.navy, borderColor: C.navy },
  placeThumb: { width: 64, height: 64, borderRadius: 10 },
  placeThumbFallback: { backgroundColor: C.chipBg, alignItems: 'center', justifyContent: 'center' },
  placeBody: { flex: 1, minWidth: 0 },
  placeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  placeName: { flex: 1, fontSize: 14, fontFamily: 'Inter-Bold', color: C.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { fontSize: 11, fontFamily: 'Inter-SemiBold', color: C.textSub },
  breadcrumb: { fontSize: 10, fontFamily: 'Inter-Medium', color: C.textMuted, marginTop: 2 },
  placeDesc: { fontSize: 11, fontFamily: 'Inter-Regular', color: C.textSub, marginTop: 4, lineHeight: 15 },
  placeMeta: { alignItems: 'flex-end', minWidth: 56, gap: 6, paddingTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText: { fontSize: 10, fontFamily: 'Inter-SemiBold', color: C.textSub },
  entryText: { fontSize: 10, fontFamily: 'Inter-Bold', color: C.textSub },
  entryFree: { color: C.green },
  dragHandle: { marginTop: 4 },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: H_PAD, paddingTop: 10,
  },
  footerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footerCount: { fontSize: 14, fontFamily: 'Inter-Bold', color: C.text },
  footerTime: { fontSize: 11, fontFamily: 'Inter-Medium', color: C.textSub, marginTop: 2 },
  buildBtn: {
    flex: 1, maxWidth: 220, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.navy, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12,
  },
  buildBtnText: { fontSize: 13, fontFamily: 'Inter-Bold', color: '#FFF' },
});
