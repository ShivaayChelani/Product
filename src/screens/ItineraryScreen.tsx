import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, StatusBar, ImageBackground, Platform, Linking, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Pal from '../design/DesignSystem';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useUserContext } from '../context/UserContext';
import { TouristSpot, UserProfile } from '../types';
import { generateItinerarySchedule } from '../utils/itinerary';
import { INDIA_OVERVIEW } from '../utils/mapMarkerUtils';
import { tripsApi, TripPlan, TripPlanStop } from '../services/api/trips';

import ItinerarySummaryCard from '../components/ItinerarySummaryCard';
import ItineraryTimeline from '../components/ItineraryTimeline';
import { LinearGradient } from '../utils/LinearGradient';
import { useBottomSafePadding } from '../design/responsive';

function stopToTouristSpot(stop: TripPlanStop, dayNumber: number): TouristSpot {
  const place = stop.place;
  return {
    id: stop.id || `${place.slug}-${dayNumber}-${stop.order}`,
    name: place.name,
    city: place.city || '',
    state: place.state || '',
    latitude: place.latitude || 0,
    longitude: place.longitude || 0,
    category: (place.category || 'monument') as TouristSpot['category'],
    difficulty: 'medium',
    imageUrl: place.thumbnail || place.images?.[0],
    description: place.description,
    tags: place.tags || [],
    rating: place.rating || 0,
    reviewCount: place.reviewCount || 0,
    estimatedDuration: stop.duration || 60,
    entryFee: stop.entryFee ?? undefined,
    bestTimeToVisit: (place.bestTimeToVisit as any)?.label?.toLowerCase?.() || 'any',
    points: 10,
    dayNumber,
  } as TouristSpot;
}

interface ItineraryScreenProps {
  user?: UserProfile;
  places?: TouristSpot[];
  position?: { latitude: number; longitude: number } | null;
  addedPlaceId?: string;
  onBack?: () => void;
  onSelectSpot?: (spot: { id: string }) => void;
  onNavigateToMap?: () => void;
  onCompleteStop?: (spotId: string, pts: number) => void;
  onRemoveStop?: (spotId: string) => void;
}

