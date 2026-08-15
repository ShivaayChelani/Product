import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  StyleSheet,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import type { TripPlan, TripPlanStop } from '../../services/api/trips';
import { computeTripBudget, formatBudgetApprox } from '../../utils/tripBudget';
import { computeTripPalPoints, formatDurationOnly, formatTravellerGroup, resolveTravellerCount } from '../../utils/tripSummary';
import {
  normalizeTripDays,
  stopListKey,
} from '../../utils/normalizeTripPlan';
import { hasValidImageUrl } from '../../utils/imageUrl';
import { useUserContext } from '../../context/UserContext';

const C = {
  bg: '#FDFCF6', // lighter warm background
  surface: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#1A0B02', // dark brown text
  text: '#2C1810',
  textSub: '#5C4033',
  textMuted: '#8B7355',
  border: '#E8DCC8',
  green: '#D1FAE5',
  greenText: '#065F46',
  goldPill: 'rgba(185,131,75,0.12)',
  goldText: '#B9834B',
  darkBrown: '#331900', // for day 1 tab and active elements
  lightBrown: '#8B5A2B',
  lineBrown: '#C19A6B',
};

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const H_PAD = 16;

export type ItineraryTab = 'itinerary' | 'map' | 'budget';

type Props = {
  trip: TripPlan;
  currentDay: number;
  onDayChange: (index: number) => void;
  activeTab: ItineraryTab;
  onTabChange: (tab: ItineraryTab) => void;
  onBack: () => void;
  onEditTrip: () => void;
  onShare: () => void;
  onReviewSave: () => void;
  onViewInsights: () => void;
  onAddDay: () => void;
  onAddPlace: () => void;
  onStopMenu: (stop: TripPlanStop) => void;
  onToggleBookmark: (stop: TripPlanStop) => void;
  onStopPress?: (stop: TripPlanStop) => void;
  onRegenerateDay?: (dayNumber: number) => void;
  onRegenerateItinerary?: () => void;
  regeneratingDay?: boolean;
  regeneratingItinerary?: boolean;
  renderMapTab?: () => React.ReactNode;
  renderBudgetTab?: () => React.ReactNode;
  reviewSaving?: boolean;
  showDestinationCard?: boolean;
  headerTitle?: string;
  primaryActionLabel?: string;
  footerNote?: string;
  showFooterOnBudget?: boolean;
  customizeMode?: boolean;
  onRemoveStop?: (stop: TripPlanStop) => void;
};

