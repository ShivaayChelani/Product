import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Alert,
  Share,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useUserContext } from '../context/UserContext';
import { DEV_FLAGS } from '../config/devFlags';
import { TripPlan, tripsApi } from '../services/api/trips';
import { clearDraftTripCache } from '../utils/quickAddPlace';
import { navigateRoot } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/types';
import {
  resolveContinueNavigation,
  resolveItineraryNavigation,
  resolveManualBuildNavigation,
} from '../utils/tripNavigation';
import { buildTripShareMessage } from '../services/sharing/shareLinks';
import { useToast } from '../context/ToastContext';
import { useMyTripsData } from '../features/myTrips/hooks/useMyTripsData';
import { getUnreadBadgeCount, subscribeUnreadBadge } from '../services/notifications/notificationBadgeStore';
import { refreshUnreadBadgeCount } from '../services/notificationService';
import { getMainTabBarClearance } from '../design/tabBarLayout';
import {
  estimateTripPalPoints,
  filterTripsByTab,
  resolveTripOriginDisplay,
  tripLocationsLabel,
} from '../features/myTrips/utils/tripFormatting';
import { computeTripBudget, formatBudgetApprox } from '../utils/tripBudget';
import { resolveTravellerCount, resolveTripDayCount } from '../utils/tripSummary';
import { TripEmptySection } from '../features/myTrips/components/TripEmptySection';

import { TripsTitleRow } from '../components/trips/TripsTitleRow';
import { FilterTabs, TabOption } from '../components/trips/FilterTabs';
import { TripCard } from '../components/trips/TripCard';
import { NextAdventureSection } from '../components/trips/NextAdventureSection';
import { TripsHorizontalCarousel } from '../components/trips/TripsHorizontalCarousel';
import { TripOptionsModal } from '../components/trips/TripOptionsModal';
import { TripDeleteConfirmModal } from '../components/trips/TripDeleteConfirmModal';

import { TripsColors as COLORS } from '../components/trips/tripsTheme';