export default function ItineraryScreen(props: ItineraryScreenProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { user: ctxUser, setUser, isGuest } = useUserContext();
  const startTripBottomPad = useBottomSafePadding(20);

  const user = props.user || ctxUser;

  const [pace, setPace] = useState<'relaxed' | 'moderate' | 'fast'>('moderate');
  const [draftTrip, setDraftTrip] = useState<TripPlan | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);

  const loadDraftTrip = useCallback(async () => {
    if (isGuest) {
      setLoadingTrip(false);
      return;
    }
    setLoadingTrip(true);
    try {
      const list = await tripsApi.list({ status: 'DRAFT', limit: 1 });
      const draftId = list.data?.[0]?.id;
      setDraftTrip(draftId ? await tripsApi.getById(draftId) : null);
    } catch (err) {
    } finally {
      setLoadingTrip(false);
    }
  }, [isGuest]);

  useFocusEffect(
    useCallback(() => {
      loadDraftTrip();
    }, [loadDraftTrip])
  );

  const position = useMemo(
    () => props.position || { latitude: INDIA_OVERVIEW.lat, longitude: INDIA_OVERVIEW.lng },
    [props.position],
  );

  // Maps TouristSpot.id (the place slug) back to its server TripPlanStop id for mutations.
  const stopIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    if (draftTrip) {
      for (const day of draftTrip.tripDays) {
        for (const stop of day.stops) {
          const spotId = stop.id || `${stop.place.slug}-${day.dayNumber}-${stop.order}`;
          map.set(spotId, stop.id);
        }
      }
    }
    return map;
  }, [draftTrip]);

  const itinerarySpots = useMemo(() => {
    if (!draftTrip) return [];
    const out: TouristSpot[] = [];
    for (const day of [...draftTrip.tripDays].sort((a, b) => a.dayNumber - b.dayNumber)) {
      for (const stop of [...day.stops].sort((a, b) => a.order - b.order)) {
        out.push(stopToTouristSpot(stop, day.dayNumber));
      }
    }
    return out;
  }, [draftTrip]);

  const handleCompleteStop = props.onCompleteStop;
  const handleRemoveStop = props.onRemoveStop;

  const scheduledSpots = useMemo(() => generateItinerarySchedule(itinerarySpots, position, pace), [itinerarySpots, position, pace]);
  const completedStops = user.completedItineraryStops || [];
  const totalDuration = scheduledSpots.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0);
  const estimatedCost = itinerarySpots.reduce((sum, s) => sum + (s.entryFee ?? s.averageCost ?? 0), 0);
  const totalPoints = itinerarySpots.reduce((sum, s) => sum + (s.points || 0), 0);

  const handleToggleComplete = (spotId: string) => {
    if (handleCompleteStop) {
      handleCompleteStop(spotId, 10);
    } else {
      setUser(prev => ({
        ...prev,
        completedItineraryStops: [...(prev.completedItineraryStops || []), spotId],
      }));
    }
  };

  const handleRemove = (spotId: string) => {
    Alert.alert(
      'Remove Stop',
      'Remove this spot from your itinerary?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          if (handleRemoveStop) {
            handleRemoveStop(spotId);
            return;
          }
          const stopId = stopIdBySlug.get(spotId);
          if (!stopId) return;
          try {
            await tripsApi.deleteStop(stopId);
            setDraftTrip(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                tripDays: prev.tripDays.map(d => ({ ...d, stops: d.stops.filter(s => s.id !== stopId) })),
              };
            });
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Could not remove this stop.');
          }
        }},
      ]
    );
  };

  const handleNavigate = (spot: TouristSpot) => {
    const daddr = spot.latitude + ',' + spot.longitude;
    const label = encodeURIComponent(spot.name);
    if (Platform.OS === 'ios') {
      Linking.openURL('maps://app?daddr=' + daddr + '&q=' + label).catch(() =>
        Linking.openURL('https://maps.google.com/?daddr=' + daddr + '&q=' + label)
      );
    } else {
      Linking.openURL('https://maps.google.com/?daddr=' + daddr + '&q=' + label);
    }
  };

  const handleViewDetails = (spot: TouristSpot) => {
    if (props.onSelectSpot) {
      props.onSelectSpot({ id: spot.id });
    } else {
      navigation.navigate('SpotDetail', { spotId: spot.id });
    }
  };

  if (loadingTrip) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Pal.colors.light.primary} />
      </View>
    );
  }

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Icon name="lock-closed-outline" size={80} color={theme.textMuted} style={{ marginBottom: 20, opacity: 0.5 }} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Sign In Required</Text>
        <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Sign in to build and save your itinerary across devices.</Text>
        <TouchableOpacity style={styles.exploreBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Map' })}>
          <Text style={styles.exploreBtnText}>Explore Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (itinerarySpots.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Icon name="map-outline" size={80} color={theme.textMuted} style={{ marginBottom: 20, opacity: 0.5 }} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Your Trip is Empty</Text>
        <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Add places from the map to build your perfect trip.</Text>
        <TouchableOpacity style={styles.exploreBtn} onPress={() => navigation.navigate('MainTabs', { screen: 'Map' })}>
          <Text style={styles.exploreBtnText}>Explore Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <View style={styles.vpHeader}>
        <ImageBackground source={require('../assets/generate_plan_bg.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover">
          <LinearGradient
            colors={['rgba(10,37,64,0.3)', 'rgba(10,37,64,0.85)']}
            locations={[0.2, 1]}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>

        <View style={styles.vpDecorCircle} pointerEvents="none" />
        <View style={styles.vpDecorPin} pointerEvents="none">
          <Icon name="location" size={20} color="#fff" />
        </View>

        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }}>
          <View style={styles.vpHeaderRow}>
            <TouchableOpacity style={styles.vpBackBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Icon name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.vpHeaderTitle}>Optimized Itinerary</Text>
            <TouchableOpacity style={styles.vpHeaderCompass} onPress={() => navigation.navigate('MainTabs', { screen: 'Map' })} activeOpacity={0.8}>
              <Icon name="compass" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.vpHeaderContent}>
          <View style={styles.vpHeaderStats}>
            <View style={styles.vpStatItem}>
              <Text style={styles.vpStatValue}>{itinerarySpots.length}</Text>
              <Text style={styles.vpStatLabel}>Places</Text>
            </View>
            <View style={styles.vpStatItem}>
              <Text style={styles.vpStatValue}>{Math.floor(totalDuration / 60)}h</Text>
              <Text style={styles.vpStatLabel}>Duration</Text>
            </View>
            <View style={styles.vpStatItem}>
              <Text style={styles.vpStatValue}>{completedStops.length}</Text>
              <Text style={styles.vpStatLabel}>Done</Text>
            </View>
            <View style={styles.vpStatItem}>
              <Text style={styles.vpStatValue}>{totalPoints}</Text>
              <Text style={styles.vpStatLabel}>Points</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
        <ItinerarySummaryCard 
          totalSpots={itinerarySpots.length} 
          totalDuration={totalDuration} 
          estimatedCost={estimatedCost} 
          totalPoints={totalPoints} 
          completedCount={completedStops.length} 
          pace={pace} 
          onPaceChange={setPace} 
        />
        
        <View style={styles.scheduleHeader}>
          <Icon name="calendar" size={18} color={Pal.colors.light.primary} />
          <Text style={[styles.scheduleTitle, { color: theme.text }]}>Schedule</Text>
          <View style={[styles.scheduleBadge, { borderColor: theme.accent + '30', backgroundColor: theme.surface }]}>
            <Icon name="speedometer-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.scheduleBadgeText, { color: theme.textSecondary }]}>  {pace === 'relaxed' ? 'Relaxed' : pace === 'fast' ? 'Fast' : 'Moderate'}</Text>
          </View>
        </View>

        <ItineraryTimeline
          scheduledSpots={scheduledSpots}
          completedStops={completedStops}
          onNavigate={handleNavigate}
          onViewDetails={handleViewDetails}
          onRemove={handleRemove}
          onToggleComplete={handleToggleComplete}
        />
      </ScrollView>

      <View style={[styles.startTripBar, { paddingBottom: startTripBottomPad }]}>
        <TouchableOpacity
          onPress={() => {
            if (scheduledSpots.length > 0) {
              const firstSpot = scheduledSpots[0].spot;
              if (firstSpot.latitude && firstSpot.longitude) {
                const lat = firstSpot.latitude;
                const lng = firstSpot.longitude;
                const label = firstSpot.name || 'First Stop';
                const url = Platform.select({
                  ios: `maps:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`,
                  android: `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`,
                  default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                });
                if (url) {
                  Linking.openURL(url).catch(() => {
                    Alert.alert('Error', 'Could not open maps application.');
                  });
                }
              } else {
                Alert.alert('Directions', 'Coordinates not available for the first destination.');
              }
            } else {
              Alert.alert('Itinerary Empty', 'Add some places to your itinerary to start the journey.');
            }
          }}
          style={styles.startTripBtn}
        >
          <Icon name="play" size={18} color="#FFF" />
          <Text style={styles.startTripText}>Start Journey</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentContainer: { paddingBottom: 130 },
  
  emptyTitle: { fontSize: 24, fontFamily: 'Inter-Black', marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: 'Inter-Medium', textAlign: 'center', marginBottom: 32, paddingHorizontal: 40 },
  exploreBtn: { backgroundColor: '#63300E', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 24 },
  exploreBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-Bold' },

  vpHeader: { height: 260, width: '100%', position: 'relative' },
  vpHeaderContent: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 24, paddingHorizontal: 20 },
  vpHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingTop: Platform.OS === 'ios' ? 56 : 48, paddingHorizontal: 20 },
  vpBackBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  vpHeaderTitle: { fontSize: 22, fontFamily: 'Inter-Black', color: '#fff', letterSpacing: -0.5 },
  vpHeaderCompass: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  vpHeaderStats: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  vpStatItem: { flex: 1, alignItems: 'center' },
  vpStatValue: { fontSize: 20, fontFamily: 'Inter-Black', color: Pal.colors.light.primary, letterSpacing: -0.5 },
  vpStatLabel: { fontSize: 10, fontFamily: 'Inter-Bold', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 3 },
  vpDecorPin: { position: 'absolute', top: 130, left: 24, zIndex: 2, opacity: 0.1 },
  vpDecorCircle: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', top: -40, right: -40, zIndex: 1 },
  
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14, gap: 8 },
  scheduleTitle: { fontSize: 18, fontFamily: 'Inter-Black', flex: 1, letterSpacing: -0.4 },
  scheduleBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  scheduleBadgeText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },

  startTripBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', padding: 20, paddingTop: 16, paddingBottom: 0, borderTopWidth: 1, borderColor: 'rgba(200, 155, 60, 0.15)', elevation: 20, shadowColor: 'rgba(185,131,75,0.25)', shadowOffset: {width: 0, height: -10}, shadowOpacity: 0.2, shadowRadius: 20 },
  startTripBtn: { backgroundColor: '#63300E', height: 56, borderRadius: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, shadowColor: '#63300E', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  startTripText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-Bold' },
});