// ... Helper functions
function formatDuration(minutes?: number | null) {
  if (!minutes) return '';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h} hr`;
  }
  return `${minutes} mins`;
}

/** Prefer live destination + stop highlights; never show a stale other-city theme. */
function resolveDayTheme(
  trip: TripPlan,
  day?: { dayNumber?: number; theme?: string | null; stops?: TripPlanStop[] } | null,
): string {
  const dest = (trip.destination || 'Local').split(',')[0].trim();
  const destKey = dest.toLowerCase();
  const theme = (day?.theme || '').trim();
  const stale =
    !theme
    || /srinagar|kashmir/i.test(theme) && !/srinagar|kashmir/i.test(destKey)
    || (/arrival\s*&\s*local sightseeing/i.test(theme)
      && theme.toLowerCase().indexOf(destKey) < 0);

  if (!stale) return theme;

  const stops = day?.stops || [];
  const highlights = stops
    .map((s) => s.place?.name || s.reason)
    .filter(Boolean)
    .slice(0, 2) as string[];
  if (highlights.length >= 2) {
    const short = (n: string) => n.replace(/\b(Temple|Mandir|Fort|Falls|Palace|Museum|Ghat)\b/gi, '').trim().split(/\s+/).slice(0, 2).join(' ') || n;
    return `${short(highlights[0])} & ${dest} Highlights`;
  }
  if (highlights.length === 1) {
    return `${highlights[0]} & ${dest}`;
  }
  return `${dest} Local Sightseeing`;
}

function dayTabMetaLabel(points?: number): string {
  return points && points > 0 ? `+${points} pts` : 'No places';
}

export default function TripItineraryView({
  trip,
  currentDay,
  onDayChange,
  onBack,
  onEditTrip,
  onShare,
  onAddPlace,
  onRegenerateItinerary,
  regeneratingDay = false,
  regeneratingItinerary = false,
  showDestinationCard = true,
  customizeMode = false,
  onRemoveStop,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useUserContext();
  const isWide = width > 768;

  const days = useMemo(() => normalizeTripDays(trip.tripDays), [trip.tripDays]);
  const currentDayData = days[currentDay];
  const stops = useMemo(() => currentDayData?.stops || [], [currentDayData?.stops]);
  const palPointsSummary = useMemo(
    () => computeTripPalPoints({ ...trip, tripDays: days }),
    [trip, days],
  );
  const currentDayPoints = palPointsSummary.byDay[currentDay];
  const currentDayStopCount =
    currentDayPoints?.stopCount ?? stops.filter(s => !s.skippedAt).length;
  const currentDayPotential =
    currentDayPoints?.potentialPoints ?? currentDayStopCount * palPointsSummary.perVisitPoints;
  const travellerCount = resolveTravellerCount(trip);

  const coverImage = useMemo(() => {
    for (const day of days) {
      for (const stop of day.stops || []) {
        const img = stop.place?.thumbnail || stop.place?.images?.[0];
        if (hasValidImageUrl(img)) return img;
      }
    }
    return null; // or default background image
  }, [days]);

  const budgetSummary = useMemo(
    () => computeTripBudget({ ...trip, tripDays: days }, { travelerCity: user?.city }),
    [trip, days, user?.city],
  );

  const showAiBanner = true; // Hardcoded based on request to match screenshot

  const renderTimeline = () => (
    <View style={styles.timeline}>
      {stops.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyDayEmoji}>📅</Text>
          <Text style={styles.emptyDayTitle}>Day {currentDay + 1} is empty</Text>
          <Text style={styles.emptyDaySub}>Add places to build your itinerary for this day.</Text>
        </View>
      ) : (
        stops.map((stop, i) => {
          const img = stop.place?.thumbnail || stop.place?.images?.[0];
          const nameLower = (stop.place?.name || '').toLowerCase();
          const isLunch = nameLower.includes('lunch') || nameLower.includes('restaurant');
          const isCheckIn = nameLower.includes('check-in') || nameLower.includes('hotel') || nameLower.includes('rest');

          return (
            <View key={stopListKey(stop, i)} style={styles.timelineRow}>

              {/* Center Column: Rail */}
              <View style={styles.railCol}>
                <View style={[styles.railDot, (isLunch || isCheckIn) && styles.railDotDim]} />
                {i < stops.length - 1 && <View style={styles.railLine} />}
              </View>

              {/* Right Column: Card */}
              <View style={styles.cardCol}>
                <View style={styles.stopCard}>
                  {isCheckIn ? (
                    <View style={styles.checkinImgFallback}>
                      <Icon name="bed-outline" size={32} color="#FFF" />
                    </View>
                  ) : img ? (
                    <Image source={{ uri: img }} style={styles.stopThumb} />
                  ) : (
                    <View style={[styles.stopThumb, styles.stopThumbFallback]}>
                      <Icon name="image-outline" size={24} color={C.textMuted} />
                    </View>
                  )}

                  <View style={styles.stopBody}>
                    <View style={styles.stopTopRow}>
                      <Text style={styles.stopName} numberOfLines={1}>{stop.place?.name || 'Place'}</Text>
                      <View style={styles.stopTopActions}>
                        {customizeMode && onRemoveStop ? (
                          <TouchableOpacity
                            onPress={() => onRemoveStop(stop)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${stop.place?.name || 'place'}`}
                          >
                            <Icon name="trash-outline" size={18} color="#E05252" />
                          </TouchableOpacity>
                        ) : null}
                        {!isLunch && !isCheckIn && <Icon name="sparkles" size={14} color={C.goldText} />}
                      </View>
                    </View>
                    <Text style={styles.stopLocText}>{stop.place?.city || trip.destination || 'Nearby'}</Text>
                    <Text style={styles.stopDescText} numberOfLines={2}>
                      {stop.reason || stop.place?.description || 'Explore this stop on your itinerary.'}
                    </Text>

                    <View style={styles.stopPills}>
                      <View style={styles.pillItem}>
                        <Icon name="time-outline" size={12} color={C.ink} />
                        <Text style={styles.pillText}>{formatDuration(stop.duration) || '45 mins'}</Text>
                      </View>
                      {!stop.skippedAt ? (
                        <View style={styles.pillItem}>
                          <Icon name="star-outline" size={12} color={C.ink} />
                          <Text style={styles.pillText}>+{palPointsSummary.perVisitPoints} pts</Text>
                        </View>
                      ) : null}
                      {!isCheckIn && (
                        <View style={styles.pillItem}>
                          <Text style={styles.pillText}>Free Entry</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        })
      )}
      
      <TouchableOpacity style={styles.addPlanBtn} onPress={onAddPlace}>
        <Icon name="add" size={16} color={C.lightBrown} />
        <Text style={styles.addPlanBtnText}>Add to My Plan</Text>
      </TouchableOpacity>
      
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <TouchableOpacity
          style={styles.navBtnOutline}
          onPress={onRegenerateItinerary}
          disabled={regeneratingItinerary || regeneratingDay || !onRegenerateItinerary}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Regenerate itinerary"
        >
          {regeneratingItinerary ? (
            <ActivityIndicator size="small" color={C.goldText} />
          ) : (
            <Icon name="refresh" size={18} color={C.goldText} />
          )}
          <Text style={styles.navBtnOutlineText}>
            {regeneratingItinerary ? 'Regenerating…' : 'Regenerate'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtnFilled} onPress={onEditTrip}>
          <Icon name={customizeMode ? 'checkmark' : 'create-outline'} size={18} color="#FFF" />
          <Text style={styles.navBtnFilledText}>{customizeMode ? 'Done' : 'Customize'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        {showDestinationCard ? (
          <ImageBackground
            source={{ uri: coverImage || 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d' }}
            style={styles.heroBg}
            resizeMode="cover"
          >
            <View style={styles.heroOverlay}>
              {/* Header Buttons */}
              <View style={[styles.headerRow, { marginTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.headerBtnRound} onPress={onBack}>
                  <Icon name="arrow-back" size={20} color="#FFF" />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.headerBtnDark} onPress={onShare}>
                  <Icon name="share-social-outline" size={16} color="#FFF" />
                  <Text style={styles.headerBtnText}>Share</Text>
                </TouchableOpacity>
              </View>

              {/* Title & Info */}
              <View style={styles.heroInfo}>
                {showAiBanner && (
                  <View style={styles.aiBadge}>
                    <Icon name="sparkles" size={12} color={C.goldText} />
                    <Text style={styles.aiBadgeText}>AI RECOMMENDED</Text>
                  </View>
                )}
                <Text style={styles.heroTitle}>{trip.title || `${trip.destination || 'Trip'} Escape`} <Text style={{ color: C.goldText }}>✨</Text></Text>
                <View style={styles.heroLocRow}>
                  <Icon name="location" size={14} color={C.goldText} />
                  <Text style={styles.heroLocText}>{trip.destination || 'Your destination'}</Text>
                </View>

                {/* Stats Row */}
                <View style={styles.heroStatsGrid}>
                  <View style={styles.heroStatItem}>
                    <Icon name="calendar-outline" size={20} color={C.goldText} style={styles.heroStatIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroStatVal}>{formatDurationOnly(trip)}</Text>
                      <Text style={styles.heroStatLbl}>Trip Duration</Text>
                    </View>
                  </View>
                  
                  <View style={styles.heroStatItem}>
                    <Icon name="people-outline" size={20} color={C.goldText} style={styles.heroStatIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroStatVal}>{travellerCount} Traveller{travellerCount !== 1 ? 's' : ''}</Text>
                      <Text style={styles.heroStatLbl}>{formatTravellerGroup(trip.travelers)}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.heroStatItem}>
                    <Icon name="wallet-outline" size={20} color={C.goldText} style={styles.heroStatIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroStatVal}>
                        {budgetSummary.grandTotal > 0 ? formatBudgetApprox(budgetSummary.grandTotal) : 'No cost yet'}
                      </Text>
                      <Text style={styles.heroStatLbl}>{budgetSummary.scopeLabel}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.heroStatItem}>
                    <View style={styles.starCircle}>
                      <Icon name="star" size={12} color={C.darkBrown} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroStatVal}>+{palPointsSummary.totalPotential}</Text>
                      <Text style={styles.heroStatLbl}>Potential PalPoints</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ImageBackground>
        ) : (
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
             <TouchableOpacity style={styles.headerBtnRound} onPress={onBack}>
                <Icon name="arrow-back" size={20} color={C.ink} />
             </TouchableOpacity>
          </View>
        )}

        {/* Main Sheet Container */}
        <View style={styles.mainSheet}>
          <View style={styles.tabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
              {days.map((day, i) => {
                const active = currentDay === i;
                const dayPoints = palPointsSummary.byDay[i];
                return (
                  <TouchableOpacity key={i} style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={() => onDayChange(i)}>
                      <Text style={[styles.tabDayText, active && styles.tabDayTextActive]}>DAY {day.dayNumber}</Text>
                      <Text style={[styles.tabDateText, active && styles.tabDateTextActive]}>{dayTabMetaLabel(dayPoints?.potentialPoints)}</Text>
                  </TouchableOpacity>
                );
              })}
              
              <View style={styles.progressTabDivider} />
              
              <View style={styles.progressTab}>
                <Text style={styles.progressTabTitle}>Trip Progress</Text>
                <Text style={styles.progressTabText}>{currentDay + 1} / {days.length} Days</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${((currentDay + 1)/days.length)*100}%`}]} />
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Two Column Layout Wrapper */}
          <View style={[styles.contentWrapper, isWide && styles.contentWrapperWide]}>
            
            {/* Left: Timeline Area */}
            <View style={styles.timelineColMain}>
              {/* Day Header */}
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleWrap}>
                  <Text style={styles.dayTitle}>Day {currentDayData?.dayNumber || 1}  •  {resolveDayTheme(trip, currentDayData)}</Text>
                  <Text style={styles.dayPointsText}>
                    Earn +{currentDayPotential} PalPoints today
                    {currentDayStopCount ? ` (${currentDayStopCount} places × ${palPointsSummary.perVisitPoints})` : ''}
                  </Text>
                </View>
                <View style={styles.weatherBtn}>
                  <Icon name="sunny-outline" size={16} color={C.goldText} />
                  <Text style={styles.weatherBtnText}>20°C</Text>
                  <Icon name="chevron-down" size={14} color={C.text} />
                </View>
              </View>

              {renderTimeline()}
            </View>


          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  header: { paddingBottom: 16 },

  // Hero Section
  heroBg: {
    height: 380, // slightly taller to go under the sheet
    justifyContent: 'flex-start',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)', // dark overlay for text readability
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    gap: 8,
  },
  headerBtnRound: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerBtnDark: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8,
  },
  headerBtnText: { color: '#FFF', fontSize: 13, fontFamily: 'Inter-SemiBold' },
  
  heroInfo: {
    paddingHorizontal: H_PAD,
    paddingTop: 30,
  },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(51,25,0,0.6)', // dark brown semi transparent
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, alignSelf: 'flex-start',
    marginBottom: 8, borderWidth: 1, borderColor: C.goldText,
  },
  aiBadgeText: { fontSize: 10, fontFamily: 'Inter-Bold', color: '#FFF' },
  heroTitle: { fontSize: 32, fontFamily: serif, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  heroLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  heroLocText: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#FFF' },
  
  heroStatsGrid: {
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'space-between',
    rowGap: 16,
    paddingTop: 8,
  },
  heroStatItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    width: '48%', 
  },
  heroStatIcon: { opacity: 0.9 },
  starCircle: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: C.goldText,
    alignItems: 'center', justifyContent: 'center',
  },
  heroStatVal: { fontSize: 12, fontFamily: 'Inter-Bold', color: '#FFF' },
  heroStatLbl: { fontSize: 10, fontFamily: 'Inter-Medium', color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // Main Sheet
  mainSheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -40, // overlap hero
    paddingTop: 20,
    minHeight: 600,
  },
  tabsWrapper: {
    paddingHorizontal: H_PAD,
  },
  tabsContainer: {
    gap: 0,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 6,
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center',
  },
  tabBtn: {
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', borderRadius: 12,
  },
  tabBtnActive: { backgroundColor: C.darkBrown },
  tabDayText: { fontSize: 12, fontFamily: 'Inter-Bold', color: C.ink },
  tabDayTextActive: { color: '#FFF' },
  tabDateText: { fontSize: 10, fontFamily: 'Inter-Medium', color: C.textSub, marginTop: 4 },
  tabDateTextActive: { color: 'rgba(255,255,255,0.8)' },
  
  progressTabDivider: { width: 1, height: 30, backgroundColor: C.border, marginHorizontal: 12 },
  progressTab: { paddingHorizontal: 8, justifyContent: 'center' },
  progressTabTitle: { fontSize: 12, fontFamily: 'Inter-Bold', color: C.ink },
  progressTabText: { fontSize: 10, fontFamily: 'Inter-Medium', color: C.textSub, marginTop: 2, marginBottom: 4 },
  progressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, width: 80 },
  progressFill: { height: 4, backgroundColor: C.goldText, borderRadius: 2 },

  contentWrapper: { flexDirection: 'column' },
  contentWrapperWide: { flexDirection: 'row', paddingHorizontal: H_PAD },

  timelineColMain: { flex: 1 },
  rewardColMain: { width: '100%', paddingHorizontal: H_PAD, marginTop: 20, paddingBottom: 20 },

  // Day Header
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: H_PAD, marginTop: 24, marginBottom: 20,
  },
  dayTitleWrap: { flex: 1, paddingRight: 8 },
  dayTitle: { fontSize: 16, fontFamily: serif, fontWeight: '700', color: C.ink },
  dayPointsText: { fontSize: 11, fontFamily: 'Inter-SemiBold', color: C.goldText, marginTop: 4 },
  weatherBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  weatherBtnText: { fontSize: 12, fontFamily: 'Inter-Bold', color: C.text },

  // Timeline
  timeline: { paddingHorizontal: H_PAD },
  timelineRow: { flexDirection: 'row', minHeight: 120 },
  
  railCol: { width: 30, alignItems: 'center' },
  railDot: {
    width: 14, height: 14, borderRadius: 7, 
    borderWidth: 2, borderColor: C.goldText, backgroundColor: C.bg,
    marginTop: 18, zIndex: 1,
  },
  railDotDim: { borderColor: C.textMuted },
  railLine: {
    width: 1.5, flex: 1, backgroundColor: C.border,
    marginTop: -8, marginBottom: -18,
  },
  
  cardCol: { flex: 1, paddingBottom: 16 },
  stopCard: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: C.border,
    gap: 12,
  },
  stopThumb: { width: 90, minHeight: 110, borderRadius: 12, alignSelf: 'stretch' },
  stopThumbFallback: { 
    width: 90, minHeight: 110, borderRadius: 12, 
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch'
  },
  checkinImgFallback: {
    width: 90, minHeight: 110, borderRadius: 12, backgroundColor: C.darkBrown,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch'
  },
  
  stopBody: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  stopTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 },
  stopTopActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopName: { fontSize: 15, fontFamily: 'Inter-Medium', color: C.ink, flex: 1 },
  stopLocText: { fontSize: 12, fontFamily: 'Inter-Medium', color: C.ink, marginTop: 2, marginBottom: 4 },
  stopDescText: { fontSize: 11, fontFamily: 'Inter-Regular', color: C.textSub, lineHeight: 16, marginBottom: 8 },
  
  stopPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pillItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.bg, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
  },
  pillText: { fontSize: 10, fontFamily: 'Inter-Medium', color: C.ink },

  addPlanBtn: {
    marginVertical: 10, paddingVertical: 14,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  addPlanBtnText: { fontSize: 14, fontFamily: 'Inter-Bold', color: C.lightBrown },

  emptyDay: { paddingVertical: 40, alignItems: 'center' },
  emptyDayEmoji: { fontSize: 32, marginBottom: 12 },
  emptyDayTitle: { fontSize: 16, fontFamily: serif, fontWeight: '700', color: C.ink, marginBottom: 4 },
  emptyDaySub: { fontSize: 12, fontFamily: 'Inter-Medium', color: C.textSub },


  // Inline Footer Actions
  navBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: C.goldText, backgroundColor: C.surface,
    paddingVertical: 14, borderRadius: 12,
  },
  navBtnOutlineText: { fontSize: 14, fontFamily: 'Inter-Bold', color: C.goldText },
  
  navBtnFilled: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.lightBrown,
    paddingVertical: 14, borderRadius: 12,
  },
  navBtnFilledText: { fontSize: 14, fontFamily: 'Inter-Bold', color: '#FFF' },
});
