import React, { useCallback, useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAIN_TAB_BAR_HEIGHT,
  MAIN_TAB_FAB_OVERHANG,
  MAIN_TAB_BAR_BOTTOM_GAP,
} from '../design/tabBarLayout';
import { MIN_TOUCH } from '../design/responsive';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MainTabParamList, RootStackParamList } from './types';
import { useUserContext } from '../context/UserContext';
import { PalPointsBalanceCard } from '../components/home/PalPointsBalanceCard';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useLocationContext } from '../context/LocationContext';
import { useDataContext } from '../context/DataContext';
import { getNearbyPlaces, getTrendingPlaces } from '../services/placesService';
import type { TouristSpot } from '../types';
import { useLazyScreen } from '../utils/useLazyScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
type RootNav = NativeStackNavigationProp<RootStackParamList>;
type TabName = 'Home' | 'Explore' | 'Map' | 'Itinerary' | 'Profile';

const TAB_ICONS: Record<TabName, { active: string; inactive: string; label: string }> = {
  Home:      { active: 'home',      inactive: 'home-outline',      label: 'Home' },
  Explore:   { active: 'film', inactive: 'film-outline', label: 'Reels' },
  Map:       { active: 'map',       inactive: 'map-outline',       label: 'Map' },
  Itinerary: { active: 'briefcase', inactive: 'briefcase-outline', label: 'Trips' },
  Profile:   { active: 'person',    inactive: 'person-outline',    label: 'Profile' },
};

interface MainTabsContextType {
  places: TouristSpot[];
  loading: boolean;
  error: string | null;
  fetchPlaces: () => void;
}

const MainTabsContext = React.createContext<MainTabsContextType>({
  places: [],
  loading: true,
  error: null,
  fetchPlaces: () => {},
});

export function useMainTabsData() {
  return React.useContext(MainTabsContext);
}

