import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useUserContext } from '../context/UserContext';
import { useDataContext } from '../context/DataContext';
import { useEntitlements } from '../context/EntitlementContext';
import { launchImageLibrary } from 'react-native-image-picker';
import { UserProfile, TouristSpot, VendorBusiness, VendorOffer } from '../types';
import { DEV_FLAGS } from '../config/devFlags';
import { updateUserProfile } from '../services/authService';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import ProfileModeSwitcher from '../components/ProfileModeSwitcher';
import {
  canShowCreatorApply,
  canShowVendorApply,
  getSwitchableModes,
} from '../utils/workspaceRoles';
import type { UserActiveMode } from '../types';
import { getMainTabBarClearance } from '../design/tabBarLayout';
import { useQueryClient } from '@tanstack/react-query';
import { TravellerProfileTheme as TP } from '../features/travellerProfile/theme';
import { useTravellerWallet } from '../features/travellerProfile/hooks/useTravellerWallet';
import { useTravellerStats } from '../features/travellerProfile/hooks/useTravellerStats';
import { useMyTripsData } from '../features/myTrips/hooks/useMyTripsData';
import { loadTripFavoriteIds } from '../features/myTrips/tripFavorites';
import { getUserClaims } from '../services/api/campaigns';
import { travellerProfileKeys } from '../features/travellerProfile/queryKeys';
import { ProfileColors } from '../components/profile/profileTheme';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileCard } from '../components/profile/ProfileCard';
import { MyTripsCard } from '../components/profile/MyTripsCard';
import { PremiumBanner } from '../components/profile/PremiumBanner';
import { PromotionalCardsRow } from '../components/profile/PromotionalCard';
import {
  getUnreadBadgeCount,
  subscribeUnreadBadge,
} from '../services/notifications/notificationBadgeStore';
import {
  PersonalInformationModal,
  type PersonalInfoForm,
} from '../components/profile/PersonalInformationModal';
import type { GenderOption } from '../components/profile/personalInfoTheme';

const COLORS = {
  primary: TP.primary,
  secondary: TP.secondary,
  background: TP.bg,
  text: TP.text,
  textSecondary: TP.textSecondary,
  textMuted: '#B8A88A',
  border: TP.border,
  danger: '#EF4444',
};

function buildPersonalForm(u: UserProfile): PersonalInfoForm {
  const extra = u as UserProfile & {
    state?: string;
    gender?: GenderOption;
    dateOfBirth?: string;
    language?: string;
    username?: string;
  };
  return {
    displayName: u.displayName || '',
    username: extra.username || u.creatorProfile?.username || '',
    bio: u.bio || '',
    city: u.city || '',
    state: extra.state || '',
    gender: extra.gender || '',
    dateOfBirth: extra.dateOfBirth || '',
    language: extra.language || 'English',
    interests: [...(u.interests || u.travelInterests || [])],
    avatarUri: u.avatar || null,
    avatarStyle: u.avatarStyle || 0,
  };
}

interface ProfileScreenProps {
  user: UserProfile;
  places: TouristSpot[];
  vendors?: VendorBusiness[];
  vendorOffers?: VendorOffer[];
  isGuest?: boolean;
  onSelectSpot: (spot: TouristSpot) => void;
  onNavigateToHome?: () => void;
  onResetProgress?: () => void;
  onLogout?: () => void;
  onAdminVerification?: () => void;
  onAdminHiddenGemReview?: () => void;
  onAdminPlacesReview?: () => void;
  onOpenCredits?: () => void;
  onNavigateToWallet?: () => void;
  onNavigateToRewards?: () => void;
  onRewardsWallet?: () => void;
  onMyContributions?: () => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToCreateReel?: () => void;
  onBack?: () => void;
  onSettingsPress?: () => void;
  onPremiumPress?: () => void;
  /** When true, open the edit-profile modal on mount (e.g. Settings → Edit Profile). */
  openEdit?: boolean;
  hiddenGemSubmissions?: any[];
  onSubmitHiddenGem?: () => void;
  onRegisterVendor?: () => void;
  onSwitchRole?: (role: string) => Promise<void>;
}

