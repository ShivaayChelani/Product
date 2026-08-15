import { Platform } from 'react-native';
import { DEV_FLAGS } from './devFlags';

/**
 * Normalize any configured API root to the backend mount: `/api/v1`.
 */
export function normalizeApiV1BaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/\/api\/v1$/i.test(trimmed)) return trimmed;
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

/**
 * Closed-beta local API selection.
 * Physical devices cannot use localhost — set DEV_FLAGS.LOCAL_API_HOST to the
 * LAN IP of the machine running the API. Emulators:
 *   Android → 10.0.2.2   |   iOS Simulator → localhost
 */
const WANT_LOCAL_API = Boolean(__DEV__ && DEV_FLAGS.USE_LOCAL_API);

const REMOTE_API_URL = 'https://palsafar-api-fh7i.onrender.com/api/v1';

function resolveBaseUrl(): string {
  if (!WANT_LOCAL_API) {
    return REMOTE_API_URL;
  }
  const configured = (DEV_FLAGS.LOCAL_API_HOST || '').trim();
  if (Platform.OS === 'android') {
    const host = configured || '10.0.2.2';
    return `http://${host}:5000/api/v1`;
  }
  // iOS Simulator can reach the host via localhost; physical iPhone needs LAN IP.
  const host = configured || 'localhost';
  return `http://${host}:5000/api/v1`;
}

const RESOLVED_BASE_URL = resolveBaseUrl();

