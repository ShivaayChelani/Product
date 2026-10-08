import { NavigatorScreenParams } from '@react-navigation/native';
import type { EventType } from '../services/api/events';
import type { MapLayerTab } from '../features/mapExplore/utils/mapSegmentThumb';

export type AuthStackParamList = {
  Onboarding: undefined;
  LoginSplash: undefined;
  Login: undefined;
  Signup: undefined;
  EmailVerification: { email: string; from?: 'login' | 'signup' };
  /** Reserved for future phone-OTP signup — not used in beta registration flow. */
  PhoneNumber: {
    signupDraft?: { name: string; email: string; password: string };
    initialPhone?: string;
  };
  ForgotPassword: undefined;
  /** Reserved for future phone-OTP signup — not used in beta registration flow. */
  OTPVerification: {
    phoneNumber: string;
    signupDraft?: { name: string; email: string; password: string };
  };
  /** Legal document browser accessible in unauthenticated state (from signup screen). */
  AuthLegalHub: undefined;
  /** Single legal document view accessible in unauthenticated state (from signup screen). */
  AuthLegalDocument: {
    type: 'PRIVACY_POLICY' | 'TERMS_CONDITIONS' | 'REWARDS_POLICY' | 'COMMUNITY_GUIDELINES' | 'VENDOR_TERMS' | 'CREATOR_TERMS' | 'REFUND_POLICY' | 'ABOUT_US' | 'CONTACT_INFO' | 'FAQ';
    title?: string;
  };
};


export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Map: {
    selectedPlaceId?: string;
    selectedPlaceKey?: number;
    /** Map → Vendor “View on Map”: open this vendor’s detail card on the Vendors layer */
    selectedVendorId?: string;
    /** Open Map on the Places, Events or Vendors layer (e.g. Home → Local Vendors) */
    initialMapTab?: MapLayerTab;
    mapTabKey?: number;
    /** PalPoints “Write now” — open Vendors tab and prompt user to pick a business */
    reviewMode?: boolean;
    /**
     * Internal PalSafar directions. Every non-ride "take me there" affordance
     * routes through the Map screen rather than launching an external maps app.
     * See `features/mapExplore/utils/internalDirections.ts`.
     */
    directions?: {
      latitude: number;
      longitude: number;
      label?: string | null;
      /** Which workspace asked, for diagnostics. */
      context?: string;
    };
    /** Monotonic token so the same destination can be re-routed on purpose. */
    directionsKey?: number;
  } | undefined;
  Itinerary: undefined;
  Profile: undefined;
};

/** Vendor app shell — five tabs: Home · Offers · Promotions · Statistics · Business */
export type VendorTabParamList = {
  Home: undefined;
  Offers: undefined;
  Promotions: undefined;
  Statistics: undefined;
  Business: undefined;
};

export type CreatorTabParamList = {
  Dashboard: undefined;
  Create: undefined;
  Collaboration: { bucket?: string; embeddedInTab?: boolean; role?: 'creator' | 'vendor' } | undefined;
  Reels:
    | {
        initialTab?:
          | 'HIDDEN'
          | 'PENDING'
          | 'REJECTED'
          | 'APPROVED'
          | 'DRAFT'
          | 'ARCHIVED'
          | 'SCHEDULED';
      }
    | undefined;
  Profile: undefined;
};

/**
 * A location chosen on the Add Event map picker.
 *
 * Handed back through `AddEvent` params (merged) rather than a callback in the
 * params object, because React Navigation params must stay serialisable.
 */
