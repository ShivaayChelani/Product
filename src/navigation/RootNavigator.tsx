import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { linking } from './linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useUserContext } from '../context/UserContext';
import { useDataContext } from '../context/DataContext';
import { RootStackParamList } from './types';
import type { AuthStackParamList } from './types';
import type { RouteProp } from '@react-navigation/native';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import VendorTabs from './VendorTabs';
import CreatorTabs from './CreatorTabs';
import { getPlaces } from '../services/placesService';
import { isOnboardingCompleted, setOnboardingCompleted, resetOnboardingCompleted } from '../services/localStorageService';
import { DEV_FLAGS } from '../config/devFlags';
import { closeReelScreen } from '../features/travelSocial/utils/closeReelScreen';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

import { useLazyScreen } from '../utils/useLazyScreen';
import OfflineBanner from '../components/OfflineBanner';
import { navigationRef } from './navigationRef';
import {
  navigationIntegration,
  trackScreen,
  isMonitoringEnabled,
} from '../services/monitoring';
import { MONITORING_CONFIG } from '../config/monitoringConfig';
import type { NavigationState, PartialState } from '@react-navigation/native';

function getActiveRouteName(
  state: NavigationState | PartialState<NavigationState> | undefined,
): string | undefined {
  if (!state || !state.routes?.length) return undefined;
  const index = state.index ?? state.routes.length - 1;
  const route = state.routes[index];
  if (route.state) return getActiveRouteName(route.state as NavigationState);
  return route.name;
}

function MonitoredNavigation({ children, linkingConfig }: { children: React.ReactNode; linkingConfig?: typeof linking }) {
  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linkingConfig}
      onReady={() => {
        if (isMonitoringEnabled()) {
          navigationIntegration.registerNavigationContainer(navigationRef);
        }
        const name = getActiveRouteName(navigationRef.getRootState());
        if (name) trackScreen(name);
        const { flushPendingNotificationRoute } = require('../services/notifications/notificationNavigation');
        flushPendingNotificationRoute();
      }}
      onStateChange={(state) => {
        const name = getActiveRouteName(state);
        if (name) trackScreen(name);
      }}
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: '#FEF1E1',
        },
      }}
    >
      {children}
    </NavigationContainer>
  );
}

const AuthRootStack = createNativeStackNavigator<Pick<RootStackParamList, 'Auth'>>();

function UnauthenticatedRoot({ initialAuthRoute }: { initialAuthRoute?: keyof AuthStackParamList }) {
  return (
    <AuthRootStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthRootStack.Screen name="Auth">
        {() => <AuthNavigator initialRoute={initialAuthRoute ?? 'LoginSplash'} />}
      </AuthRootStack.Screen>
    </AuthRootStack.Navigator>
  );
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function TripBuilderWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/TripBuilderScreen'));
  return <Screen navigation={navigation} tripId={route.params?.tripId} />;
}

function VendorRegisterWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/VendorRegisterScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      onCheckStatus={() => navigation.navigate('UserProfile')}
    />
  );
}

function BecomeCreatorWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/BecomeCreatorScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      onCheckStatus={() => navigation.navigate('UserProfile')}
    />
  );
}

function AITripPlannerWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/AITripPlannerScreen'));
  return <Screen onNavigate={(s: string, params?: any) => navigation.navigate(s, params)} />;
}

function SelectPlacesForTripWrapper() {
  const Screen = useLazyScreen(() => require('../screens/SelectPlacesForTripScreen'));
  return <Screen />;
}

function GenerateLoadingWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/GenerateLoadingScreen'));
  return <Screen navigation={navigation} route={route} />;
}

function ItineraryScreenWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/ItineraryScreen'));
  return (
    <Screen
      addedPlaceId={route.params?.addedPlaceId}
      onBack={() => navigation.goBack()}
      onNavigateToMap={() => navigation.navigate('MainTabs', { screen: 'Map' })}
    />
  );
}

function MyTripsWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/MyTripsScreen'));
  return (
    <Screen
      initialTab={route.params?.initialTab}
      onNavigate={(screen: string, params?: any) => {
        if (screen === 'goBack') {
          navigation.goBack();
        } else {
          navigation.navigate(screen, params);
        }
      }}
    />
  );
}

function CreateTripWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CreateTripScreen'));
  return (
    <Screen
      onNavigate={(screen: string, params?: any) => {
        if (screen === 'goBack') {
          navigation.goBack();
        } else {
          navigation.navigate(screen, params);
        }
      }}
    />
  );
}

function TripDetailWrapper({ navigation, route }: any) {
  const tripId = route.params?.tripId;
  const warnings = route.params?.warnings;
  const note = route.params?.note;
  const resume = route.params?.resume;
  const Screen = useLazyScreen(() => require('../screens/TripDetailScreen'));
  return (
    <Screen
      tripId={tripId}
      warnings={warnings}
      note={note}
      resume={resume}
      onNavigate={(screen: string, params?: any) => {
        if (screen === 'goBack') {
          navigation.goBack();
        } else {
          navigation.navigate(screen, params);
        }
      }}
    />
  );
}

function TripPreviewWrapper() {
  const Screen = useLazyScreen(() => require('../screens/TripPreviewScreen'));
  return <Screen />;
}