export default function MyTripsScreen({
  onNavigate,
  initialTab = 'UPCOMING',
}: {
  onNavigate?: (screen: string, params?: any) => void;
  initialTab?: TabOption;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isGuest, user } = useUserContext();
  const { showSuccess, showError } = useToast();
  const apiEnabled = !isGuest && DEV_FLAGS.USE_SERVER_API;
  const { trips, isLoading, refresh } = useMyTripsData(apiEnabled);

  const [activeTab, setActiveTab] = useState<TabOption>(initialTab);
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());
  const [selectedTripForOptions, setSelectedTripForOptions] = useState<TripPlan | null>(null);
  const [tripToDelete, setTripToDelete] = useState<TripPlan | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const tabClearance = getMainTabBarClearance(insets.bottom);

  useEffect(() => {
    return subscribeUnreadBadge((count) => {
      setUnreadCount(count);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (apiEnabled) void refreshUnreadBadgeCount();
      void refresh();
    }, [apiEnabled, refresh]),
  );

  const filteredTrips = useMemo(
    () => filterTripsByTab(trips, activeTab),
    [trips, activeTab],
  );

  const requireAuth = useCallback(
    (message: string) => {
      if (!isGuest) return true;
      Alert.alert('Sign In Required', message);
      return false;
    },
    [isGuest],
  );

  const navigateTo = useCallback(
    (screen: string, params?: any) => {
      if (onNavigate) {
        onNavigate(screen, params);
        return;
      }
      if (screen === 'goBack') {
        navigation.goBack();
        return;
      }
      if (screen === 'MainTabs') {
        navigation.navigate('MainTabs', params);
        return;
      }
      navigateRoot(screen as keyof RootStackParamList, params);
    },
    [onNavigate, navigation],
  );

  const handleCreateTrip = () => {
    if (!requireAuth('Sign in to create and save trips.')) return;
    const target = resolveManualBuildNavigation();
    navigateTo(target.screen, target.params);
  };

  const handleOpenTrip = useCallback(
    (trip: TripPlan) => {
      const target = resolveItineraryNavigation(trip);
      navigateTo(target.screen, target.params);
    },
    [navigateTo],
  );

  const handleResumeTrip = useCallback(
    (trip: TripPlan) => {
      const target = resolveContinueNavigation(trip);
      navigateTo(target.screen, target.params);
    },
    [navigateTo],
  );

  const handleDelete = useCallback((trip: TripPlan) => {
    setTripToDelete(trip);
  }, []);

  const performDelete = useCallback(
    async (trip: TripPlan) => {
      try {
        setIsDeleting(true);
        try {
          await tripsApi.delete(trip.id);
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status !== 404) {
            showError((err as { message?: string })?.message || 'Delete failed');
            return;
          }
        }
        await clearDraftTripCache(trip.id);
        showSuccess('Trip deleted');
        setTripToDelete(null);
        await refresh();
      } catch (err: unknown) {
        showError((err as { message?: string })?.message || 'Delete failed');
      } finally {
        setIsDeleting(false);
      }
    },
    [refresh, showError, showSuccess],
  );

  const handleShareTrip = useCallback(async (trip: TripPlan) => {
    const message = buildTripShareMessage(trip);
    if (!message) {
      Alert.alert('Unavailable', 'This trip cannot be shared.');
      return;
    }
    try {
      await Share.share({
        message,
        title: 'PalSafar Trip',
      });
    } catch {
      /* user dismissed */
    }
  }, []);

  const handleTripMenu = useCallback(
    (trip: TripPlan) => {
      if (!requireAuth('Sign in to manage trips.')) return;
      setSelectedTripForOptions(trip);
    },
    [requireAuth],
  );

  const renderTripCard = useCallback(
    (trip: TripPlan) => {
      const palPoints = estimateTripPalPoints(trip);
      const travellerCount = resolveTravellerCount(trip);
      const budget = computeTripBudget(trip, { travelerCity: user?.city });
      const hasStops = trip.tripDays?.some(d => (d.stops?.length ?? 0) > 0) ?? false;
      const showResume =
        activeTab === 'UPCOMING' ||
        trip.status === 'ACTIVE' ||
        (trip.status === 'DRAFT' && hasStops);
      const origin = resolveTripOriginDisplay(trip.generationSource);

      return (
        <TripCard
          id={trip.id}
          title={trip.title || 'Untitled Trip'}
          palPoints={palPoints}
          budgetStr={budget.grandTotal > 0 ? `${formatBudgetApprox(budget.grandTotal)}` : undefined}
          datesStr=""
          daysCount={resolveTripDayCount(trip)}
          locationsStr={tripLocationsLabel(trip)}
          travellerCount={travellerCount}
          showResume={showResume}
          statusBadge={trip.status || undefined}
          originLabel={origin.label}
          originKind={origin.kind}
          onPressMenu={() => handleTripMenu(trip)}
          onPressResume={() => handleResumeTrip(trip)}
          onPressViewItinerary={() => handleOpenTrip(trip)}
        />
      );
    },
    [activeTab, handleOpenTrip, handleResumeTrip, handleTripMenu, user?.city],
  );

  const emptyVariant = activeTab === 'DRAFT' ? 'draft' : activeTab === 'COMPLETED' ? 'completed' : 'upcoming';

  return (
    <ScrollView 
      style={styles.root}
      contentContainerStyle={{ paddingBottom: tabClearance + 20 }}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <TripsTitleRow 
        topInset={insets.top} 
        unreadCount={unreadCount}
        onNotificationsPress={() => navigateTo('Notifications')} 
      />

      <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <View style={styles.tripSection}>
        {filteredTrips.length === 0 && !isLoading ? (
          <View style={styles.paddedEmpty}>
            <TripEmptySection
              variant={activeTab === 'UPCOMING' ? 'upcoming' : emptyVariant}
              onAction={
                activeTab === 'UPCOMING' || emptyVariant === 'draft'
                  ? handleCreateTrip
                  : () => navigateTo('MainTabs', { screen: 'Map' })
              }
            />
          </View>
        ) : (
          <TripsHorizontalCarousel trips={filteredTrips} renderTrip={renderTripCard} />
        )}
      </View>

      <NextAdventureSection
        onPlanWithAI={() => {
          if (!requireAuth('Sign in to use AI Trip Planner.')) return;
          navigateTo('AITripPlanner');
        }}
        onBuildManually={handleCreateTrip}
      />

      <TripOptionsModal
        visible={!!selectedTripForOptions}
        trip={selectedTripForOptions}
        onShare={(trip) => {
          setSelectedTripForOptions(null);
          handleShareTrip(trip);
        }}
        onDelete={(trip) => {
          setSelectedTripForOptions(null);
          handleDelete(trip);
        }}
        onCancel={() => setSelectedTripForOptions(null)}
      />

      <TripDeleteConfirmModal
        visible={!!tripToDelete}
        trip={tripToDelete}
        loading={isDeleting}
        onConfirm={performDelete}
        onCancel={() => !isDeleting && setTripToDelete(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tripSection: {
    flexShrink: 0,
    justifyContent: 'flex-start',
    paddingBottom: 20,
    position: 'relative',
    zIndex: 2,
    elevation: 2,
  },
  paddedEmpty: {
    paddingHorizontal: 20,
  },
});