export type PickedEventLocation = {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  /** Monotonic so re-picking the same coordinate still re-applies the result. */
  pickedAt: number;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  HowItWorks: undefined;
  TreasureHuntLanding: undefined;
  TreasureHuntActive: { huntId: string; riddleId: string };
  TreasureHuntSuccess: { huntId: string; rewardCoins: number; completed: boolean; city?: string };
  VendorTabs: NavigatorScreenParams<VendorTabParamList> | undefined;
  CreatorTabs: NavigatorScreenParams<CreatorTabParamList> | undefined;
  UploadPlacePhoto: undefined;
  TripBuilder: { tripId?: string } | undefined;
  AITripPlanner: undefined;
  SelectPlacesForTrip: {
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
  ItineraryScreen: { addedPlaceId?: string } | undefined;
  GenerateLoading: {
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
    manualPlaceIds?: string[];
    fillWithAi?: boolean;
  } | undefined;
  MyTrips: { initialTab?: 'UPCOMING' | 'DRAFT' | 'COMPLETED' } | undefined;
  CreateTrip: undefined;
  TripDetail: { tripId: string; warnings?: string[]; note?: string; resume?: boolean; mode?: 'resume' | 'view' };
  TripShared: { token: string };
  TripPreview: { tripId: string };
  VendorRegister: undefined;
  BecomeCreator: undefined;
  UserProfile: { openEdit?: boolean } | undefined;
  SpotDetail: { spotId: string };
  AdminCreatePlace: undefined;
  /** Community Events discovery feed (list, filters, pagination). */
  Events: { initialType?: EventType } | undefined;
  /** Single Community Event. `eventIdOrSlug` accepts the cuid or the slug. */
  EventDetail: { eventIdOrSlug: string };
  /**
   * Create a Community Event (owner-scoped, lands in PENDING review).
   * `pickedLocation` is merged back in by the map picker when it returns.
   */
  AddEvent:
    | { pickedLocation?: PickedEventLocation; pickedNonce?: number }
    | undefined;
  /** Map-based location picker for AddEvent; returns through `AddEvent` params. */
  PickEventLocation:
    | { latitude?: number; longitude?: number; address?: string; city?: string; state?: string }
    | undefined;
  /** The caller's own submissions with moderation status (PENDING/REJECTED). */
  MyEvents: undefined;
  VendorOffers: undefined;
  VendorOfferDetail: { offerId: string };
  VendorDashboard: undefined;
  CreateOffer: { offerId?: string };
  VendorCustomers: undefined;
  PremiumUpgrade: undefined;
  CreatorSubscription: undefined;
  BillingHistory: undefined;
  VendorSubscription: undefined;
  VendorListingPreview: undefined;
  VendorPalPointsPartner: undefined;
  RazorpayCheckout: {
    planId: string;
    period: 'MONTHLY' | 'SEMIANNUAL' | 'YEARLY' | 'QUARTERLY' | 'LIFETIME';
    planName?: string;
    amountPaise?: number;
    orderId: string;
    keyId: string;
    currency?: string;
    prefillEmail?: string;
    prefillName?: string;
  };
  AdminVendorVerification: undefined;
  AdminHiddenGemReview: undefined;
  AdminPlacesReview: undefined;
  AdminClaimsReview: undefined;
  AdminReels: undefined;
  AddHiddenGem: undefined;
  MyContributions: undefined;
  RewardsWallet: undefined;
  Memories: undefined;
  CreateReel: { sourceReelId?: string; captionHint?: string; collaborationId?: string; prefillPlaceId?: string; prefillPlaceName?: string; editReel?: any; suppressSuccessAlert?: boolean; revisionNote?: string; prefillMediaUri?: string } | undefined;
  PlaceReels: { placeId: string; placeName: string; placeCity?: string; placeState?: string; placeImage?: string | null; };
  CreateVendorReel: undefined;
  ReelDetail: { reelId: string; reels?: any[]; initialIndex?: number };
  VendorReels: { vendorId: string; vendorName: string };
  VendorReelsManagement: undefined;
  CreatorProfile: { username: string };
  CreatorAnalytics: undefined;
  CreatorStudioSettings: undefined;
  CollaborationsDashboard: {
    bucket?: 'incoming' | 'accepted' | 'active' | 'completed' | 'cancelled' | 'history';
    embeddedInTab?: boolean;
    role?: 'creator' | 'vendor';
  } | undefined;
  CollaborationRequest: { creatorProfileId: string; creatorName?: string };
  CollaborationDetail: { collaborationId: string };
  CollaborationReview: { collaborationId: string };
  Credits: undefined;
  Wallet: { initialTab?: 'earn' | 'history' | 'vendor' } | undefined;
  PalPointsScreen: undefined;
  Rewards: undefined;
  Leaderboard: undefined;
  VendorAnalytics: { vendorId: string; vendorName: string };
  PayPoints: { vendorCode?: string };
  VendorProfile: { vendorId: string; self?: boolean; initialTab?: 'offers' | 'reels' | 'info'; openReview?: boolean };
  VendorSettings: undefined;
  Settings: undefined;
  /** Dev-only crash reporting QA screen */
  CrashTest: undefined;
  DevNotificationTest: undefined;
  ChangePassword: undefined;
  DeleteAccount: undefined;
  PrivacySettings: undefined;
  NotificationSettings: undefined;
  LanguageSettings: undefined;
  ThemeSettings: undefined;
  SecuritySettings: undefined;
  StorageSettings: undefined;
  OfflineSettings: undefined;
  ActiveSessions: undefined;
  BlockList: undefined;
  Licenses: undefined;
  Feedback: { category?: 'bug' | 'feature' | 'support' | 'rating_fallback' | 'general'; title?: string } | undefined;
  Notifications: undefined;
  Search: {
    initialQuery?: string;
    categoryId?: string;
    mode?: 'replace' | 'itinerary';
    stopId?: string;
    tripId?: string;
    destination?: string;
    excludePlaceIds?: string[];
  } | undefined;
  LegalHub: undefined;
  LegalDocument: {
    type: 'PRIVACY_POLICY' | 'TERMS_CONDITIONS' | 'REWARDS_POLICY' | 'COMMUNITY_GUIDELINES' | 'VENDOR_TERMS' | 'CREATOR_TERMS' | 'REFUND_POLICY' | 'ABOUT_US' | 'CONTACT_INFO' | 'FAQ';
    title?: string;
  };
};

/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-empty-object-type */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