function VendorOffersWrapper({ navigation: _navigation }: any) {
  const { user } = useUserContext();
  const { vendors, vendorOffers, handleRedeemOffer } = useDataContext();
  const Screen = useLazyScreen(() => require('../screens/VendorOffersScreen'));
  return <Screen user={user} vendors={vendors} vendorOffers={vendorOffers} onRedeemOffer={handleRedeemOffer} />;
}

function VendorOfferDetailWrapper() {
  const Screen = useLazyScreen(() => require('../screens/VendorOfferDetailScreen'));
  return <Screen />;
}

function VendorDashboardWrapper({ navigation }: any) {
  const { user, onLogout } = useUserContext();
  const { currentVendor, logoutVendor } = useDataContext();
  const Screen = useLazyScreen(() => require('../screens/VendorDashboardScreen'));
  const vendorId = (user as any)?.vendor?.id || currentVendor?.id || '';
  const handleLogout = useCallback(async () => {
    logoutVendor();
    await onLogout();
  }, [logoutVendor, onLogout]);

  return (
    <Screen
      onBack={() => navigation.navigate('VendorTabs', { screen: 'Home' })}
      canGoBack
      onLogout={handleLogout}
      onCreateOffer={() => navigation.navigate('CreateOffer', {})}
      onEditOffer={(offerId: string) => navigation.navigate('CreateOffer', { offerId })}
      onViewMyOffers={() => navigation.navigate('VendorTabs', { screen: 'Offers' })}
      onViewAnalytics={() => navigation.navigate('VendorTabs', { screen: 'Statistics' })}
      onViewProfile={() =>
        navigation.navigate('VendorProfile', {
          vendorId: vendorId || currentVendor?.id || 'me',
          self: true,
        })
      }
    />
  );
}

function CreateOfferWrapper({ route, navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CreateOfferScreen'));
  return <Screen onBack={() => navigation.goBack()} offerId={route.params?.offerId} />;
}


function VendorCustomersWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/VendorCustomersScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function PremiumUpgradeWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/PremiumUpgradeScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function UserPremiumWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/UserPremiumScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function CreatorSubscriptionWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CreatorSubscriptionScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function BillingHistoryWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/BillingHistoryScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function VendorSubscriptionWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/VendorSubscriptionScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function VendorListingPreviewWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/VendorListingPreviewScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function VendorPalPointsPartnerWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/VendorPalPointsPartnerScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function RazorpayCheckoutWrapper({ route, navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/RazorpayCheckoutScreen'));
  const p = route.params || {};
  return (
    <Screen
      onBack={() => navigation.goBack()}
      planId={p.planId}
      period={p.period}
      planName={p.planName}
      amountPaise={p.amountPaise}
      orderId={p.orderId}
      keyId={p.keyId}
      currency={p.currency}
      prefillEmail={p.prefillEmail}
      prefillName={p.prefillName}
    />
  );
}

function AdminVerificationWrapper({ navigation }: any) {
  const { onLogout } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/AdminVendorVerificationScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      onLogout={onLogout}
      onNavigateHiddenGems={() => navigation.navigate('AdminHiddenGemReview')}
      onNavigatePlaces={() => navigation.navigate('AdminPlacesReview')}
      onNavigateClaims={() => navigation.navigate('AdminClaimsReview')}
      onNavigateReels={() => navigation.navigate('AdminReels')}
    />
  );
}

function AdminGemReviewWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/AdminHiddenGemReviewScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function AdminPlacesReviewWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/AdminPlacesReviewScreen'));
  return <Screen onBack={() => navigation.goBack()} onNavigateCreate={() => navigation.navigate('AdminCreatePlace')} />;
}

function AdminCreatePlaceWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/AdminCreatePlaceScreen'));
  return <Screen navigation={navigation} />;
}

function AdminClaimsReviewWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/AdminClaimsReviewScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function AdminReelsWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/AdminReelsScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function UploadPlacePhotoWrapper() {
  const Screen = useLazyScreen(() => require('../screens/UploadPlacePhotoScreen'));
  return <Screen />;
}

function AddHiddenGemWrapper({ navigation }: any) {
  const { user } = useUserContext();
  const { submitHiddenGem } = useDataContext();
  const Screen = useLazyScreen(() => require('../screens/AddHiddenGemScreen'));
  return <Screen onBack={() => navigation.goBack()} onSubmit={submitHiddenGem} userId={user?.uid} userName={user?.displayName} />;
}

function MyContributionsWrapper({ navigation }: any) {
  const { user } = useUserContext();
  const { hiddenGemSubmissions } = useDataContext();
  const Screen = useLazyScreen(() => require('../screens/MyContributionsScreen'));
  return <Screen onBack={() => navigation.goBack()} userId={user?.uid} submissions={hiddenGemSubmissions} onAddNew={() => navigation.navigate('AddHiddenGem')} />;
}

function RewardsWalletWrapper({ navigation }: any) {
  const { user } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/RewardsWalletScreen'));
  return <Screen user={user} onBack={() => navigation.goBack()} />;
}

function MemoriesWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/MemoriesScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}



