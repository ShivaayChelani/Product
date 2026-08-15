import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  StatusBar,
  ImageBackground,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { DEV_FLAGS } from '../config/devFlags';
import { useUserContext } from '../context/UserContext';
import { tripsApi } from '../services/api/trips';
import { BottomNavigation, BOTTOM_NAV_CLEARANCE } from '../components/navigation/BottomNavigation';
import { useLocationContext } from '../context/LocationContext';
import { formatDestinationLabel, canonicalizeDestination } from '../utils/destination';
import { buildTripPrompt, buildLocalTripPlan, applyAiPlanToLocalItinerary } from '../utils/tripPlanner';
import { getPlaces } from '../services/placesService';
import type { TouristSpot } from '../types';
import type { Travelers } from '../services/api/trips';
import { useAiPlannerStore } from '../features/aiTripPlanner/store';
import { pushDestinationHistory } from '../features/aiTripPlanner/destinationHistory';
import { useDestinationAutocomplete } from '../features/aiTripPlanner/hooks/useDestinationAutocomplete';
import {
  BUDGETS,
  COMPANIONS,
  DAY_OPTIONS,
  selectExactTripDays,
  HERO_IMAGE,
  INTERESTS,
  MAX_INTERESTS,
  PROMPT_MAX,
  QUICK_SUGGESTIONS,
  TRAVEL_STYLES,
  budgetSliderPosition,
  budgetTierFromSliderPosition,
  buildAiBudgetPayload,
  estimateBudgetRange,
  formatInr,
  getDayBucketLabel,
  isDayBucketActive,
} from '../features/aiTripPlanner/constants';
import { BudgetRangeSlider } from '../features/aiTripPlanner/BudgetRangeSlider';
import { PalPointsIcon } from '../components/PalPointsIcon';

const COLORS = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  gold: '#B9834B',
  goldLight: '#FFF9F0',
  border: '#E8DFD0',
  textPrimary: '#2D1B0B',
  textSecondary: '#8B7355',
  textMuted: '#A89478',
  black: '#1A1A1A',
  green: '#3D6B4F',
};

