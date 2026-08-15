import { NavigatorScreenParams } from '@react-navigation/native';

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
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Map: {
    selectedPlaceId?: string;
    selectedPlaceKey?: number;
    /** Open Map on Places or Vendors layer (e.g. Home → Local Vendors) */
    initialMapTab?: 'places' | 'vendors';
    mapTabKey?: number;
    /** PalPoints “Write now” — open Vendors tab and prompt user to pick a business */
    reviewMode?: boolean;
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

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  HowItWorks: undefined;
  TreasureHunt: undefined;
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
  TripPreview: { tripId: string };
  VendorRegister: undefined;
  BecomeCreator: undefined;
  UserProfile: { openEdit?: boolean } | undefined;
  SpotDetail: { spotId: string };
  AdminCreatePlace: undefined;
  VendorOffers: undefined;
  VendorOfferDetail: { offerId: string };
  VendorDashboard: undefined;
  CreateOffer: { offerId?: string };
  VendorCustomers: undefined;
  PremiumUpgrade: undefined;
  UserPremium: undefined;
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
  CreateReel: { sourceReelId?: string; captionHint?: string; collaborationId?: string; prefillPlaceId?: string; prefillPlaceName?: string; editReel?: any; suppressSuccessAlert?: boolean } | undefined;
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
  Wallet: undefined;
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