export default function ProfileScreen({
  user: initialUser,
  places,
  vendors,
  vendorOffers: _vendorOffers,
  isGuest = false,
  onSelectSpot: _onSelectSpot,
  onLogout,
  onAdminVerification,
  onAdminHiddenGemReview,
  onAdminPlacesReview,
  onNavigateToWallet,
  onNavigateToRewards,
  onRewardsWallet,
  onMyContributions,
  onNavigateToLeaderboard,
  onNavigateToCreateReel: _onNavigateToCreateReel,
  onBack: _onBack,
  onSettingsPress,
  onPremiumPress,
  openEdit = false,
  hiddenGemSubmissions,
  onSubmitHiddenGem,
  onRegisterVendor,
  onSwitchRole,
}: ProfileScreenProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { isPremium, entitlements } = useEntitlements();
  const { setUser: setContextUser, user: contextUser, refreshSession } = useUserContext();
  const { currentVendor: ownedVendor } = useDataContext();

  const [user, setUser] = useState<UserProfile>(initialUser);

  const [showEditModal, setShowEditModal] = useState(!!openEdit);

  const [personalForm, setPersonalForm] = useState<PersonalInfoForm>(() => buildPersonalForm(initialUser));
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [palPoints, setPalPoints] = useState(initialUser.totalPoints || 0);
  const [unreadCount, setUnreadCount] = useState(getUnreadBadgeCount());

  const apiEnabled = !isGuest && DEV_FLAGS.USE_SERVER_API;
  const walletQuery = useTravellerWallet(apiEnabled, initialUser.totalPoints || 0);
  const statsQuery = useTravellerStats(user, apiEnabled);
  const tripsQuery = useMyTripsData(apiEnabled);
  const [savedTripCount, setSavedTripCount] = useState(0);
  const [unlockedRewards, setUnlockedRewards] = useState(0);

  useEffect(() => {
    return subscribeUnreadBadge(setUnreadCount);
  }, []);

  useEffect(() => {
    if (walletQuery.data?.palPoints == null) return;
    const pts = walletQuery.data.palPoints;
    setPalPoints(pts);
    setUser(prev => (prev.totalPoints === pts ? prev : { ...prev, totalPoints: pts }));
    setContextUser(prev => (prev.totalPoints === pts ? prev : { ...prev, totalPoints: pts }));
  }, [walletQuery.data?.palPoints, setContextUser]);

  useEffect(() => {
    if (openEdit) {
      setShowEditModal(true);
      setPersonalForm(buildPersonalForm(user));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEdit]);

  const openCreatorApplicationForm = () => {
    navigation.navigate('BecomeCreator');
  };

  const promptGuestSignIn = (actionLabel: string) => {
    Alert.alert(
      'Sign In Required',
      `Create an account or sign in to ${actionLabel}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(onLogout ? [{ text: 'Sign In', onPress: () => { void onLogout(); } }] : []),
      ],
    );
  };

  const openCreatorApplication = (isSwitch = false) => {
    if (isGuest) {
      promptGuestSignIn('apply as a creator');
      return;
    }
    if (isSwitch) {
      Alert.alert(
        'Switch to Creator?',
        'You already have a Vendor workspace.\nYou must deactivate Vendor before activating Creator.\n\nContinuing will retire your Vendor role and start Creator onboarding.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: () => openCreatorApplicationForm() },
        ],
      );
      return;
    }
    openCreatorApplicationForm();
  };

  const handleBecomeVendor = () => {
    if (isGuest) {
      promptGuestSignIn('register as a vendor');
      return;
    }
    // Same exclusivity rule as Creator apply: confirm before retiring Creator workspace
    if (vendorApplyIsSwitch) {
      Alert.alert(
        'Switch to Vendor?',
        'You already have a Creator workspace.\nYou must deactivate Creator before activating Vendor.\n\nContinuing will retire your Creator role and start Vendor onboarding.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: () => onRegisterVendor?.() },
        ],
      );
      return;
    }
    onRegisterVendor?.();
  };

  const loadWalletPoints = useCallback(async () => {
    if (!apiEnabled) {
      setPalPoints(initialUser.totalPoints || 0);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: travellerProfileKeys.wallet });
  }, [apiEnabled, initialUser.totalPoints, queryClient]);

  useEffect(() => {
    void loadWalletPoints();
  }, [loadWalletPoints]);

  // Re-pull roles + vendor status when opening Profile (covers admin approval while app stayed open)
  useFocusEffect(
    useCallback(() => {
      if (isGuest || !DEV_FLAGS.USE_SERVER_API) return;
      refreshSession().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['traveller-profile'] });
      void loadTripFavoriteIds().then(ids => setSavedTripCount(ids.length));
      getUserClaims()
        .then(res => {
          const list = Array.isArray(res)
            ? res
            : Array.isArray((res as { data?: unknown[] })?.data)
              ? (res as { data: { status?: string }[] }).data
              : [];
          const count = list.filter(row =>
            ['APPROVED', 'COMPLETED', 'DISPATCHED'].includes(String(row?.status || '').toUpperCase()),
          ).length;
          setUnlockedRewards(count);
        })
        .catch(() => setUnlockedRewards(0));
    }, [isGuest, refreshSession, queryClient]),
  );

  useEffect(() => {
    setUser(initialUser);
    setPersonalForm(buildPersonalForm(initialUser));
  }, [initialUser]);

  // Keep local profile in sync when workspace mode / roles / vendor status change from context
  useEffect(() => {
    if (!contextUser?.uid || contextUser.uid === 'guest-user') return;
    if (contextUser.uid !== user.uid) return;
    setUser(prev => ({
      ...prev,
      ...contextUser,
      activeMode: contextUser.activeMode || prev.activeMode,
      activeRole: contextUser.activeRole || prev.activeRole,
      roles: contextUser.roles || prev.roles,
      permission: contextUser.permission || prev.permission,
      vendor: (contextUser as any).vendor ?? (prev as any).vendor,
      creatorProfile: contextUser.creatorProfile ?? prev.creatorProfile,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contextUser.activeMode,
    contextUser.activeRole,
    contextUser.roles,
    contextUser.permission,
    contextUser.uid,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    (contextUser as any)?.vendor?.status,
    contextUser.creatorProfile?.status,
  ]);

  const hiddenGemsSubmitted = useMemo(() => {
    return hiddenGemSubmissions?.filter(s => s.userId === user.uid).length || 0;
  }, [hiddenGemSubmissions, user.uid]);

  const hiddenGemsPending = useMemo(() => {
    return hiddenGemSubmissions?.filter(s => s.userId === user.uid && s.status === 'pending').length || 0;
  }, [hiddenGemSubmissions, user.uid]);

  const hiddenGemsPoints = useMemo(() => {
    return hiddenGemSubmissions?.filter(s => s.userId === user.uid && s.status === 'approved')
      .reduce((sum, s) => sum + (s.pointsReward || 0), 0) || 0;
  }, [hiddenGemSubmissions, user.uid]);

  const handleEditProfileSave = async () => {
    if (!personalForm.displayName.trim()) {
      Alert.alert('Validation Error', 'Full name is required');
      return;
    }
    setUpdatingProfile(true);
    try {
      const updates: Partial<UserProfile> & Record<string, unknown> = {
        displayName: personalForm.displayName.trim(),
        bio: personalForm.bio.trim(),
        interests: personalForm.interests,
        travelInterests: personalForm.interests,
        city: personalForm.city.trim(),
        avatarStyle: personalForm.avatarStyle >= 0 ? personalForm.avatarStyle : user.avatarStyle,
        avatar: personalForm.avatarUri ?? undefined,
        state: personalForm.state,
        gender: personalForm.gender,
        dateOfBirth: personalForm.dateOfBirth,
        language: personalForm.language,
        username: personalForm.username.trim(),
      };
      await updateUserProfile(user.uid, updates as Partial<UserProfile>);

      const updatedUser = { ...user, ...updates } as UserProfile;
      setUser(updatedUser);
      setContextUser(updatedUser);

      setShowEditModal(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const listedVendor = user.vendor?.id ? vendors?.find(v => v.id === user.vendor?.id) : undefined;
  const currentVendor = ownedVendor || listedVendor;
  // Prefer context for workspace capability — local `user` can lag behind setActiveMode
  const roles = (contextUser.roles || user.roles || []).map(String);
  const creatorStatus = contextUser.creatorProfile?.status || user.creatorProfile?.status;
  const creatorPending = creatorStatus === 'PENDING';
  const authVendorStatus = String(
    (contextUser as any)?.vendor?.status || (user as any)?.vendor?.status || '',
  ).toUpperCase();
  const vendorStatusRaw = String(
    currentVendor?.verificationStatus || authVendorStatus || '',
  ).toUpperCase();
  const vendorPending = vendorStatusRaw === 'PENDING' || authVendorStatus === 'PENDING';

  // ONE specialty workspace per account (Creator XOR Vendor).
  // Hide apply cards once approved; pending blocks the other role's apply cards too.
  const creatorApplyIsSwitch = false;
  const vendorApplyIsSwitch = false;
  const showCreatorApply = !isGuest && canShowCreatorApply(contextUser, vendorStatusRaw);
  const showVendorApply = !isGuest && canShowVendorApply(contextUser, vendorStatusRaw);
  const switchableModes = useMemo(
    (): UserActiveMode[] => getSwitchableModes(contextUser || user, vendorStatusRaw),
    [contextUser, user, vendorStatusRaw],
  );

  const profileVerified =
    !!user.creatorProfile?.verified || roles.includes('ADMIN') || isPremium;

  const handleAvatarPick = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.7, selectionLimit: 1 },
      response => {
        if (response.didCancel || response.errorCode) return;
        const uri = response.assets?.[0]?.uri;
        if (uri) {
          const updated = { ...user, avatar: uri };
          setUser(updated);
          setContextUser(updated);
          setPersonalForm(prev => ({ ...prev, avatarUri: uri, avatarStyle: -1 }));
        }
      },
    );
  };

  const guardNav = useCallback(
    (actionLabel: string, fn: () => void) => {
      if (isGuest) {
        promptGuestSignIn(actionLabel);
        return;
      }
      fn();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isGuest, onLogout],
  );



  const stats = statsQuery.data ?? {
    tripsCompleted: 0,
    placesVisited: user.visitedSpots?.length ?? 0,
    reelsShared: user.createdReels?.length ?? 0,
    followers: user.creatorProfile?.followerCount ?? 0,
  };

  const tripCounts = useMemo(() => {
    const trips = tripsQuery.trips;
    const upcoming = trips.filter(t => ['UPCOMING', 'ACTIVE'].includes(String(t.status || '').toUpperCase())).length;
    const completed = trips.filter(t => String(t.status || '').toUpperCase() === 'COMPLETED').length;
    const drafts = trips.filter(t => String(t.status || '').toUpperCase() === 'DRAFT').length;
    const saved = savedTripCount || trips.filter(t => String(t.status || '').toUpperCase() !== 'ARCHIVED').length;
    return { upcoming, completed, drafts, saved };
  }, [tripsQuery.trips, savedTripCount]);

  const locationLabel = useMemo(() => {
    const extra = user as UserProfile & { state?: string };
    const city = user.city?.trim();
    const state = extra.state?.trim();
    if (city && state) return `${city}, ${state}`;
    return city || state || '';
  }, [user]);

  const tabClearance = getMainTabBarClearance(insets.bottom);

  const profileListHeader = (
    <>
      <ProfileHeader
        unreadCount={unreadCount}
        onNotificationPress={() => navigation.navigate('Notifications')}
        onSettingsPress={() => guardNav('open settings', () => onSettingsPress?.())}
      />

      <ProfileCard
        name={user.displayName || 'Traveller'}
        avatarUri={user.avatar || null}
        location={locationLabel}
        email={user.email || ''}
        points={palPoints}
        unlockedRewards={unlockedRewards}
        onEditPress={() => setShowEditModal(true)}
        onCameraPress={handleAvatarPick}
        onWalletPress={() => guardNav('view your wallet', () => onNavigateToWallet?.())}
        onRewardsPress={() => guardNav('view rewards', () => onNavigateToRewards?.())}
      />

      <MyTripsCard
        upcomingCount={tripCounts.upcoming}
        completedCount={tripCounts.completed || stats.tripsCompleted || 0}
        savedCount={tripCounts.saved}
        draftsCount={tripCounts.drafts}
        onViewAll={() => navigation.navigate('MyTrips')}
        onPressUpcoming={() => navigation.navigate('MyTrips', { initialTab: 'UPCOMING' })}
        onPressCompleted={() => navigation.navigate('MyTrips', { initialTab: 'COMPLETED' })}
        onPressSaved={() => navigation.navigate('MyTrips', { initialTab: 'DRAFT' })}
        onPressDrafts={() => navigation.navigate('MyTrips', { initialTab: 'DRAFT' })}
      />

      {!isPremium && onPremiumPress ? (
        <PremiumBanner onUpgradePress={onPremiumPress} />
      ) : null}

      {showCreatorApply || showVendorApply ? (
        <PromotionalCardsRow
          showCreator={showCreatorApply}
          showVendor={showVendorApply}
          onApplyCreator={() => openCreatorApplication(creatorApplyIsSwitch)}
          onApplyVendor={handleBecomeVendor}
        />
      ) : null}

      {creatorPending ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Creator application pending</Text>
          <Text style={styles.noticeSub}>
            {user.creatorProfile?.username
              ? `@${user.creatorProfile.username} is under review.`
              : 'Your application is under review.'}
          </Text>
        </View>
      ) : null}

      {vendorPending ? (
        <View style={[styles.noticeCard, creatorPending ? { marginTop: 10 } : null]}>
          <Text style={styles.noticeTitle}>Vendor application pending</Text>
          <Text style={styles.noticeSub}>Your business profile is under review.</Text>
        </View>
      ) : null}

      {switchableModes.length > 1 && onSwitchRole ? (
        <View style={{ marginBottom: 16 }}>
          <ProfileModeSwitcher
            modes={switchableModes}
            activeMode={contextUser.activeMode || user.activeMode || 'USER'}
            onSwitch={onSwitchRole}
            variant="inline"
          />
        </View>
      ) : null}

      {onMyContributions && hiddenGemsSubmitted > 0 ? (
        <TouchableOpacity style={styles.linkBtn} onPress={onMyContributions}>
          <Text style={styles.linkBtnText}>View my Hidden Gem contributions</Text>
        </TouchableOpacity>
      ) : null}

      {roles.includes('ADMIN') && (onAdminVerification || onAdminHiddenGemReview || onAdminPlacesReview) ? (
        <View style={styles.adminBlock}>
          <Text style={styles.adminBlockTitle}>Admin Dashboard</Text>

          {onAdminVerification ? (
            <>
              <Text style={styles.adminSectionLabel}>Business</Text>
              <TouchableOpacity
                style={[styles.adminCard, { backgroundColor: theme.surface }]}
                onPress={onAdminVerification}
              >
                <View style={[styles.adminCardIcon, { backgroundColor: COLORS.primary + '18' }]}>
                  <Icon name="storefront-outline" size={22} color={COLORS.primary} />
                </View>
                <View style={styles.adminInfo}>
                  <Text style={[styles.adminTitle, { color: theme.text }]}>Vendor verification</Text>
                  <Text style={[styles.adminDesc, { color: theme.textSecondary }]}>Approve or reject vendor applications</Text>
                </View>
                <Icon name="chevron-forward" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}

          <Text style={styles.adminSectionLabel}>Content</Text>
          {onAdminPlacesReview ? (
            <TouchableOpacity
              style={[styles.adminCard, { backgroundColor: theme.surface }]}
              onPress={onAdminPlacesReview}
            >
              <View style={[styles.adminCardIcon, { backgroundColor: COLORS.primary + '18' }]}>
                <Icon name="map-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={styles.adminInfo}>
                <Text style={[styles.adminTitle, { color: theme.text }]}>Places review</Text>
                <Text style={[styles.adminDesc, { color: theme.textSecondary }]}>Approve curated place listings</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.adminCard, { backgroundColor: theme.surface }]}
            onPress={() => navigation.navigate('AdminReels')}
          >
            <View style={[styles.adminCardIcon, { backgroundColor: COLORS.primary + '18' }]}>
              <Icon name="videocam-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.adminInfo}>
              <Text style={[styles.adminTitle, { color: theme.text }]}>All Reels</Text>
              <Text style={[styles.adminDesc, { color: theme.textSecondary }]}>View, feature or delete creator reels</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>

          <Text style={styles.adminSectionLabel}>Community</Text>
          {onAdminHiddenGemReview ? (
            <TouchableOpacity
              style={[styles.adminCard, { backgroundColor: theme.surface }]}
              onPress={onAdminHiddenGemReview}
            >
              <View style={[styles.adminCardIcon, { backgroundColor: COLORS.primary + '18' }]}>
                <Icon name="diamond-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={styles.adminInfo}>
                <Text style={[styles.adminTitle, { color: theme.text }]}>Hidden gems</Text>
                <Text style={[styles.adminDesc, { color: theme.textSecondary }]}>Review community place submissions</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.adminCard, { backgroundColor: theme.surface }]}
            onPress={() => navigation.navigate('AdminClaimsReview')}
          >
            <View style={[styles.adminCardIcon, { backgroundColor: COLORS.primary + '18' }]}>
              <Icon name="gift-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.adminInfo}>
              <Text style={[styles.adminTitle, { color: theme.text }]}>Reward claims</Text>
              <Text style={[styles.adminDesc, { color: theme.textSecondary }]}>View and dispatch user reward claims</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: ProfileColors.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={ProfileColors.bg} translucent />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: tabClearance,
        }}
        showsVerticalScrollIndicator={false}
      >
        {profileListHeader}
        
        {isGuest && (
          <View style={{ marginTop: 24 }}>
            <TouchableOpacity style={[styles.signInCard, { backgroundColor: theme.surface }]} onPress={onLogout}>
              <View style={[styles.signInIconWrap, { backgroundColor: COLORS.primary + '15' }]}>
                <Icon name="log-out-outline" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.signInInfo}>
                <Text style={[styles.signInTitle, { color: theme.text }]}>Logout</Text>
                <Text style={[styles.signInDesc, { color: theme.textSecondary }]}>Exit guest mode and sign in</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <PersonalInformationModal
        visible={showEditModal}
        saving={updatingProfile}
        email={user.email}
        phoneNumber={user.phoneNumber}
        emailVerified={!!user.email}
        form={personalForm}
        onChange={patch => setPersonalForm(prev => ({ ...prev, ...patch }))}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditProfileSave}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: { paddingBottom: 8 },
  sectionGap: { marginTop: 12, marginBottom: 4 },
  workspaceSubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E9D4BE',
    padding: 14,
  },
  workspaceSubIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceSubCopy: { flex: 1, minWidth: 0 },
  workspaceSubTitle: { fontSize: 15, fontWeight: '800', color: TP.text },
  workspaceSubSub: { fontSize: 12, color: TP.textSecondary, marginTop: 3, lineHeight: 17 },
  noticeCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TP.border,
    padding: 14,
  },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  noticeSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  linkBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  linkBtnText: { fontSize: 14, fontWeight: '600', color: TP.secondary },
  adminBlock: { marginTop: 20, gap: 8 },
  adminBlockTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 },
  adminSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 6,
  },
  roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChoice: { borderWidth: 1, borderColor: '#D9B88C', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  roleChoiceActive: { backgroundColor: '#B9834B', borderColor: '#B9834B' },
  roleChoiceText: { color: '#63300E', fontSize: 12, fontWeight: '700' },
  roleChoiceTextActive: { color: '#fff' },
  applicationUnavailable: { color: '#8B7355', fontSize: 12, fontWeight: '600', marginTop: 8 },
  content: { flex: 1 },

  // Hero Section
  heroSection: {
    paddingTop: 0,
    paddingBottom: 10,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroProfile: {
    alignItems: 'center',
    marginBottom: 10,
  },
  heroAvatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroAvatarEmoji: { fontSize: 28 },
  heroAvatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 2 },
  heroBio: { fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 6, lineHeight: 16, paddingHorizontal: 20 },
  heroLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  heroLevelText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 1 },
  heroStatLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  heroStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center' },

  // Section Containers
  promosContainer: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionCount: { fontSize: 13, fontWeight: '600' },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionLinkText: { fontSize: 13, fontWeight: '600', color: '#D4AF37' },

  // Progress Cards
  progressCard: {
    padding: 18,
    borderRadius: 20,
  },
  progressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressLevelName: { fontSize: 16, fontWeight: '700' },
  progressLevelNum: { fontSize: 12, marginTop: 2 },
  xpPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  xpPillText: { fontSize: 13, fontWeight: '800' },
  xpNextLabel: { fontSize: 12, marginTop: 10, fontWeight: '500' },

  // Badges Grid
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Creator Card
  creatorCard: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
  },
  creatorCardIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  creatorCardContent: { flex: 1 },
  creatorCardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  creatorCardDesc: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  creatorCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  creatorCardActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Status Card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
  },
  statusIconWrap: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  statusDesc: { fontSize: 12, lineHeight: 17 },

  // Admin Card
  adminCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 8 },
  adminCardIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  adminInfo: { flex: 1 },
  adminTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  adminDesc: { fontSize: 12 },

  // Offer Card
  offerCard: { borderRadius: 16, padding: 16, marginBottom: 10 },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  offerVendorInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offerVendorDot: { width: 8, height: 8, borderRadius: 4 },
  offerVendor: { fontSize: 14, fontWeight: '600' },
  offerStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  offerStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  offerTitle: { fontSize: 12, marginBottom: 10, marginLeft: 16 },
  offerFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 16 },
  pointsUsedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pointsUsedText: { fontSize: 12, fontWeight: '700' },
  offerCodeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  offerCode: { fontSize: 12, fontWeight: '600' },

  // Empty State
  emptyState: { alignItems: 'center', padding: 32, borderRadius: 20 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyText: { fontSize: 13, textAlign: 'center' },

  // Spot Card
  spotCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 8 },
  spotEmojiWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  spotEmoji: { fontSize: 22 },
  spotInfo: { flex: 1 },
  spotName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  spotLocation: { fontSize: 12 },

  // Sign In Card
  signInCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18 },
  signInIconWrap: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  signInInfo: { flex: 1, marginRight: 8 },
  signInTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  signInDesc: { fontSize: 12, lineHeight: 18 },

  bottomSpacing: { height: 100 },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '82%', paddingBottom: 30 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)', alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  modalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalBarTitle: { fontSize: 18, fontWeight: '800' },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flex: 1, padding: 20 },

  // Form Fields
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  fieldInput: { height: 50, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, fontSize: 15 },

  // Avatar Selector
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  avatarOption: { width: 54, height: 54, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, position: 'relative' },
  avatarSelected: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },

  // Submit Button
  submitBtn: { height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  locBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // App Notice
  appNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  appNoticeText: { fontSize: 13, fontWeight: '600', flex: 1 },
});
