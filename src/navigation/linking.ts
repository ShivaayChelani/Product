import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Production deep links / App Links.
 * Custom scheme: palsafar://
 * HTTPS App Links: https://palsafar.com (requires assetlinks.json on the host).
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'palsafar://',
    'https://palsafar.com',
    'https://www.palsafar.com',
  ],
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          Home: 'home',
          Explore: 'reels',
          Map: 'map',
          Itinerary: 'trips',
          Profile: 'profile',
        },
      },
      SpotDetail: 'place/:spotId',
      VendorProfile: {
        path: 'vendor/:vendorId',
        parse: {
          vendorId: (id: string) => id,
        },
      },
      TripDetail: 'trip/:tripId',
      ReelDetail: 'reel/:reelId',
      LegalDocument: {
        path: 'legal/:type',
        parse: {
          type: (type: string) => type as RootStackParamList['LegalDocument']['type'],
        },
      },
      LegalHub: 'legal',
      Rewards: 'rewards',
      Wallet: 'wallet',
      Settings: 'settings',
      Notifications: 'notifications',
      CollaborationsDashboard: 'collaborations',
      CollaborationDetail: 'collaboration/:collaborationId',
      CollaborationReview: 'collaboration/:collaborationId/review',
      CollaborationRequest: 'collaboration/request/:creatorProfileId',
      Auth: {
        path: 'auth',
        screens: {
          LoginSplash: '',
          Login: 'login',
          Signup: 'signup',
          ForgotPassword: 'forgot-password',
          // Phone / OTP routes intentionally omitted from deep links for closed beta.
          // Screens remain registered in AuthNavigator for a future release.
        },
      },
    },
  },
};