function WalletWrapper({ navigation }: any) {
  const { user } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/WalletScreen'));
  if (!user) return null;
  return (
    <Screen
      user={user}
      onBack={() => navigation.goBack()}
      onNavigateToRewards={() => navigation.navigate('Rewards')}
      onNavigateToScanner={() => navigation.navigate('PayPoints')}
    />
  );
}

function RewardsWrapper({ navigation }: any) {
  const { user } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/RewardsScreen'));
  if (!user) return null;
  return (
    <Screen
      user={user}
      onBack={() => navigation.goBack()}
      onSelectOffer={(offerId: string) => navigation.navigate('VendorOfferDetail', { offerId })}
    />
  );
}

function LeaderboardWrapper({ _navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/LeaderboardScreen'));
  return (
    <Screen />
  );
}

function PayPointsWrapper({ route, navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/PayPointsScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      initialVendorCode={route.params?.vendorCode}
    />
  );
}

function VendorAnalyticsWrapper({ route, navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/VendorAnalyticsScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      vendorId={route.params.vendorId}
      vendorName={route.params.vendorName}
    />
  );
}

function CreateReelWrapper({ navigation, route }: any) {
  const { handleCreateReel, reelsUploadProgress } = useDataContext();
  const collaborationId = route.params?.collaborationId as string | undefined;
  const editReel = route.params?.editReel as Record<string, unknown> | undefined;
  const Screen = useLazyScreen(() => require('../screens/CreateReelScreen'));

  const handleCollabSave = React.useCallback(async (
    data: { videoUri: string; caption: string; spotId: string; spotName?: string; tags: string[] },
    onProgress?: (p: number) => void,
  ) => {
    if (editReel) {
      const { socialApi } = require('../services/api');
      const targetPlaceId = data.spotId?.trim() || null;
      await socialApi.updateReel(editReel.id, {
        title: data.caption?.slice(0, 200),
        description: data.caption,
        placeId: targetPlaceId,
        vendorId: null,
        tags: data.tags,
      });
      return; // Handled by CreateReelScreen success alert
    }
    if (!collaborationId) return handleCreateReel(data, onProgress);
    const { uploadApi } = require('../services/api/upload');
    const { collaborationsApi } = require('../services/api/collaborations');
    const { compressVideo } = require('../services/videoCompressor');
    try {
      onProgress?.(5);
      const compressed = await compressVideo(data.videoUri);
      const videoResult = await uploadApi.uploadVideo(compressed.compressedUri, (p: number) => onProgress?.(Math.round(p * 0.9)));
      const videoUrl = videoResult?.url;
      if (!videoUrl) throw new Error('Video upload failed');
      await collaborationsApi.submitReel(collaborationId, {
        videoUrl,
        title: data.caption?.slice(0, 200),
        description: data.caption,
        placeId: data.spotId || undefined,
      });
      onProgress?.(100);
      const { Alert } = require('react-native');
      Alert.alert('Submitted', 'Your collaboration reel was sent to the vendor for review.', [
        { text: 'OK', onPress: () => navigation.replace('CollaborationDetail', { collaborationId }) },
      ]);
    } catch (err: any) {
      const { Alert } = require('react-native');
      Alert.alert('Upload failed', err?.message || 'Could not submit collaboration reel.');
      throw err;
    }
  }, [collaborationId, handleCreateReel, navigation, editReel?.id]);

  return (
    <Screen
      onBack={() => navigation.goBack()}
      onSaveReel={handleCollabSave}
      uploadProgress={reelsUploadProgress}
      sourceReelId={route.params?.sourceReelId}
      captionHint={route.params?.captionHint}
      suppressSuccessAlert={route.params?.suppressSuccessAlert}
      prefillPlaceId={route.params?.prefillPlaceId}
      prefillPlaceName={route.params?.prefillPlaceName}
      editReel={editReel}
      collaborationId={collaborationId}
      useBackgroundUpload={!collaborationId}
    />
  );
}

function SpotDetailScreen({ route, navigation }: { route: RouteProp<RootStackParamList, 'SpotDetail'>; navigation: any }) {
  const SpotDetailComponent = useLazyScreen(() => require('../screens/SpotDetailScreen'));
  const spotId = route.params?.spotId;
  const [spot, setSpot] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const { theme } = useTheme();
  const { user } = useUserContext();

  React.useEffect(() => {
    if (!spotId) { setLoading(false); return; }
    (async () => {
      try {
        const { placesApi } = require('../services/api');
        const res = await placesApi.getById(spotId);
        setSpot(res);
      } catch {
        setSpot(null);
      }
      setLoading(false);
    })();
  }, [spotId]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <Text style={{ fontSize: 16, color: theme.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  if (!spot) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <Text style={{ fontSize: 16, color: '#666' }}>Spot not found</Text>
      </View>
    );
  }

  return <SpotDetailComponent spot={spot} user={user} onBack={() => navigation.goBack()} />;
}

function PlaceReelsScreen({ route, navigation }: { route: RouteProp<RootStackParamList, 'PlaceReels'>; navigation: any }) {
  const PlaceReelsComponent = useLazyScreen(() => require('../screens/PlaceReelsScreen'));
  return <PlaceReelsComponent route={route} navigation={navigation} />;
}

function ReelDetailWrapper({ route, navigation }: { route: RouteProp<RootStackParamList, 'ReelDetail'>; navigation: any }) {
  const ReelDetailScreen = useLazyScreen(() => require('../screens/ReelDetailScreen'));
  const { user } = useUserContext();
  const { reels, handleLikeReel, handleAddReelComment } = useDataContext();
  const [reel, setReel] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const found = reels.find((r: any) => r.id === route.params.reelId);
    if (found) {
      setReel(found);
      setLoading(false);
    } else {
      const { getReelById } = require('../services/reelService');
      getReelById(route.params.reelId)
        .then((data: any) => {
          setReel(data);
          setLoading(false);
        })
        .catch(() => {
          setReel(null);
          setLoading(false);
        });
    }
  }, [route.params.reelId, reels]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!reel) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 24 }}>
      <Text style={{ color: '#fff', marginBottom: 16 }}>Reel not found</Text>
      <TouchableOpacity
        onPress={() => closeReelScreen(navigation)}
        accessibilityLabel="Close reel"
        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ReelDetailScreen
      reel={reel}
      reels={route.params.reels || (reels.length > 0 ? reels : [reel])}
      initialIndex={route.params.initialIndex || 0}
      onBack={() => closeReelScreen(navigation)}
      onLike={(reelId: string) => handleLikeReel(reelId)}
      onAddComment={(text: string) => handleAddReelComment(reel.id, text)}
      isLiked={(user.likedReels || []).includes(reel.id) || !!reel.isLiked}
    />
  );
}