type CompanionUiKey = Travelers | 'GROUP';

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function SectionHeader({ number, icon, title }: { number: string; icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.numberCircle}>
        <Text style={styles.numberCircleText}>{number}</Text>
      </View>
      <Icon name={icon} size={16} color={COLORS.gold} style={styles.sectionIcon} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SelectBox({
  label,
  sub,
  icon,
  active,
  onPress,
  wide,
  compact,
}: {
  label: string;
  sub?: string;
  icon?: string;
  active: boolean;
  onPress: () => void;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.selectBox,
        wide && styles.selectBoxWide,
        compact && styles.selectBoxCompact,
        active && styles.selectBoxActive,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {active ? (
        <View style={styles.checkBadge}>
          <Icon name="checkmark" size={9} color="#FFF" />
        </View>
      ) : null}
      {icon ? <Icon name={icon} size={compact ? 16 : 18} color={COLORS.gold} style={{ marginBottom: 4 }} /> : null}
      <Text style={[styles.selectBoxLabel, active && styles.selectBoxLabelActive]} numberOfLines={2}>
        {label}
      </Text>
      {sub ? (
        <Text style={[styles.selectBoxSub, active && styles.selectBoxSubActive]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function InterestTile({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.interestTile, active && styles.interestTileActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Icon name={icon} size={16} color={COLORS.gold} />
      <Text style={[styles.interestTileText, active && styles.interestTileTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {active ? (
        <View style={styles.interestCheck}>
          <Icon name="checkmark" size={8} color="#FFF" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function paceToTravelStyleId(pace: string): string {
  const match = TRAVEL_STYLES.find(s => s.pace === pace);
  return match?.id ?? 'sightseeing';
}

function companionToUiKey(companion: Travelers): CompanionUiKey {
  return companion;
}

export default function AITripPlannerScreen({
  onNavigate,
}: {
  onNavigate?: (screen: string, params?: Record<string, unknown>) => void;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isGuest, setUser, user } = useUserContext();
  const { effectivePosition } = useLocationContext();

  const store = useAiPlannerStore();
  const {
    destination,
    customPrompt,
    selectedInterests,
    selectedPace,
    selectedCompanions,
    selectedBudget,
    selectedTransportation,
    days,
    setDestination,
    setCustomPrompt,
    toggleInterest,
    setPace,
    setCompanions,
    setBudget,
    validate,
    persistDraft,
    loadDraft,
  } = store;

  const handleSetDays = (d: number) => {
    useAiPlannerStore.setState({ days: selectExactTripDays(d), isDirty: true });
  };

  const [places, setPlaces] = useState<TouristSpot[]>([]);
  const [generating, setGenerating] = useState(false);
  const [focusDestination, setFocusDestination] = useState(false);
  const [locating, setLocating] = useState(false);
  const [travelStyleId, setTravelStyleId] = useState(() => paceToTravelStyleId(selectedPace));
  const [companionUi, setCompanionUi] = useState<CompanionUiKey>(() => companionToUiKey(selectedCompanions));
  const userEditedDestination = useRef(false);
  const gpsPrefillAttempted = useRef(false);

  const palPoints = user?.totalPoints ?? 0;
  const sliderPos = budgetSliderPosition(selectedBudget);

  const { suggestions, loading: suggestLoading, clear: clearSuggestions } = useDestinationAutocomplete(
    focusDestination ? destination : '',
  );

  const nav = useCallback(
    (screen: string, params?: Record<string, unknown>) => {
      if (onNavigate) onNavigate(screen, params);
      else navigation.navigate(screen, params);
    },
    [onNavigate, navigation],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadDraft();
      if (cancelled) return;
      getPlaces().then(setPlaces).catch(() => setPlaces([]));

      const state = useAiPlannerStore.getState();
      setTravelStyleId(paceToTravelStyleId(state.selectedPace));
      setCompanionUi(companionToUiKey(state.selectedCompanions));

      if (userEditedDestination.current || gpsPrefillAttempted.current) return;
      if (state.destination.trim()) return;
      if (!effectivePosition?.latitude) return;

      gpsPrefillAttempted.current = true;
      const label = await reverseGeocode(effectivePosition.latitude, effectivePosition.longitude);
      if (
        !cancelled &&
        label &&
        !userEditedDestination.current &&
        !useAiPlannerStore.getState().destination.trim()
      ) {
        setDestination(label);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDraft, effectivePosition?.latitude, effectivePosition?.longitude, setDestination]);

  const canGenerate = useMemo(() => {
    return (
      destination.trim().length > 0 &&
      selectedInterests.length > 0 &&
      !!selectedPace &&
      !!selectedCompanions &&
      !!selectedBudget
    );
  }, [destination, selectedInterests, selectedPace, selectedCompanions, selectedBudget]);

  const budgetEstimate = useMemo(
    () => estimateBudgetRange(selectedBudget, days),
    [selectedBudget, days],
  );

  const resolveLocation = useCallback(() => {
    const typed = destination.trim();
    if (typed) {
      return formatDestinationLabel(canonicalizeDestination(typed) || typed);
    }
    return '';
  }, [destination]);

  const onGenerate = async () => {
    if (!validate()) {
      if (!destination.trim()) Alert.alert('Missing Info', 'Please enter a destination.');
      else if (selectedInterests.length === 0) Alert.alert('Missing Info', 'Please select at least one interest.');
      return;
    }
    if (isGuest && DEV_FLAGS.USE_SERVER_API) {
      Alert.alert('Sign In Required', 'Sign in to generate and save your AI itinerary.');
      return;
    }

    const location = resolveLocation();
    if (!location) return;

    await pushDestinationHistory(location);
    await persistDraft();

    const promptParts = [customPrompt.trim()];
    if (effectivePosition?.latitude != null) {
      promptParts.push(
        `Traveler context: coordinates ${effectivePosition.latitude.toFixed(4)}, ${effectivePosition.longitude?.toFixed(4)}.`,
      );
    }
    const prompt =
      promptParts.filter(Boolean).join('\n') ||
      buildTripPrompt({
        location,
        days,
        pace: selectedPace,
        interests: selectedInterests,
      });

    if (DEV_FLAGS.USE_SERVER_API) {
      setGenerating(true);
      nav('GenerateLoading', {
        destination: location,
        days,
        pace: selectedPace,
        travelers: selectedCompanions,
        ...buildAiBudgetPayload(selectedBudget),
        interests: selectedInterests,
        transportation: selectedTransportation,
        prompt,
      });
      setGenerating(false);
      return;
    }

    setGenerating(true);
    try {
      const plan = buildLocalTripPlan({
        location,
        days,
        pace: selectedPace,
        interests: selectedInterests,
        places,
      });
      applyAiPlanToLocalItinerary(plan, setUser, location);
      nav('ItineraryScreen');
    } finally {
      setGenerating(false);
    }
  };

  const handleDestinationChange = useCallback(
    (text: string) => {
      userEditedDestination.current = true;
      setDestination(text);
    },
    [setDestination],
  );

  const pickSuggestion = (suggestion: { fullLabel?: string; label: string }) => {
    userEditedDestination.current = true;
    setDestination(suggestion.fullLabel || suggestion.label);
    clearSuggestions();
    Keyboard.dismiss();
    setFocusDestination(false);
  };

  const handleUseCurrentLocation = async () => {
    if (!effectivePosition?.latitude) {
      Alert.alert('Location unavailable', 'Enable location access to use your current city.');
      return;
    }
    setLocating(true);
    try {
      const label = await reverseGeocode(effectivePosition.latitude, effectivePosition.longitude);
      if (label) {
        userEditedDestination.current = true;
        setDestination(label);
        clearSuggestions();
        Keyboard.dismiss();
      } else {
        Alert.alert('Location unavailable', 'Could not detect your city. Try searching manually.');
      }
    } finally {
      setLocating(false);
    }
  };

  const handleCompanionSelect = (key: CompanionUiKey) => {
    setCompanionUi(key);
    setCompanions(key === 'GROUP' ? 'FRIENDS' : key);
  };

  const handleTravelStyleSelect = (id: string, pace: typeof selectedPace) => {
    setTravelStyleId(id);
    setPace(pace);
  };

  const appendQuickSuggestion = (text: string) => {
    const trimmed = customPrompt.trim();
    const next = trimmed ? `${trimmed}. ${text}` : text;
    setCustomPrompt(next.slice(0, PROMPT_MAX));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 + BOTTOM_NAV_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.heroWrap, { paddingTop: insets.top + 6 }]}>
          <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.heroBg} imageStyle={styles.heroBgImage}>
            <View style={styles.heroOverlay} />
          </ImageBackground>

          <View style={styles.handleBar} />

          <View style={styles.topBar}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} hitSlop={12}>
              <Icon name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View style={styles.palPointsPill}>
              <PalPointsIcon size={13} />
              <Text style={styles.palPointsText}>{palPoints.toLocaleString('en-IN')} PalPoints</Text>
            </View>
          </View>

          <View style={styles.pageTitleContainer}>
            <Text style={styles.pageTitle}>
              AI Trip Planner <Text style={styles.sparkle}>✨</Text>
            </Text>
            <Text style={styles.pageSubtitle}>
              Answer a few questions and let AI craft your perfect itinerary ✨
            </Text>
          </View>
        </View>

        <View style={styles.cardsWrapper}>
          <SectionCard>
            <SectionHeader number="01" icon="location-outline" title="Choose your destination" />
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Icon name="search-outline" size={15} color={COLORS.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchTextInput}
                  placeholder="Search destination..."
                  placeholderTextColor={COLORS.textMuted}
                  value={destination}
                  onChangeText={handleDestinationChange}
                  onFocus={() => setFocusDestination(true)}
                  onBlur={() => setTimeout(() => setFocusDestination(false), 200)}
                />
              </View>
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={handleUseCurrentLocation}
                disabled={locating}
                activeOpacity={0.85}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={COLORS.gold} />
                ) : (
                  <>
                    <Icon name="locate-outline" size={14} color={COLORS.gold} />
                    <Text style={styles.locationBtnText}>Use Current{'\n'}Location</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {focusDestination && (suggestions.length > 0 || suggestLoading) ? (
              <View style={styles.suggestBox}>
                {suggestLoading ? (
                  <ActivityIndicator color={COLORS.gold} style={{ padding: 8 }} />
                ) : (
                  suggestions.map(s => (
                    <TouchableOpacity key={s.id} style={styles.suggestRow} onPress={() => pickSuggestion(s)}>
                      <Text style={styles.suggestText}>{s.label}</Text>
                      {!!s.sub && s.sub !== 'City' ? (
                        <Text style={styles.suggestSub}>{s.sub}</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}
          </SectionCard>

          <SectionCard>
            <SectionHeader number="02" icon="calendar-outline" title="No. of days" />
            <View style={styles.gridWrap}>
              {DAY_OPTIONS.map(opt => (
                <SelectBox
                  key={opt.label}
                  label={opt.label}
                  active={isDayBucketActive(days, opt.val)}
                  onPress={() => handleSetDays(opt.val)}
                  wide
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard>
            <SectionHeader number="02" icon="people-outline" title="Travelling with" />
            <View style={styles.companionRow}>
              {COMPANIONS.map(opt => (
                <SelectBox
                  key={opt.key}
                  label={opt.label}
                  icon={opt.icon}
                  active={companionUi === opt.key}
                  onPress={() => handleCompanionSelect(opt.key)}
                  compact
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard>
            <SectionHeader number="03" icon="briefcase-outline" title="Travell style" />
            <View style={styles.gridWrap}>
              {TRAVEL_STYLES.map(opt => (
                <SelectBox
                  key={opt.id}
                  label={opt.label}
                  sub={opt.sub}
                  icon={opt.icon}
                  active={travelStyleId === opt.id}
                  onPress={() => handleTravelStyleSelect(opt.id, opt.pace)}
                  wide
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard>
            <SectionHeader number="05" icon="star-outline" title="Your interests" />
            <View style={styles.interestGrid}>
              {INTERESTS.map(opt => (
                <InterestTile
                  key={opt.value}
                  label={opt.label}
                  icon={opt.icon}
                  active={selectedInterests.includes(opt.value)}
                  onPress={() => toggleInterest(opt.value)}
                />
              ))}
            </View>
            <Text
              style={[
                styles.interestCount,
                selectedInterests.length >= MAX_INTERESTS && styles.interestCountFull,
              ]}
            >
              Selected {selectedInterests.length}/{MAX_INTERESTS}
            </Text>
          </SectionCard>

          <SectionCard>
            <SectionHeader number="06" icon="wallet-outline" title="Budget" />
            <View style={styles.budgetRow}>
              {BUDGETS.map(opt => {
                const active = selectedBudget === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.budgetCard, active && styles.budgetCardActive]}
                    onPress={() => {
                      setBudget(opt.key);
                      void persistDraft();
                    }}
                    activeOpacity={0.85}
                  >
                    {active ? (
                      <View style={styles.checkBadge}>
                        <Icon name="checkmark" size={9} color="#FFF" />
                      </View>
                    ) : null}
                    <Text style={[styles.budgetCardTitle, active && styles.budgetCardTitleActive]}>{opt.label}</Text>
                    <Text style={styles.budgetCardSub}>{opt.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.budgetEstimateText}>
              {formatInr(budgetEstimate.min)} – {formatInr(budgetEstimate.max)}{' '}
              <Text style={styles.budgetEstimateSubInline}>for {getDayBucketLabel(days)} trip</Text>
            </Text>

            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>₹5,000</Text>
              <Text style={styles.sliderLabelText}>₹50,000+</Text>
            </View>
            <BudgetRangeSlider
              position={sliderPos}
              onSelectPosition={(pos) => setBudget(budgetTierFromSliderPosition(pos))}
              onSelectEnd={() => {
                void persistDraft();
              }}
              trackStyle={styles.sliderTrack}
              fillStyle={styles.sliderFill}
              thumbStyle={styles.sliderThumb}
            />
          </SectionCard>

          <SectionCard>
            <SectionHeader number="07" icon="chatbubble-outline" title="Others (Optional)" />
            <View style={styles.textareaWrap}>
              <TextInput
                style={styles.textarea}
                placeholder="E.g. I love hidden places, avoid crowded areas, want sunset points, travelling with kids, etc."
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={PROMPT_MAX}
                value={customPrompt}
                onChangeText={setCustomPrompt}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>
                {customPrompt.length}/{PROMPT_MAX}
              </Text>
            </View>

            <Text style={styles.quickLabel}>Quick Suggestions</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickScroll}>
              {QUICK_SUGGESTIONS.map(text => (
                <TouchableOpacity
                  key={text}
                  style={styles.quickChip}
                  onPress={() => appendQuickSuggestion(text)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.quickChipText}>{text}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SectionCard>
        </View>

        <View style={styles.generateWrap}>
          <TouchableOpacity
            style={[styles.generateBtn, !canGenerate && styles.generateBtnDisabled]}
            onPress={onGenerate}
            disabled={!canGenerate || generating}
            activeOpacity={0.9}
          >
            <View style={styles.generateDecor} pointerEvents="none">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <View key={i} style={[styles.generateDot, { left: `${12 + i * 10}%` }]} />
              ))}
              <Icon name="airplane" size={13} color={COLORS.gold} style={styles.generatePlane} />
            </View>
            {generating ? (
              <ActivityIndicator color={COLORS.gold} />
            ) : (
              <Text style={styles.generateBtnText}>
                Generate My AI Trip <Text style={styles.sparkle}>✨</Text>
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.privacyRow}>
          <Icon name="shield-checkmark-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.privacyText}>
            Your preferences are safe with us and used only to personalize your trip.
          </Text>
        </View>
      </ScrollView>
      <BottomNavigation activeTab="trips" />
    </View>
  );
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' } },
    );
    const data = await response.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.county || '';
    const state = addr.state || '';
    if (!city) return null;
    return state ? `${city}, ${state}` : city;
  } catch {
    return null;
  }
}

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  heroWrap: {
    position: 'relative',
    marginBottom: 6,
    overflow: 'hidden',
  },
  heroBg: {
    ...StyleSheet.absoluteFillObject,
    height: 200,
  },
  heroBgImage: {
    resizeMode: 'cover',
    opacity: 0.35,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(253, 251, 247, 0.55)',
  },
  handleBar: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9CFC0',
    marginBottom: 10,
    zIndex: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 2,
    marginBottom: 10,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  palPointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FDECBF',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E8D4A0',
  },
  palPointsText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  pageTitleContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  sparkle: {
    color: COLORS.gold,
  },
  pageSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardsWrapper: {
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#2D1B0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  numberCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  numberCircleText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: serif,
  },
  sectionIcon: {
    marginRight: 6,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: serif,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 12,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 44,
    backgroundColor: '#FFF',
  },
  searchIcon: {
    marginRight: 6,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  locationBtn: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: '#FFF',
  },
  locationBtnText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 12,
    marginTop: 2,
  },
  suggestBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 10,
    maxHeight: 120,
    overflow: 'hidden',
  },
  suggestRow: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  suggestText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  suggestSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  companionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  selectBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 44,
  },
  selectBoxWide: {
    width: '48%',
  },
  selectBoxCompact: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    paddingVertical: 8,
  },
  selectBoxActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldLight,
  },
  selectBoxLabel: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectBoxLabelActive: {
    color: COLORS.gold,
  },
  selectBoxSub: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  selectBoxSubActive: {
    color: COLORS.gold,
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
    zIndex: 1,
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  interestTile: {
    width: '23%',
    minHeight: 58,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    position: 'relative',
  },
  interestTileActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldLight,
  },
  interestTileText: {
    fontSize: 8,
    color: COLORS.textPrimary,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  interestTileTextActive: {
    color: COLORS.gold,
  },
  interestCheck: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestCount: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  interestCountFull: {
    color: COLORS.green,
  },
  budgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  budgetCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
    position: 'relative',
  },
  budgetCardActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldLight,
  },
  budgetCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  budgetCardTitleActive: {
    color: COLORS.gold,
  },
  budgetCardSub: {
    fontSize: 9,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 3,
  },
  budgetEstimateText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: serif,
    marginBottom: 8,
  },
  budgetEstimateSubInline: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sliderLabelText: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F0E6D8',
    position: 'relative',
    marginBottom: 4,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.gold,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.gold,
    borderWidth: 2,
    borderColor: '#FFF',
    marginLeft: -7,
  },
  textareaWrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FFF',
    minHeight: 96,
  },
  textarea: {
    minHeight: 72,
    fontSize: 12,
    color: COLORS.textPrimary,
    padding: 0,
    lineHeight: 18,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  quickScroll: {
    gap: 8,
    paddingRight: 4,
  },
  quickChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFF',
  },
  quickChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  generateWrap: {
    marginHorizontal: 16,
    marginTop: 18,
  },
  generateBtn: {
    backgroundColor: COLORS.black,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 52,
  },
  generateBtnDisabled: {
    opacity: 0.55,
  },
  generateDecor: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  generateDot: {
    position: 'absolute',
    bottom: 10,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.gold,
    opacity: 0.45,
  },
  generatePlane: {
    position: 'absolute',
    right: 18,
    bottom: 14,
    transform: [{ rotate: '-25deg' }],
    opacity: 0.85,
  },
  generateBtnText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: serif,
    zIndex: 1,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 15,
  },
});
