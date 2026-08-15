import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Modal, Alert, Share, Image, Linking, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Pal from '../design/DesignSystem';
import { GradientButton } from '../components/ui/GradientButton';
import { tripsApi, TripPlan, TripPlanStop, TripProgressResponse, TravelPace, BudgetTier, AvoidOption } from '../services/api/trips';
import { buildTripExportText } from '../utils/tripExport';
import { buildTripShareUrl } from '../services/sharing/shareLinks';
import { useToast } from '../context/ToastContext';
import TripItineraryView, { ItineraryTab } from '../components/trip/TripItineraryView';
import { normalizeTripDays, normalizeTripPlan, stopListKey } from '../utils/normalizeTripPlan';
import { loadDraftSnapshot } from '../utils/quickAddPlace';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { AiRefineModal } from '../components/trips/AiRefineModal';

const _transportEmojis: Record<string, string> = {
  WALKING: '🚶', BIKE: '🚲', CAR: '🚗', TRAIN: '🚆', FLIGHT: '✈️',
};
const _timeEmojis: Record<string, string> = {
  sunrise: '🌄', morning: '🌅', afternoon: '☀️', evening: '🌆', sunset: '🌅', night: '🌙',
};

export default function TripDetailScreen({
  tripId,
  warnings: _initialWarnings,
  note: _initialNote,
  resume = false,
  onNavigate,
}: {
  tripId: string;
  warnings?: string[];
  note?: string;
  resume?: boolean;
  onNavigate?: (screen: string, params?: any) => void;
}) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [trip, setTrip] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [currentDay, setCurrentDay] = useState(0);
  const [activeTab, setActiveTab] = useState<ItineraryTab>('itinerary');
  const [_optimizing, setOptimizing] = useState(false);
  const [noteModal, setNoteModal] = useState<{ stop: TripPlanStop; text: string } | null>(null);
  const [_progress, setProgress] = useState<TripProgressResponse | null>(null);
  const [_activeStopId, setActiveStopId] = useState<string | null>(null);
  const [refineModalVisible, setRefineModalVisible] = useState(false);
  const [refining, setRefining] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingDay, setRegeneratingDay] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const resumeHandledRef = useRef(false);
  const { showSuccess, showError } = useToast();

  const fetchTrip = useCallback(async () => {
    setLoadFailed(false);
    try {
      const tripData = await tripsApi.getById(tripId);
      setTrip(normalizeTripPlan(tripData));
    } catch (err: any) {
      const snapshot = await loadDraftSnapshot();
      if (snapshot && snapshot.id === tripId) {
        setTrip(snapshot);
      } else {
        setTrip(null);
        setLoadFailed(true);
        showError(err?.message || 'Could not load trip itinerary');
      }
    } finally {
      setLoading(false);
    }
  }, [tripId, showError]);

  const fetchProgress = useCallback(async () => {
    try {
      const p = await tripsApi.getProgress(tripId);
      setProgress(p);
      if (p.currentDayIndex != null) setCurrentDay(p.currentDayIndex);
      if (p.currentStop?.id) setActiveStopId(p.currentStop.id);
    } catch { }
  }, [tripId]);

  const skipNextFocusRefetchRef = useRef(true);

  useEffect(() => {
    fetchTrip();
    if (trip?.status === 'ACTIVE') fetchProgress();
  }, [fetchTrip, fetchProgress, trip?.status]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefetchRef.current) {
        skipNextFocusRefetchRef.current = false;
        return;
      }
      fetchTrip();
    }, [fetchTrip]),
  );

  const handleStartTrip = async () => {
    setStarting(true);
    try {
      const updatedTrip = await tripsApi.startTrip(tripId);
      setTrip(normalizeTripPlan(updatedTrip));
      setActiveStopId(updatedTrip.tripDays?.[0]?.stops?.[0]?.id || null);
      showSuccess('Trip started! Follow your itinerary and verify places with GPS.');
      fetchProgress();
    } catch (err: any) {
      showError(err?.message || 'Failed to start trip');
    }
    setStarting(false);
  };

  useEffect(() => {
    if (!resume || !trip || resumeHandledRef.current) return;
    if (trip.status === 'UPCOMING') {
      resumeHandledRef.current = true;
      void handleStartTrip();
      return;
    }
    if (trip.status === 'ACTIVE') {
      resumeHandledRef.current = true;
      void fetchProgress();
    }
  }, [resume, trip, fetchProgress]);

  const handleCompleteTrip = () => {
    Alert.alert('Complete Trip', 'Mark this trip as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', style: 'destructive', onPress: async () => {
        try {
          const updatedTrip = await tripsApi.completeTrip(tripId);
          setTrip(normalizeTripPlan(updatedTrip as any));
          setProgress(null);
          setActiveStopId(null);
          showSuccess('Trip completed! Great journey!');
        } catch (err: any) {
          showError(err?.message || 'Failed to complete trip');
        }
      }},
    ]);
  };

  const handleVisitStop = async (stopId: string) => {
    try {
      const { Geolocation } = require('react-native-geolocation-service');
      const position: any = await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });
      const result = await tripsApi.visitStop(stopId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      });
      fetchProgress();
      fetchTrip();
      const pts = result?.checkpointReward?.awarded ? result.checkpointReward.points : 0;
      const bonus = result?.completionBonus?.awarded ? result.completionBonus.points : 0;
      if (result?.alreadyVerified) {
        showSuccess('Checkpoint already verified');
      } else if (pts || bonus) {
        showSuccess(
          `Checkpoint verified!${pts ? ` +${pts} PalPoints` : ''}${bonus ? ` · +${bonus} completion bonus` : ''}`,
        );
      } else {
        showSuccess('Checkpoint verified!');
      }
    } catch (err: any) {
      const code = err?.code;
      const msg = String(err?.message || '');
      if (code === 1 || /permission/i.test(msg)) {
        Alert.alert(
          'Location required',
          'Location permission is required to verify this visit.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      showError(msg || 'Failed to verify checkpoint. Check GPS permission and try again.');
    }
  };

  const handleSkipStop = async (stopId: string) => {
    try {
      await tripsApi.skipStop(stopId);
      fetchProgress();
      fetchTrip();
      showSuccess('Stop skipped');
    } catch (err: any) {
      showError(err?.message || 'Failed to skip stop');
    }
  };

  const handleShareTrip = async () => {
    try {
      if (!trip) return;
      const url = buildTripShareUrl(trip.id);
      const exportText = buildTripExportText(trip);
      const message = url ? `${exportText}\n${url}` : exportText;
      await Share.share({
        message,
        title: `${trip.title || trip.destination} — PalSafar Itinerary`,
      });
    } catch { }
  };

  const handleExportTrip = async () => {
    if (!trip) return;
    try {
      const url = buildTripShareUrl(trip.id);
      const exportText = buildTripExportText(trip);
      await Share.share({
        message: url ? `${exportText}\n${url}` : exportText,
        title: `Export: ${trip.destination}`,
      });
    } catch (err: any) {
      showError(err?.message || 'Could not export itinerary');
    }
  };

  const handleRegenerateDay = async (dayNumber: number) => {
    if (!trip) return;
    Alert.alert(
      `Regenerate Day ${dayNumber}`,
      'Locked (pinned) stops stay. Other stops on this day will be replaced with verified places from our database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          onPress: async () => {
            setRegeneratingDay(true);
            try {
              const result = await tripsApi.regenerateDay(trip.id, dayNumber, {
                destination: trip.destination || trip.title,
                days: trip.days,
                pace: trip.pace,
                travelers: (trip.travelers as any) || 'SOLO',
                budget: (trip.budget as BudgetTier) || 'MEDIUM',
                interests: trip.interests || [],
                transportation: trip.transportation || ['CAR'],
                avoid: trip.avoid || [],
                prompt: trip.aiPrompt || undefined,
                refresh: true,
                variationSeed: Date.now() % 97 + 1,
              });
              setTrip(normalizeTripPlan(result.trip));
              showSuccess(`Day ${dayNumber} regenerated!`);
            } catch (err: any) {
              showError(err?.message || 'Failed to regenerate day');
            } finally {
              setRegeneratingDay(false);
            }
          },
        },
      ],
    );
  };

  const handleTogglePin = async (stop: TripPlanStop) => {
    try {
      await tripsApi.toggleStopPin(stop.id, !stop.isPinned);
      fetchTrip();
      showSuccess(stop.isPinned ? 'Stop unlocked' : 'Stop locked — kept when regenerating');
    } catch (err: any) {
      showError(err?.message || 'Failed to update lock');
    }
  };

  const handleReplaceStop = (stop: TripPlanStop) => {
    onNavigate?.('Search', {
      mode: 'replace',
      stopId: stop.id,
      destination: trip?.destination,
      excludePlaceIds: trip?.tripDays?.flatMap(d => d.stops.map(s => s.placeId)) || [],
    });
  };

  const handleOpenPlace = (stop: TripPlanStop) => {
    onNavigate?.('SpotDetail', { spotId: stop.place?.slug || stop.placeId });
  };

  const handleNavigateStop = (stop: TripPlanStop) => {
    const lat = stop.place?.latitude;
    const lng = stop.place?.longitude;
    if (lat == null || lng == null) {
      showError('No coordinates for this place');
      return;
    }
    const url = `https://maps.google.com/?daddr=${lat},${lng}&q=${encodeURIComponent(stop.place?.name || '')}`;
    import('react-native').then(({ Linking }) => Linking.openURL(url));
  };

  const _handleGenerateItinerary = async () => {
    setOptimizing(true);
    try {
      const tripData = await tripsApi.generateItinerary(tripId, { pace: 'moderate' });
      setTrip(normalizeTripPlan(tripData));
      showSuccess('Itinerary generated successfully!');
    } catch (err: any) {
      showError(err?.message || 'Failed to generate itinerary');
    }
    setOptimizing(false);
  };

  const openRefineModal = () => {
    if (!trip) return;
    setRefineModalVisible(true);
  };

  const handleRegenerateFullItinerary = async () => {
    if (!trip || regenerating || refining) return;
    setRegenerating(true);
    try {
      const prevSeed = Number((trip.aiPreferences as { variationSeed?: number } | null)?.variationSeed) || 0;
      const result = await tripsApi.aiGenerate({
        tripId: trip.id,
        destination: trip.destination || trip.title,
        days: trip.days,
        pace: trip.pace || 'BALANCED',
        travelers: (trip.travelers as any) || 'SOLO',
        budget: (trip.budget as BudgetTier) || 'MEDIUM',
        interests: trip.interests || [],
        transportation: trip.transportation || ['CAR'],
        fillWithAi: true,
        refresh: true,
        variationSeed: prevSeed + 1,
        prompt: [trip.aiPrompt, `#refresh-${Date.now()}`].filter(Boolean).join('\n'),
        avoid: trip.avoid || [],
      });
      if (result?.trip) {
        setTrip(normalizeTripPlan(result.trip));
      }
      const fresh = await tripsApi.getById(trip.id);
      setTrip(normalizeTripPlan(fresh));
      showSuccess('New itinerary ready');
    } catch (err: any) {
      showError(err?.message || 'Failed to regenerate itinerary');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAiRefine = async (pace: TravelPace, budget: BudgetTier, avoid: AvoidOption[], notes: string) => {
    if (!trip || refining || regenerating) return;
    setRefining(true);
    try {
      const result = await tripsApi.aiGenerate({
        tripId: trip.id,
        destination: trip.destination || trip.title,
        days: trip.days,
        pace,
        travelers: (trip.travelers as any) || 'SOLO',
        budget,
        interests: trip.interests || [],
        transportation: trip.transportation || ['CAR'],
        timePreference: trip.timePreference || undefined,
        avoid,
        prompt: notes || trip.aiPrompt || undefined,
        fillWithAi: true,
        refresh: true,
        variationSeed: (Number((trip.aiPreferences as { variationSeed?: number } | null)?.variationSeed) || 0) + 1,
      });
      setTrip(normalizeTripPlan(result.trip));
      setRefineModalVisible(false);
      showSuccess('Itinerary refined with AI!');
    } catch (err: any) {
      showError(err?.message || 'Failed to refine itinerary');
    }
    setRefining(false);
  };

  const handleRemoveStop = (stopId: string) => {
    Alert.alert('Remove Stop', 'Remove this stop from the itinerary?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await tripsApi.deleteStop(stopId);
          fetchTrip();
          showSuccess('Stop removed from itinerary');
        } catch (err: any) {
          showError(err?.message || 'Failed to remove stop');
        }
      }},
    ]);
  };

  const handleSaveNotes = async () => {
    if (!noteModal) return;
    try {
      await tripsApi.updateStop(noteModal.stop.id, { notes: noteModal.text });
      setNoteModal(null);
      fetchTrip();
      showSuccess('Notes saved successfully');
    } catch (err: any) {
      showError(err?.message || 'Failed to save notes');
    }
  };

  const handleReviewSave = async () => {
    try {
      const updated = await tripsApi.update(tripId, { status: 'UPCOMING' });
      setTrip(normalizeTripPlan(updated));
      showSuccess('Trip saved! Ready for your journey.');
      onNavigate?.('MainTabs', { screen: 'Itinerary' });
    } catch (err: any) {
      showError(err?.message || 'Failed to save trip');
    }
  };

  const handleTripMenu = () => {
    Alert.alert('Trip options', undefined, [
      ...(trip?.status !== 'ACTIVE' && trip?.status !== 'COMPLETED'
        ? [{ text: starting ? 'Starting…' : 'Start itinerary (GPS)', onPress: () => { void handleStartTrip(); } }]
        : []),
      ...(trip?.status === 'ACTIVE'
        ? [{ text: 'Complete itinerary', onPress: handleCompleteTrip }]
        : []),
      { text: 'Share / Export', onPress: handleExportTrip },
      { text: 'AI refine (all days)', onPress: openRefineModal },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleStopMenu = (stop: TripPlanStop) => {
    const dayNum = trip?.tripDays?.find(d => d.stops.some(s => s.id === stop.id))?.dayNumber;
    Alert.alert(stop.place?.name || 'Stop', undefined, [
      { text: 'Open place', onPress: () => handleOpenPlace(stop) },
      { text: 'Navigate', onPress: () => handleNavigateStop(stop) },
      { text: stop.isPinned ? 'Unlock stop' : 'Lock stop', onPress: () => handleTogglePin(stop) },
      { text: 'Replace attraction', onPress: () => handleReplaceStop(stop) },
      ...(dayNum ? [{ text: `Regenerate Day ${dayNum}`, onPress: () => handleRegenerateDay(dayNum) }] : []),
      ...(trip?.status === 'ACTIVE'
        ? [
            { text: 'Verify with GPS', onPress: () => handleVisitStop(stop.id) },
            { text: 'Skip stop', onPress: () => handleSkipStop(stop.id) },
          ]
        : [
            { text: 'Add notes', onPress: () => setNoteModal({ stop, text: stop.notes || '' }) },
            { text: 'Remove', style: 'destructive' as const, onPress: () => handleRemoveStop(stop.id) },
          ]),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(contentPadBottom, 20) }}>
        
        {/* Map Illustration Header */}
        <View style={{ alignItems: 'center', marginBottom: 24, marginTop: -40 }}>
          <Image 
            source={require('../assets/explore_map.png')} 
            style={{ width: 220, height: 160, resizeMode: 'contain', opacity: 0.9 }} 
          />
        </View>

        {/* Logo and Tagline */}
        <View style={{ alignItems: 'center', marginBottom: 36 }}>
          <Image 
            source={require('../assets/logo.png')} 
            style={{ width: 140, height: 140, resizeMode: 'contain' }} 
          />
          <Text style={{ fontSize: 13, color: '#8B7355', marginTop: 8, letterSpacing: 0.3, fontWeight: '500' }}>
            Explore • Experience • Memories
          </Text>
        </View>

        {/* Loading Indicator */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <ActivityIndicator size="large" color="#B9834B" style={{ transform: [{ scale: 1.2 }], marginBottom: 20 }} />
          <Text style={{ color: '#2D1B0B', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Loading itinerary...
          </Text>
          <Text style={{ color: '#8B7355', fontSize: 14 }}>
            Crafting your perfect journey
          </Text>
        </View>

        {/* Stepper Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 16, 
          padding: 20, 
          width: '100%', 
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          shadowColor: '#2D1B0B',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 2,
          marginBottom: 40
        }}>
          {/* Step 1 */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5EFE6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="search-outline" size={20} color="#4B3621" />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B3621', textAlign: 'center' }}>Discovering</Text>
            <Text style={{ fontSize: 11, color: '#8B7355', textAlign: 'center' }}>places</Text>
          </View>
          
          <View style={{ flex: 0.5, height: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#DDD2C4', textAlign: 'center', letterSpacing: 2 }}>......</Text>
          </View>

          {/* Step 2 */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5EFE6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="map-outline" size={20} color="#4B3621" />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B3621', textAlign: 'center' }}>Planning</Text>
            <Text style={{ fontSize: 11, color: '#8B7355', textAlign: 'center' }}>route</Text>
          </View>

          <View style={{ flex: 0.5, height: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#DDD2C4', textAlign: 'center', letterSpacing: 2 }}>......</Text>
          </View>

          {/* Step 3 */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5EFE6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="calendar-outline" size={20} color="#4B3621" />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B3621', textAlign: 'center' }}>Organizing</Text>
            <Text style={{ fontSize: 11, color: '#8B7355', textAlign: 'center' }}>itinerary</Text>
          </View>

          <View style={{ flex: 0.5, height: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#DDD2C4', textAlign: 'center', letterSpacing: 2 }}>......</Text>
          </View>

          {/* Step 4 */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5EFE6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="checkmark-circle-outline" size={22} color="#4B3621" />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B3621', textAlign: 'center' }}>Almost</Text>
            <Text style={{ fontSize: 11, color: '#8B7355', textAlign: 'center' }}>ready</Text>
          </View>
        </View>

        {/* Footer Message */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
          <Text style={{ color: '#C5A059', fontSize: 14, marginRight: 6, marginTop: 2 }}>✨</Text>
          <Text style={{ color: '#8B7355', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
            Sit back and relax, we're building{'\n'}an amazing trip for you!
          </Text>
        </View>

      </View>
    );
  }

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: Pal.colors.light.background, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 40, paddingTop: Math.max(insets.top, 40), paddingBottom: Math.max(contentPadBottom, 40) }}>
        <Text style={{ fontSize: 56 }}>🗺️</Text>
        <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 18, color: Pal.colors.light.text, textAlign: 'center' }}>
          {loadFailed ? 'Trip No Longer Available' : 'Itinerary Unavailable'}
        </Text>
        <Text style={{ color: Pal.colors.light.textMuted, fontSize: 13, textAlign: 'center' }}>
          {loadFailed
            ? 'This trip may have been deleted. Go back to My Trips and choose another trip.'
            : 'Could not load this itinerary right now. Please check your connection and try again.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <GradientButton title="Go Back" onPress={() => onNavigate?.('goBack')} size="sm" />
          <TouchableOpacity
            onPress={() => { setLoading(true); fetchTrip(); }}
            style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: Pal.colors.light.primary, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontFamily: Pal.typography.fontFamily.semibold, fontSize: 13 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const days = normalizeTripDays(trip.tripDays);
  const currentDayData = days[currentDay];
  const stops = currentDayData?.stops || [];

  const mapTabContent = (
    <View style={{ marginHorizontal: Pal.spacing[5], marginBottom: Pal.spacing[5] }}>
      <View style={{ minHeight: 280, borderRadius: 16, backgroundColor: Pal.colors.light.surface, borderWidth: 1, borderColor: Pal.colors.light.border, padding: 16 }}>
        <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 15, color: Pal.colors.light.text, marginBottom: 12 }}>
          Route — Day {currentDay + 1}
        </Text>
        {stops.map((stop, i) => (
          <View key={stopListKey(stop, i)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Pal.colors.light.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontFamily: Pal.typography.fontFamily.bold }}>{i + 1}</Text>
            </View>
            <Text style={{ marginLeft: 8, fontSize: 12, color: Pal.colors.light.text, flex: 1 }} numberOfLines={1}>{stop.place.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingBottom: contentPadBottom }}>
      <TripItineraryView
        trip={trip}
        currentDay={currentDay}
        onDayChange={setCurrentDay}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={() => onNavigate?.('goBack')}
        onEditTrip={() => setCustomizing(c => !c)}
        customizeMode={customizing}
        onRemoveStop={stop => handleRemoveStop(stop.id)}
        onShare={handleExportTrip}
        onReviewSave={handleReviewSave}
        onViewInsights={openRefineModal}
        onAddDay={() => Alert.alert('Add Day', 'Day management will be available in a future update.')}
        onAddPlace={() => onNavigate?.('MainTabs', { screen: 'Map' })}
        onStopMenu={handleStopMenu}
        onToggleBookmark={() => showSuccess('Saved to bookmarks')}
        onStopPress={handleOpenPlace}
        onRegenerateDay={handleRegenerateDay}
        onRegenerateItinerary={handleRegenerateFullItinerary}
        regeneratingDay={regeneratingDay}
        regeneratingItinerary={regenerating}
        renderMapTab={() => mapTabContent}
      />

      <Modal visible={!!noteModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Pal.colors.light.surface, borderTopLeftRadius: Pal.borderRadius['2xl'], borderTopRightRadius: Pal.borderRadius['2xl'], padding: Pal.spacing[5], paddingBottom: Pal.spacing[10], gap: Pal.spacing[4] }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Pal.colors.light.border, alignSelf: 'center', marginBottom: 4 }} />
            <Text style={{ fontFamily: Pal.typography.fontFamily.semibold, fontSize: 17, color: Pal.colors.light.text }}>
              Notes — {noteModal?.stop.place.name}
            </Text>
            <TextInput
              style={{
                minHeight: 120, borderWidth: 1, borderColor: Pal.colors.light.border, borderRadius: Pal.borderRadius.lg,
                padding: Pal.spacing[4], color: Pal.colors.light.text, fontSize: 14,
                textAlignVertical: 'top', backgroundColor: Pal.colors.light.surfaceSoft,
              }}
              value={noteModal?.text || ''}
              onChangeText={(text) => setNoteModal(prev => prev ? { ...prev, text } : null)}
              placeholder="Add notes, tips, or reminders..."
              placeholderTextColor={Pal.colors.light.textMuted}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setNoteModal(null)} style={{ flex: 1, height: 44, borderRadius: Pal.borderRadius.full, backgroundColor: Pal.colors.light.surface, borderWidth: 1, borderColor: Pal.colors.light.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: Pal.colors.light.text, fontFamily: Pal.typography.fontFamily.semibold, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveNotes} style={{ flex: 1, height: 44, borderRadius: Pal.borderRadius.full, backgroundColor: Pal.colors.light.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontFamily: Pal.typography.fontFamily.semibold, fontSize: 13 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AiRefineModal 
        visible={refineModalVisible}
        onClose={() => setRefineModalVisible(false)}
        refining={refining}
        onRefine={handleAiRefine}
        paddingBottom={contentPadBottom}
        initialPace={trip?.pace || 'BALANCED'}
        initialBudget={(trip?.budget as BudgetTier) || 'MEDIUM'}
        initialAvoid={trip?.avoid || []}
        initialNotes=""
      />
      <BottomNavigation activeTab="trips" />
    </View>
  );
}