function VendorReelsWrapper({ route, navigation }: { route: RouteProp<RootStackParamList, 'VendorReels'>; navigation: any }) {
  const Screen = useLazyScreen(() => require('../screens/VendorReelsScreen'));
  return (
    <Screen
      vendorId={route.params.vendorId}
      vendorName={route.params.vendorName}
      onBack={() => navigation.goBack()}
    />
  );
}

function VendorReelsManagementWrapper({ navigation }: { route: any; navigation: any }) {
  const Screen = useLazyScreen(() => require('../screens/VendorReelsManagementScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      onCreateReel={() => navigation.navigate('CreateVendorReel')}
    />
  );
}

function CreateVendorReelWrapper({ navigation }: { route: any; navigation: any }) {
  const Screen = useLazyScreen(() => require('../screens/CreateVendorReelScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
    />
  );
}

function VendorProfileWrapper({ route, navigation }: { route: RouteProp<RootStackParamList, 'VendorProfile'>; navigation: any }) {
  const Screen = useLazyScreen(() => require('../screens/VendorProfileScreen'));
  return (
    <Screen
      vendorId={route.params.vendorId}
      self={!!route.params.self}
      initialTab={route.params.initialTab || 'offers'}
      openReview={!!route.params.openReview}
      onNavigate={(screen: string, params?: any) => {
        if (screen === 'goBack') navigation.goBack();
        else navigation.navigate(screen as never, params as never);
      }}
    />
  );
}

function CreatorProfileWrapper({ route, navigation }: { route: RouteProp<RootStackParamList, 'CreatorProfile'>; navigation: any }) {
  const Screen = useLazyScreen(() => require('../screens/CreatorProfileScreen'));
  return (
    <Screen
      username={route.params.username}
      onBack={() => navigation.goBack()}
    />
  );
}

function CreatorAnalyticsWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CreatorAnalyticsScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
    />
  );
}

function CollaborationsDashboardWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/CollaborationsDashboardScreen'));
  return <Screen />;
}

function CreatorStudioSettingsWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CreatorStudioProfileScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function CollaborationRequestWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CollaborationRequestScreen'));
  return <Screen />;
}

function CollaborationDetailWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CollaborationDetailScreen'));
  return <Screen />;
}

function CollaborationReviewWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CollaborationReviewScreen'));
  return <Screen />;
}


function PalPointsScreenWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/PalPointsScreen'));
  return <Screen />;
}

function CreditsWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CreditsScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function SettingsWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/SettingsScreen'));
  // Logout is owned by UserContext — never reset to a non-existent "Auth" stack route.
  return <Screen navigation={navigation} />;
}

function CrashTestWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/CrashTestScreen'));
  return <Screen navigation={navigation} />;
}

function DevNotificationTestWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/DevNotificationTestScreen'));
  return <Screen navigation={navigation} />;
}

function VendorSettingsWrapper() {
  const Screen = useLazyScreen(() => require('../screens/VendorSettingsScreen'));
  return <Screen />;
}

function ChangePasswordWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/ChangePasswordScreen'));
  return <Screen navigation={navigation} />;
}

function DeleteAccountWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/DeleteAccountScreen'));
  return <Screen navigation={navigation} />;
}

function PrivacySettingsWrapper() {
  const { PrivacySettingsScreen } = require('../screens/settings/PrivacyNotificationScreens');
  return <PrivacySettingsScreen />;
}

function NotificationSettingsWrapper() {
  const { NotificationSettingsScreen } = require('../screens/settings/PrivacyNotificationScreens');
  return <NotificationSettingsScreen />;
}