export const API_CONFIG = {
  baseUrl: RESOLVED_BASE_URL,
  timeout: 60000,
  endpoints: {
    auth: {
      register: '/auth/register',
      verifyRegisterEmail: '/auth/register/verify-email',
      resendRegisterOtp: '/auth/register/resend-otp',
      login: '/auth/login',
      me: '/auth/me',
      refresh: '/auth/refresh',
      logout: '/auth/logout',
      activeMode: '/auth/active-mode',
      activeRole: '/auth/active-role',
    },
    users: {
      list: '/users',
      byId: (id: string) => `/users/${id}`,
      role: (id: string) => `/users/${id}/role`,
    },
    places: {
      list: '/places',
      mine: '/places/mine',
      byId: (id: string) => `/places/${id}`,
      status: (id: string) => `/places/${id}/status`,
      search: '/places/search',
      trending: '/places/trending',
      hiddenGems: '/places/hidden-gems',
      recommendations: (id: string) => `/places/${id}/recommendations`,
      viewport: '/places/viewport',
      map: '/places/map',
      mapCategories: '/places/map/categories',
      adminPending: '/admin/places/pending',
      adminApprove: (id: string) => `/admin/places/${id}/approve`,
      adminReject: (id: string) => `/admin/places/${id}/reject`,
      images: (id: string) => `/places/${id}/images`,
    },
    hiddenGems: {
      list: '/hidden-gems',
      byId: (id: string) => `/hidden-gems/${id}`,
      approve: (id: string) => `/admin/hidden-gems/${id}/approve`,
      reject: (id: string) => `/admin/hidden-gems/${id}/reject`,
    },
    trips: {
      list: '/trips',
      byId: (id: string) => `/trips/${id}`,
      create: '/trips',
      update: (id: string) => `/trips/${id}`,
      delete: (id: string) => `/trips/${id}`,
      duplicate: (id: string) => `/trips/${id}/duplicate`,
      addStop: (dayId: string) => `/trips/days/${dayId}/stops`,
      updateStop: (stopId: string) => `/trips/stops/${stopId}`,
      deleteStop: (stopId: string) => `/trips/stops/${stopId}`,
      reorderStops: (dayId: string) => `/trips/days/${dayId}/stops/reorder`,
      generateItinerary: (id: string) => `/trips/${id}/generate`,
      optimizeRoute: (id: string) => `/trips/${id}/optimize`,
      aiGenerate: '/trips/ai-generate',
      replaceStop: (stopId: string) => `/trips/stops/${stopId}/replace`,
      quickAdd: '/trips/quick-add',
      addCollaborator: (id: string) => `/trips/${id}/collaborators`,
      removeCollaborator: (id: string, userId: string) => `/trips/${id}/collaborators/${userId}`,
      updateCollaboratorRole: (id: string, userId: string) => `/trips/${id}/collaborators/${userId}`,
      start: (id: string) => `/trips/${id}/start`,
      complete: (id: string) => `/trips/${id}/complete`,
      progress: (id: string) => `/trips/${id}/progress`,
      history: '/trips/history/completed',
      visitStop: (stopId: string) => `/trips/stops/${stopId}/visit`,
      skipStop: (stopId: string) => `/trips/stops/${stopId}/skip`,
    },
    vendors: {
      list: '/vendors',
      nearby: '/vendors/nearby',
      mapList: '/vendors/map-list',
      locationSearch: '/vendors/location-search',
      map: '/vendors/map',
      register: '/vendors/register',
      me: '/vendors/me',
      listingPreview: '/vendors/me/listing-preview',
      byId: (id: string) => `/vendors/${id}`,
      details: (id: string) => `/vendors/${id}/details`,
      taggedReels: (id: string) => `/vendors/${id}/tagged-reels`,
      myTaggedReels: '/vendors/me/tagged-reels',
      allowTaggedReel: (reelId: string) => `/vendors/me/tagged-reels/${reelId}/allow`,
      rejectTaggedReel: (reelId: string) => `/vendors/me/tagged-reels/${reelId}/reject`,
      reviews: (id: string) => `/vendors/${id}/reviews`,
      review: (id: string) => `/vendors/${id}/review`,
      reviewHelpful: (id: string, reviewId: string) => `/vendors/${id}/reviews/${reviewId}/helpful`,
      createReel: '/vendors/reels',
      reels: (id: string) => `/vendors/${id}/reels`,
      deleteReel: (reelId: string) => `/vendors/reels/${reelId}`,
      updateReel: (reelId: string) => `/vendors/reels/${reelId}`,
      verify: (id: string) => `/vendors/${id}/verify`,
      location: (id: string) => `/vendors/${id}/location`,
      offers: {
        list: '/vendors/offers',
        mine: '/vendors/offers/mine',
        byId: (id: string) => `/vendors/offers/${id}`,
        create: '/vendors/offers',
        update: (id: string) => `/vendors/offers/${id}`,
        delete: (id: string) => `/vendors/offers/${id}`,
        pause: (id: string) => `/vendors/offers/${id}/pause`,
        resume: (id: string) => `/vendors/offers/${id}/resume`,
        duplicate: (id: string) => `/vendors/offers/${id}/duplicate`,
        view: (id: string) => `/vendors/offers/${id}/view`,
        click: (id: string) => `/vendors/offers/${id}/click`,
      },
      dashboard: '/vendors/me/dashboard',
      analytics: '/vendors/me/analytics',
      offerAnalytics: (id: string) => `/vendors/me/offers/${id}/analytics`,
    },
    wallet: {
      profile: '/wallet/profile',
      transactions: '/wallet/transactions',
      earn: '/wallet/earn',
      spend: '/wallet/spend',
      adjust: (userId: string) => `/wallet/adjust/${userId}`,
    },
    rewards: {
      list: '/rewards',
      byId: (id: string) => `/rewards/${id}`,
      offers: '/rewards/offers',
      nearby: '/rewards/nearby',
    },
    pointRules: {
      list: '/point-rules',
      byKey: (key: string) => `/point-rules/${key}`,
    },
    sync: {
      batch: '/sync/batch',
      pending: '/sync/pending',
      status: '/sync/status',
    },
    upload: {
      single: '/upload/single',
      multiple: '/upload/multiple',
      video: '/upload/video',
      delete: '/upload',
    },
    notifications: {
      registerToken: '/notifications/register-token',
      unregisterToken: '/notifications/unregister-token',
      list: '/notifications',
      markRead: '/notifications/mark-read',
      markAllRead: '/notifications/mark-all-read',
    },
    placeImages: {
      contribute: (id: string) => `/places/${id}/contribute-image`,
      contributionStatus: (id: string) => `/places/${id}/contribution-status`,
    },
    collaborations: {
      create: '/collaborations',
      vendor: '/collaborations/vendor',
      creator: '/collaborations/creator',
      byId: (id: string) => `/collaborations/${id}`,
      canCollaborate: (creatorProfileId: string) => `/collaborations/vendor/can-collaborate/${creatorProfileId}`,
    },
    health: '/health',
    routing: {
      directions: '/routing/directions',
    },
  },
};

export function apiUrl(path: string): string {
  return `${API_CONFIG.baseUrl}${path}`;
}
