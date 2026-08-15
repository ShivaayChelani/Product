import type { RootStackParamList } from '../../navigation/types';

/** Canonical push / in-app notification data contract. */
export type NotificationRouteTarget = {
  screen: keyof RootStackParamList;
  params?: RootStackParamList[keyof RootStackParamList];
};

export type NormalizedNotificationPayload = {
  type: string;
  screen?: string;
  entityId?: string;
  notificationId?: string;
  params: Record<string, string>;
  title?: string;
  body?: string;
};

function asStringRecord(data: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

/** Infer navigation target from notification type + data. */
function mapEntityToScreenParams(
  screen: keyof RootStackParamList,
  entityId?: string,
  params: Record<string, string> = {},
): RootStackParamList[keyof RootStackParamList] | undefined {
  if (!entityId && !Object.keys(params).length) return params as any;
  const merged = { ...params };
  if (!entityId) return merged as any;

  switch (screen) {
    case 'SpotDetail':
      return { ...merged, spotId: merged.spotId || entityId } as any;
    case 'ReelDetail':
      return { ...merged, reelId: merged.reelId || entityId } as any;
    case 'TripDetail':
      return {
        ...merged,
        tripId: merged.tripId || entityId,
        warnings: [],
        note: '',
      } as any;
    case 'VendorProfile':
      return { ...merged, vendorId: merged.vendorId || entityId } as any;
    case 'CollaborationDetail':
      return { ...merged, collaborationId: merged.collaborationId || entityId } as any;
    case 'CollaborationReview':
      return { ...merged, collaborationId: merged.collaborationId || entityId } as any;
    case 'CollaborationRequest':
      return { ...merged, creatorProfileId: merged.creatorProfileId || entityId } as any;
    default:
      return { ...merged, id: entityId } as any;
  }
}

export function resolveNotificationRoute(
  payload: NormalizedNotificationPayload,
): NotificationRouteTarget | null {
  if (payload.screen) {
    const screen = payload.screen as keyof RootStackParamList;
    const params = mapEntityToScreenParams(screen, payload.entityId, payload.params);
    return { screen, params };
  }

  const type = (payload.type || 'system').toLowerCase();
  const id = payload.entityId || payload.params.entityId || payload.params.placeId
    || payload.params.tripId || payload.params.reelId || payload.params.vendorId
    || payload.params.offerId;

  if (type === 'vendor_tagged_reel') {
    return { screen: 'VendorTabs', params: { screen: 'Home' } };
  }
  if (/collab|collaboration/.test(type)) {
    const collaborationId = payload.params.collaborationId || id;
    if (/reel_uploaded/.test(type) && collaborationId) {
      return { screen: 'CollaborationReview', params: { collaborationId } };
    }
    if (/reel_published/.test(type) && (payload.params.reelId || id)) {
      return { screen: 'ReelDetail', params: { reelId: payload.params.reelId || id } };
    }
    if (collaborationId) {
      return { screen: 'CollaborationDetail', params: { collaborationId } };
    }
    return { screen: 'CreatorTabs', params: { screen: 'Collaboration' } };
  }
  if (/hidden_gem|place_approved|place_rejected/.test(type) && (id || payload.params.placeId)) {
    return { screen: 'SpotDetail', params: { spotId: id || payload.params.placeId } };
  }
  if (/reel|comment/.test(type) && (id || payload.params.reelId)) {
    return { screen: 'ReelDetail', params: { reelId: id || payload.params.reelId } };
  }
  if (/trip|itinerary/.test(type) && (id || payload.params.tripId)) {
    return { screen: 'TripDetail', params: { tripId: id || payload.params.tripId, warnings: [], note: '' } };
  }
  if (/offer|reward|redeem/.test(type) && !/palpoints|points/.test(type)) {
    if (/vendor/.test(type) && (id || payload.params.vendorId)) {
      return { screen: 'VendorProfile', params: { vendorId: id || payload.params.vendorId } };
    }
    return { screen: 'Rewards' };
  }
  if (/wallet|billing|subscription|premium|payment|palpoints|points/.test(type)) {
    return { screen: 'Wallet' };
  }
  if (/vendor|redemption|scanner/.test(type)) {
    return { screen: 'VendorTabs' };
  }
  if (/creator|application|reel_upload/.test(type)) {
    return { screen: 'CreatorTabs' };
  }
  if (/ai.?planner|trip.?generat/.test(type)) {
    return { screen: 'AITripPlanner' };
  }
  if (/riddle|game_complete/.test(type)) {
    return { screen: 'Notifications' };
  }
  if (/quest|treasure/.test(type)) {
    return { screen: 'Notifications' };
  }
  if (/legal|policy/.test(type)) {
    return { screen: 'LegalHub' };
  }
  return { screen: 'Notifications' };
}

export function normalizeNotificationData(
  data: Record<string, unknown> | null | undefined,
  notification?: { title?: string | null; body?: string | null },
): NormalizedNotificationPayload {
  const params = asStringRecord(data);
  let parsedParams: Record<string, string> = { ...params };
  if (params.params) {
    try {
      const nested = JSON.parse(params.params);
      if (nested && typeof nested === 'object') {
        parsedParams = { ...parsedParams, ...asStringRecord(nested as Record<string, unknown>) };
      }
    } catch {
      /* keep flat params */
    }
  }

  return {
    type: params.type || 'system',
    screen: params.screen,
    entityId: params.entityId || params.id,
    notificationId: params.notificationId,
    params: parsedParams,
    title: notification?.title || params.title,
    body: notification?.body || params.body,
  };
}

export function buildPushDataFields(input: {
  type: string;
  screen?: string;
  entityId?: string;
  notificationId?: string;
  params?: Record<string, string>;
}): Record<string, string> {
  const data: Record<string, string> = {
    type: input.type,
  };
  if (input.screen) data.screen = input.screen;
  if (input.entityId) data.entityId = input.entityId;
  if (input.notificationId) data.notificationId = input.notificationId;
  if (input.params && Object.keys(input.params).length) {
    data.params = JSON.stringify(input.params);
  }
  return data;
}