function LanguageSettingsWrapper() {
  const { LanguageSettingsScreen } = require('../screens/settings/LanguageThemeScreens');
  return <LanguageSettingsScreen />;
}

function ThemeSettingsWrapper() {
  const { ThemeSettingsScreen } = require('../screens/settings/LanguageThemeScreens');
  return <ThemeSettingsScreen />;
}

function SecuritySettingsWrapper() {
  const { SecuritySettingsScreen } = require('../screens/settings/SecurityScreens');
  return <SecuritySettingsScreen />;
}

function ActiveSessionsWrapper() {
  const { ActiveSessionsScreen } = require('../screens/settings/SecurityScreens');
  return <ActiveSessionsScreen />;
}

function StorageSettingsWrapper() {
  const { StorageSettingsScreen } = require('../screens/settings/StorageScreens');
  return <StorageSettingsScreen />;
}

function OfflineSettingsWrapper() {
  const { OfflineSettingsScreen } = require('../screens/settings/StorageScreens');
  return <OfflineSettingsScreen />;
}

function HowItWorksWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/HowItWorksScreen'));
  return <Screen navigation={navigation} onBack={() => navigation.goBack()} />;
}

function TreasureHuntWrapper() {
  const Screen = useLazyScreen(() => require('../screens/TreasureHuntScreen'));
  return <Screen />;
}

function BlockListWrapper() {
  const { BlockListScreen } = require('../screens/settings/BlockListScreen');
  return <BlockListScreen />;
}

function LicensesWrapper() {
  const { LicensesScreen } = require('../screens/settings/MiscSettingsScreens');
  return <LicensesScreen />;
}

function FeedbackWrapper() {
  const { FeedbackScreen } = require('../screens/settings/MiscSettingsScreens');
  return <FeedbackScreen />;
}

function NotificationsWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/NotificationsScreen'));
  return <Screen onBack={() => navigation.goBack()} />;
}

function LegalHubWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/LegalHubScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      onSelect={(type: string, label: string) => navigation.navigate('LegalDocument', { type, title: label })}
    />
  );
}

function LegalDocumentWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/LegalDocumentScreen'));
  return (
    <Screen
      type={route.params?.type}
      fallbackTitle={route.params?.title}
      onBack={() => navigation.goBack()}
    />
  );
}

function SearchWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/SearchScreen'));
  const mode = route.params?.mode;
  const stopId = route.params?.stopId;
  const tripId = route.params?.tripId;
  const destination = route.params?.destination;
  const excludePlaceIds = route.params?.excludePlaceIds;
  const [itineraryPlaceIds, setItineraryPlaceIds] = useState<string[]>(excludePlaceIds || []);
  const [activeTripId, setActiveTripId] = useState<string | undefined>(tripId);

  useEffect(() => {
    setItineraryPlaceIds(excludePlaceIds || []);
  }, [excludePlaceIds]);

  useEffect(() => {
    if (tripId) setActiveTripId(tripId);
  }, [tripId]);

  const refreshItineraryPlaceIds = async (resolvedTripId: string) => {
    try {
      const { tripsApi } = await import('../services/api/trips');
      const trip = await tripsApi.getById(resolvedTripId);
      const ids = (trip.tripDays || []).flatMap(d => (d.stops || []).map(s => s.placeId));
      setItineraryPlaceIds(ids);
      setActiveTripId(resolvedTripId);
    } catch {
      /* keep optimistic local ids */
    }
  };

  const handleReplacePlace = async (placeId: string) => {
    if (!stopId) return;
    try {
      const { tripsApi } = await import('../services/api/trips');
      await tripsApi.replaceStop(stopId, placeId);
      navigation.goBack();
    } catch (err: any) {
      const { Alert } = await import('react-native');
      Alert.alert('Replace failed', err?.message || 'Could not replace this stop. Try another place.');
    }
  };

  const handleAddToItinerary = async (placeId: string, meta?: { name?: string; city?: string }) => {
    try {
      const { quickAddPlaceToTrip } = await import('../utils/quickAddPlace');
      const result = await quickAddPlaceToTrip(placeId, {
        tripId: activeTripId ?? tripId,
        name: meta?.name,
        city: meta?.city,
      });
      await refreshItineraryPlaceIds(result.tripId);
      const { Alert } = await import('react-native');
      if (result.alreadyExists) {
        Alert.alert('Already added', `${meta?.name || 'Place'} is already on this itinerary.`);
        return;
      }
      Alert.alert('Added', `${meta?.name || 'Place'} was added to your itinerary.`, [
        { text: 'Add more', style: 'cancel' },
        {
          text: 'View itinerary',
          onPress: () => navigation.navigate('TripBuilder', { tripId: result.tripId }),
        },
      ]);
    } catch (err: any) {
      const { Alert } = await import('react-native');
      Alert.alert('Could not add place', err?.message || 'Please try again.');
    }
  };

  return (
    <Screen
      onBack={() => navigation.goBack()}
      initialQuery={route.params?.initialQuery}
      categoryId={route.params?.categoryId}
      mode={mode}
      stopId={stopId}
      destination={destination}
      excludePlaceIds={mode === 'itinerary' ? itineraryPlaceIds : excludePlaceIds}
      onReplacePlace={mode === 'replace' ? handleReplacePlace : undefined}
      onAddToItinerary={mode === 'itinerary' ? handleAddToItinerary : undefined}
      onSelectSpot={(spotId: string) =>
        navigation.navigate('MainTabs', {
          screen: 'Map',
          params: { selectedPlaceId: spotId, selectedPlaceKey: Date.now() },
        })
      }
      onSelectVendor={(vendorId: string) => navigation.navigate('VendorProfile', { vendorId })}
      onSelectOffer={(offerId: string) => navigation.navigate('VendorOfferDetail', { offerId })}
    />
  );
}