function HomeTabWrapper() {
  const { places, loading, error, fetchPlaces: onRefresh } = useMainTabsData();
  const { user, isGuest, setUser, setActiveMode, onLogout } = useUserContext();
  const { effectivePosition } = useLocationContext();
  const navigation = useNavigation<RootNav>();

  const HomeScreenComponent = useLazyScreen(() => require('../screens/HomeScreen'));

  const handleSelectSpot = useCallback((spot: { id: string }) => {
    navigation.navigate('MainTabs', {
      screen: 'Map',
      params: { selectedPlaceId: spot.id, selectedPlaceKey: Date.now() },
    });
  }, [navigation]);

  const handleStartTrip = useCallback(async () => {
    try {
      const { resolveTripResume } = require('../utils/resumeTrip') as typeof import('../utils/resumeTrip');
      const target = await resolveTripResume({ isGuest });
      if (target.kind === 'tripDetail') {
        navigation.navigate('TripDetail', { tripId: target.tripId });
        return;
      }
      if (target.kind === 'tripBuilder') {
        navigation.navigate('TripBuilder');
        return;
      }
    } catch (err) {
    }
    navigation.navigate('MainTabs', { screen: 'Itinerary' });
  }, [navigation, isGuest]);

  // Keep local currentItinerary aligned with the server draft/active trip
  useEffect(() => {
    if (isGuest || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { getActiveItineraryPlaceIds } = require('../utils/resumeTrip') as typeof import('../utils/resumeTrip');
        const ids = await getActiveItineraryPlaceIds();
        if (cancelled || !ids.length) return;
        setUser(prev => {
          const prevIds = prev.currentItinerary || [];
          if (prevIds.length === ids.length && prevIds.every((id, i) => id === ids[i])) return prev;
          return { ...prev, currentItinerary: ids };
        });
      } catch {
        // non-blocking sync
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, user?.uid, setUser]);

  return (
    <HomeScreenComponent
      user={user}
      position={effectivePosition}
      places={places}
      loading={loading}
      error={error}
      onRefresh={onRefresh}
      onStartTrip={handleStartTrip}
      onSelectSpot={handleSelectSpot}
      onNavigateToSearch={(query?: string, categoryId?: string) =>
        navigation.navigate('Search', query || categoryId ? { initialQuery: query, categoryId } : undefined)
      }
      onNavigateToMap={() => navigation.navigate('MainTabs', { screen: 'Map' })}
      onNavigateToProfile={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
      onNavigateToLeaderboard={() => navigation.navigate('Leaderboard')}
      onNavigateToRewards={() => navigation.navigate('Rewards')}
      onNavigateToWallet={() => navigation.navigate('Wallet')}
      onNavigateToAITripPlanner={() => navigation.navigate('AITripPlanner')}
      onNavigateToHiddenGems={() => navigation.navigate('AddHiddenGem')}
      onNavigateToVendors={() =>
        navigation.navigate('MainTabs', {
          screen: 'Map',
          params: { initialMapTab: 'vendors', mapTabKey: Date.now() },
        })
      }
      onNavigateToTrips={() => navigation.navigate('MainTabs', { screen: 'Itinerary' })}
      onNavigateToLegal={() => navigation.navigate('LegalHub')}
      onNavigateToTreasureHunt={() => navigation.navigate('TreasureHunt')}
      onBecomeCreator={() => navigation.navigate('BecomeCreator')}
      onBecomeVendor={() => navigation.navigate('VendorRegister')}
      onOpenCreatorStudio={() => setActiveMode('CONTENT_CREATOR')}
      onOpenVendorWorkspace={() => setActiveMode('VENDOR')}
      onSwitchMode={setActiveMode}
      onLogout={onLogout}
    />
  );
}

function ExploreTabWrapper() {
  const ReelsFeedScreenComponent = useLazyScreen(() => require('../screens/ReelsFeedScreen'));
  return <ReelsFeedScreenComponent />;
}

function MapTabWrapper({ route }: { route: any }) {
  const { places, error, fetchPlaces: onRefresh } = useMainTabsData();
  const { selectedPlaceId, selectedPlaceKey, initialMapTab, mapTabKey, reviewMode } = route.params || {};
  const { user } = useUserContext();
  const { vendors } = useDataContext();
  const navigation = useNavigation<RootNav>();

  const MapScreenComponent = useLazyScreen(() => require('../screens/MapScreen'));

  const handleSelectSpot = useCallback((spot: { id: string }) => {
    navigation.navigate('SpotDetail', { spotId: spot.id });
  }, [navigation]);

  const handleSelectVendor = useCallback((vendorId: string) => {
    navigation.navigate('VendorProfile', { vendorId });
  }, [navigation]);

  const handleViewVendorContent = useCallback((vendorId: string, vendorName: string, tab: 'offers' | 'reels' = 'offers') => {
    if (tab === 'reels') {
      navigation.navigate('VendorReels', { vendorId, vendorName });
      return;
    }
    navigation.navigate('VendorProfile', { vendorId, initialTab: 'offers' });
  }, [navigation]);

  const handleNavigateToTripBuilder = useCallback(() => {
    navigation.navigate('TripBuilder');
  }, [navigation]);

  const handleViewItinerary = useCallback((_placeId?: string) => {
    navigation.navigate('TripBuilder');
  }, [navigation]);

  return (
    <MapScreenComponent
      places={places}
      vendors={vendors}
      user={user}
      error={error}
      onRetry={onRefresh}
      onSelectSpot={handleSelectSpot}
      onSelectVendor={handleSelectVendor}
      onViewVendorContent={handleViewVendorContent}
      onNavigateToMap={() => navigation.navigate('MainTabs', { screen: 'Map' })}
      onNavigateToTripBuilder={handleNavigateToTripBuilder}
      onViewItinerary={handleViewItinerary}
      selectedPlaceId={selectedPlaceId}
      selectedPlaceKey={selectedPlaceKey}
      initialMapTab={initialMapTab}
      mapTabKey={mapTabKey}
      reviewMode={reviewMode}
    />
  );
}

function ItineraryTabWrapper() {
  const navigation = useNavigation<RootNav>();
  const ScreenComponent = useLazyScreen(() => require('../screens/MyTripsScreen'));
  return (
    <ScreenComponent
      onNavigate={(screen: string, params?: any) => {
        if (screen === 'goBack') {
          navigation.goBack();
        } else if (screen === 'MainTabs') {
          navigation.navigate('MainTabs', params);
        } else {
          (navigation.navigate as (name: string, params?: object) => void)(screen, params);
        }
      }}
    />
  );
}

function ProfileTabWrapper() {
  const { places } = useMainTabsData();
  const { user, isGuest, onLogout, setActiveMode } = useUserContext();
  const { vendors, vendorOffers, hiddenGemSubmissions } = useDataContext();
  const navigation = useNavigation<RootNav>();
  const ProfileScreenComponent = useLazyScreen(() => require('../screens/ProfileScreen'));
  
  if (!user) return null;

  return (
    <ProfileScreenComponent 
      user={user} 
      isGuest={isGuest} 
      onLogout={onLogout} 
      places={places} 
      vendors={vendors} 
      vendorOffers={vendorOffers}
      hiddenGemSubmissions={hiddenGemSubmissions}
      onSettingsPress={() => navigation.navigate('Settings')}
      onPremiumPress={() => navigation.navigate('PremiumUpgrade')}
      onNavigateToWallet={() => navigation.navigate('Wallet')}
      onNavigateToRewards={() => navigation.navigate('Rewards')}
      onRewardsWallet={() => navigation.navigate('RewardsWallet')}
      onMyContributions={() => navigation.navigate('MyContributions')}
      onAdminVerification={() => navigation.navigate('AdminVendorVerification')}
      onAdminHiddenGemReview={() => navigation.navigate('AdminHiddenGemReview')}
      onAdminPlacesReview={() => navigation.navigate('AdminPlacesReview')}
      onNavigateToLeaderboard={() => navigation.navigate('Leaderboard')}
      onNavigateToCreateReel={() => navigation.navigate('CreateReel')}
      onOpenCredits={() => navigation.navigate('Credits')}
      onSelectSpot={(spot: any) => navigation.navigate('SpotDetail', { spotId: spot.id })}
      onNavigateToHome={() => navigation.navigate('MainTabs', { screen: 'Home' })}
      onNavigateToMap={() => navigation.navigate('MainTabs', { screen: 'Map' })}
      onSubmitHiddenGem={() => navigation.navigate('AddHiddenGem')}
      onRegisterVendor={() => navigation.navigate('VendorRegister')}
      onSwitchRole={setActiveMode}
      onBack={() => navigation.goBack()}
    />
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const routeName = state.routes[state.index].name;
  
  let activeTab: any = 'home';
  if (routeName === 'Explore') activeTab = 'reels';
  else if (routeName === 'Map') activeTab = 'map';
  else if (routeName === 'Itinerary') activeTab = 'trips';
  else if (routeName === 'Profile') activeTab = 'profile';

  return <BottomNavigation activeTab={activeTab} />;
}

export default function MainTabs() {
  const { requestPermission, effectivePosition, hasPermission } = useLocationContext();
  const [places, setPlaces] = useState<TouristSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const lat = effectivePosition?.latitude != null
    ? Math.round(effectivePosition.latitude * 100) / 100
    : null;
  const lng = effectivePosition?.longitude != null
    ? Math.round(effectivePosition.longitude * 100) / 100
    : null;

  const fetchPlaces = useCallback(() => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);

    const finish = (data: TouristSpot[]) => {
      if (fetchGenRef.current !== gen) return;
      setPlaces(data);
      setLoading(false);
    };

    const fail = (err: any) => {
      if (fetchGenRef.current !== gen) return;
      setError(err?.message || 'Failed to load places');
      setLoading(false);
    };

    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      getNearbyPlaces(lat, lng, 100000)
        .then(async (nearby) => {
          if (fetchGenRef.current !== gen) return;
          if (nearby.length > 0) {
            finish(nearby);
            return;
          }
          const trending = await getTrendingPlaces();
          if (fetchGenRef.current !== gen) return;
          finish(trending);
        })
        .catch(fail);
      return () => { fetchGenRef.current += 1; };
    }

    // No GPS fix yet — keep loading while permission/location resolves
    if (hasPermission && effectivePosition == null) {
      const timeout = setTimeout(() => {
        if (fetchGenRef.current !== gen) return;
        getTrendingPlaces().then(finish).catch(fail);
      }, 3000);
      return () => {
        clearTimeout(timeout);
        fetchGenRef.current += 1;
      };
    }

    // Location unavailable — show discovery picks instead of an empty nearby row
    getTrendingPlaces()
      .then((trending) => {
        if (fetchGenRef.current !== gen) return;
        finish(trending);
      })
      .catch(fail);
    return () => { fetchGenRef.current += 1; };
  }, [lat, lng, hasPermission, effectivePosition]);

  // Ask for location once Home is on-screen, not during early boot
  useEffect(() => {
    const t = setTimeout(() => {
      requestPermission().catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [requestPermission]);

  // Refetch when GPS arrives / moves meaningfully
  useEffect(() => {
    const cleanup = fetchPlaces();
    return cleanup;
  }, [fetchPlaces, hasPermission]);

  return (
    <MainTabsContext.Provider value={{ places, loading, error, fetchPlaces }}>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={HomeTabWrapper} />
        <Tab.Screen name="Explore" component={ExploreTabWrapper} />
        <Tab.Screen name="Map" component={MapTabWrapper} />
        <Tab.Screen name="Itinerary" component={ItineraryTabWrapper} />
        <Tab.Screen name="Profile" component={ProfileTabWrapper} />
      </Tab.Navigator>
    </MainTabsContext.Provider>
  );
}

const styles = StyleSheet.create({
  customTabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: MAIN_TAB_BAR_HEIGHT,
    backgroundColor: '#1E1B18',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: MIN_TOUCH,
  },
  tabContentInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
    fontWeight: '600',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#B9834B',
    marginTop: 3,
  },
  centerButtonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: '100%',
    paddingTop: 0,
    minHeight: MIN_TOUCH,
  },
  centerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#B9834B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1E1B18',
    shadowColor: '#B9834B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  centerLabel: {
    marginTop: -10,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