function UserProfileWrapper({ navigation, route }: any) {
  const ProfileScreenComponent = useLazyScreen(() => require('../screens/ProfileScreen'));
  const { user, isGuest, onLogout, handleResetProgress, setActiveMode } = useUserContext();
  const { vendors, vendorOffers, hiddenGemSubmissions } = useDataContext();
  const [places, setPlaces] = useState<any[]>([]);
  const openEdit = !!route?.params?.openEdit;

  useEffect(() => {
        getPlaces().then(setPlaces).catch(() => {});
  }, []);

  const handleSelectSpot = useCallback((spot: { id: string }) => {
    navigation.navigate('SpotDetail', { spotId: spot.id });
  }, [navigation]);

  return (
    <ProfileScreenComponent
      user={user}
      places={places}
      vendors={vendors}
      vendorOffers={vendorOffers}
      isGuest={isGuest}
      openEdit={openEdit}
      hiddenGemSubmissions={hiddenGemSubmissions}
      onSelectSpot={handleSelectSpot}
      onSubmitHiddenGem={() => navigation.navigate('AddHiddenGem')}
      onNavigateToHome={() => navigation.navigate('MainTabs', { screen: 'Home' })}
      onNavigateToMap={() => navigation.navigate('MainTabs', { screen: 'Map' })}
      onNavigateToReels={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
      onNavigateToItinerary={() => navigation.navigate('MainTabs', { screen: 'Itinerary' })}
      onNavigateToLeaderboard={() => navigation.navigate('Leaderboard')}
      onResetProgress={handleResetProgress}
      onLogout={onLogout}
      onAdminVerification={() => navigation.navigate('AdminVendorVerification')}
      onAdminHiddenGemReview={() => navigation.navigate('AdminHiddenGemReview')}
      onAdminPlacesReview={() => navigation.navigate('AdminPlacesReview')}
      onOpenCredits={() => navigation.navigate('Credits')}
      onNavigateToWallet={() => navigation.navigate('Wallet')}
      onNavigateToRewards={() => navigation.navigate('Rewards')}
      onRewardsWallet={() => navigation.navigate('RewardsWallet')}
      onMyContributions={() => navigation.navigate('MyContributions')}
      onNavigateToCreateReel={() => navigation.navigate('CreateReel')}
      onRegisterVendor={() => navigation.navigate('VendorRegister')}
      onSwitchRole={setActiveMode}
      onSettingsPress={() => navigation.navigate('Settings')}
      onPremiumPress={() => navigation.navigate('PremiumUpgrade')}
      onBack={() => navigation.goBack()}
    />
  );
}

/** Which app shell to mount — driven only by activeMode, not permission/capability. */
function resolveShellMode(user: { activeMode?: string; activeRole?: string } | null | undefined) {
  const raw = String(user?.activeMode || user?.activeRole || 'USER').toUpperCase();
  if (raw === 'CREATOR' || raw === 'CONTENT_CREATOR') return 'CONTENT_CREATOR';
  if (raw === 'VENDOR') return 'VENDOR';
  if (raw === 'ADMIN') return 'ADMIN';
  return 'USER';
}

/**
 * Shared modal / detail screens — must be a Group *element*, not a custom component.
 * React Navigation only registers Screen/Group as direct navigator children.
 */
const sharedStackScreens = (
  <Stack.Group>
    <Stack.Screen name="TripBuilder" component={TripBuilderWrapper} />
    <Stack.Screen name="AITripPlanner" component={AITripPlannerWrapper} />
    <Stack.Screen name="SelectPlacesForTrip" component={SelectPlacesForTripWrapper} />
    <Stack.Screen name="ItineraryScreen" component={ItineraryScreenWrapper} />
    <Stack.Screen
      name="GenerateLoading"
      component={GenerateLoadingWrapper}
      options={{ contentStyle: { backgroundColor: '#F5EFE6' } }}
    />
    <Stack.Screen name="MyTrips" component={MyTripsWrapper} />
    <Stack.Screen name="CreateTrip" component={CreateTripWrapper} />
    <Stack.Screen name="TripDetail" component={TripDetailWrapper} />
    <Stack.Screen name="TripPreview" component={TripPreviewWrapper} />
    <Stack.Screen name="VendorRegister" component={VendorRegisterWrapper} />
    <Stack.Screen name="BecomeCreator" component={BecomeCreatorWrapper} />
    <Stack.Screen name="UploadPlacePhoto" component={UploadPlacePhotoWrapper} />
    <Stack.Screen name="SpotDetail" component={SpotDetailScreen} />
    <Stack.Screen name="PlaceReels" component={PlaceReelsScreen} />
    <Stack.Screen name="VendorOffers" component={VendorOffersWrapper} />
    <Stack.Screen name="VendorOfferDetail" component={VendorOfferDetailWrapper} />
    <Stack.Screen name="VendorDashboard" component={VendorDashboardWrapper} />
    <Stack.Screen name="CreateOffer" component={CreateOfferWrapper} />
    <Stack.Screen name="VendorCustomers" component={VendorCustomersWrapper} />
    <Stack.Screen name="PremiumUpgrade" component={PremiumUpgradeWrapper} />
    <Stack.Screen name="UserPremium" component={UserPremiumWrapper} />
    <Stack.Screen name="CreatorSubscription" component={CreatorSubscriptionWrapper} />
    <Stack.Screen name="BillingHistory" component={BillingHistoryWrapper} />
    <Stack.Screen name="VendorSubscription" component={VendorSubscriptionWrapper} />
    <Stack.Screen name="VendorListingPreview" component={VendorListingPreviewWrapper} />
    <Stack.Screen name="VendorPalPointsPartner" component={VendorPalPointsPartnerWrapper} />
    <Stack.Screen name="RazorpayCheckout" component={RazorpayCheckoutWrapper} />
    <Stack.Screen name="AdminVendorVerification" component={AdminVerificationWrapper} />
    <Stack.Screen name="AdminHiddenGemReview" component={AdminGemReviewWrapper} />
    <Stack.Screen name="AdminPlacesReview" component={AdminPlacesReviewWrapper} />
    <Stack.Screen name="AdminCreatePlace" component={AdminCreatePlaceWrapper} />
    <Stack.Screen name="AdminClaimsReview" component={AdminClaimsReviewWrapper} />
    <Stack.Screen name="AdminReels" component={AdminReelsWrapper} />
    <Stack.Screen name="AddHiddenGem" component={AddHiddenGemWrapper} />
    <Stack.Screen name="MyContributions" component={MyContributionsWrapper} />
    <Stack.Screen name="RewardsWallet" component={RewardsWalletWrapper} />
    <Stack.Screen name="Wallet" component={WalletWrapper} />
    <Stack.Screen name="PalPointsScreen" component={PalPointsScreenWrapper} />
    <Stack.Screen name="Rewards" component={RewardsWrapper} />
    <Stack.Screen name="Leaderboard" component={LeaderboardWrapper} />
    <Stack.Screen name="PayPoints" component={PayPointsWrapper} />
    <Stack.Screen name="VendorProfile" component={VendorProfileWrapper} />
    <Stack.Screen name="VendorSettings" component={VendorSettingsWrapper} />
    <Stack.Screen name="VendorAnalytics" component={VendorAnalyticsWrapper} />
    <Stack.Screen name="Memories" component={MemoriesWrapper} />
    <Stack.Screen name="CreateReel" component={CreateReelWrapper} />
    <Stack.Screen name="CreateVendorReel" component={CreateVendorReelWrapper} />
    <Stack.Screen name="ReelDetail" component={ReelDetailWrapper} />
    <Stack.Screen name="VendorReels" component={VendorReelsWrapper} />
    <Stack.Screen name="VendorReelsManagement" component={VendorReelsManagementWrapper} />
    <Stack.Screen name="CreatorProfile" component={CreatorProfileWrapper} />
    <Stack.Screen name="CreatorAnalytics" component={CreatorAnalyticsWrapper} />
    <Stack.Screen name="CreatorStudioSettings" component={CreatorStudioSettingsWrapper} />
    <Stack.Screen name="CollaborationsDashboard" component={CollaborationsDashboardWrapper} />
    <Stack.Screen name="CollaborationRequest" component={CollaborationRequestWrapper} />
    <Stack.Screen name="CollaborationDetail" component={CollaborationDetailWrapper} />
    <Stack.Screen name="CollaborationReview" component={CollaborationReviewWrapper} />
    <Stack.Screen name="Credits" component={CreditsWrapper} />
    <Stack.Screen name="Settings" component={SettingsWrapper} />
    <Stack.Screen name="HowItWorks" component={HowItWorksWrapper} />
    <Stack.Screen name="TreasureHunt" component={TreasureHuntWrapper} />
    {MONITORING_CONFIG.enableCrashTests ? (
      <Stack.Screen name="CrashTest" component={CrashTestWrapper} options={{ headerShown: false }} />
    ) : null}
    {MONITORING_CONFIG.enableNotificationTests ? (
      <Stack.Screen name="DevNotificationTest" component={DevNotificationTestWrapper} options={{ headerShown: false }} />
    ) : null}
    <Stack.Screen name="ChangePassword" component={ChangePasswordWrapper} />
    <Stack.Screen name="DeleteAccount" component={DeleteAccountWrapper} />
    <Stack.Screen name="PrivacySettings" component={PrivacySettingsWrapper} />
    <Stack.Screen name="NotificationSettings" component={NotificationSettingsWrapper} />
    <Stack.Screen name="LanguageSettings" component={LanguageSettingsWrapper} />
    <Stack.Screen name="ThemeSettings" component={ThemeSettingsWrapper} />
    <Stack.Screen name="SecuritySettings" component={SecuritySettingsWrapper} />
    <Stack.Screen name="ActiveSessions" component={ActiveSessionsWrapper} />
    <Stack.Screen name="StorageSettings" component={StorageSettingsWrapper} />
    <Stack.Screen name="OfflineSettings" component={OfflineSettingsWrapper} />
    <Stack.Screen name="BlockList" component={BlockListWrapper} />
    <Stack.Screen name="Licenses" component={LicensesWrapper} />
    <Stack.Screen name="Feedback" component={FeedbackWrapper} />
    <Stack.Screen name="Notifications" component={NotificationsWrapper} />
    <Stack.Screen name="LegalHub" component={LegalHubWrapper} />
    <Stack.Screen name="LegalDocument" component={LegalDocumentWrapper} />
    <Stack.Screen name="Search" component={SearchWrapper} />
    <Stack.Screen name="UserProfile" component={UserProfileWrapper} />
  </Stack.Group>
);

/**
 * Completely separate app shells by workspace.
 * User = MainTabs (locked). Creator = CreatorTabs. Vendor = VendorTabs.
 * mode is passed from RootNavigator so the NavigationContainer key and stack always match.
 */
function AuthenticatedStack({ mode }: { mode: string }) {
  const { user } = useUserContext();
  const { currentVendor } = useDataContext();
  const [vendorWaitTimedOut, setVendorWaitTimedOut] = React.useState(false);
  const hasVendorRole = user?.roles?.includes('VENDOR') || user?.permission === 'VENDOR';
  // Auth profile may already carry a vendor stub — enough to mount VendorTabs
  const hasVendorIdentity = !!(currentVendor?.id || (user as any)?.vendor?.id);

  React.useEffect(() => {
    if (mode !== 'VENDOR' || hasVendorIdentity) {
      setVendorWaitTimedOut(false);
      return;
    }
    const t = setTimeout(() => setVendorWaitTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [mode, hasVendorIdentity]);

  // Brief load while DataContext hydrates getMe — never block forever (Creator has no gate)
  if (mode === 'VENDOR' && hasVendorRole && !hasVendorIdentity && !vendorWaitTimedOut) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#B9834B" />
        <Text style={{ marginTop: 12, color: '#8B7355' }}>Loading vendor workspace...</Text>
      </View>
    );
  }

  if (mode === 'CONTENT_CREATOR') {
    return (
      <Stack.Navigator
        key="creator-shell"
        initialRouteName="CreatorTabs"
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="CreatorTabs" component={CreatorTabs} />
        {sharedStackScreens}
      </Stack.Navigator>
    );
  }

  if (mode === 'VENDOR') {
    return (
      <Stack.Navigator
        key="vendor-shell"
        initialRouteName="VendorTabs"
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="VendorTabs" component={VendorTabs} />
        {sharedStackScreens}
      </Stack.Navigator>
    );
  }

  if (mode === 'ADMIN') {
    return (
      <Stack.Navigator
        key="admin-shell"
        initialRouteName="AdminVendorVerification"
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="AdminVendorVerification" component={AdminVerificationWrapper} />
        {sharedStackScreens}
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      key="user-shell"
      initialRouteName="MainTabs"
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      {sharedStackScreens}
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { theme } = useTheme();
  const { user, isAuthenticated, isStorageLoaded, isInitializing, isLoggingOut } = useUserContext();
  const { isStorageLoaded: dataLoaded } = useDataContext();
  const [splashDone, setSplashDone] = useState(false);
  /** null = still reading AsyncStorage — must NOT treat as "show onboarding" */
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const shellMode = resolveShellMode(user);

  // Load onboarding flag as early as possible (do not wait for splash)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (__DEV__ && DEV_FLAGS.FORCE_SHOW_ONBOARDING) {
          await resetOnboardingCompleted();
          if (!cancelled) setOnboardingDone(false);
          return;
        }
        const done = await isOnboardingCompleted();
        if (!cancelled) setOnboardingDone(done);
      } catch {
        if (!cancelled) setOnboardingDone(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Boot splash runs once per cold start. Logout / auth expiry must NOT replay it.
  const bootReady =
    isStorageLoaded &&
    dataLoaded &&
    !isInitializing &&
    onboardingDone !== null;

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  if (!bootReady) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <ActivityIndicator size="large" color="#B9834B" />
      </View>
    );
  }

  if (isLoggingOut) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <ActivityIndicator size="large" color="#B9834B" />
      </View>
    );
  }

  if (isAuthenticated) {
    return (
      <MonitoredNavigation linkingConfig={linking}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <View style={{ flex: 1, backgroundColor: '#1E1B18' }}>
          <OfflineBanner />
          <AuthenticatedStack mode={shellMode} />
        </View>
      </MonitoredNavigation>
    );
  }

  // Only show onboarding when we KNOW it is incomplete
  if (onboardingDone === false) {
    return (
      <OnboardingScreen
        onDone={async () => {
          await setOnboardingCompleted();
          setOnboardingDone(true);
        }}
      />
    );
  }

  return (
    <MonitoredNavigation linkingConfig={linking}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
      <UnauthenticatedRoot />
    </MonitoredNavigation>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
});
