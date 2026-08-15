import { RideProviderMode } from '@prisma/client';

export type RideProviderId = 'uber' | 'ola' | 'rapido' | 'blusmart';

export type RideVehicleType = 'bike' | 'auto' | 'cab' | 'xl' | 'electric';

/** How a provider is integrated with PalSafar. */
export type ProviderStatus = 'ACTIVE' | 'UNAVAILABLE' | 'PARTNER_PENDING';

/** Capabilities a provider may expose (now or in future partner API mode). */
export type RideProviderCapability =
  | 'DEEP_LINK'
  | 'WEB_BOOKING'
  | 'FARE_ESTIMATE'
  | 'ETA_ESTIMATE'
  | 'BOOKING_API'
  | 'RIDE_TRACKING';

/** Optional fare/ETA estimate — only populated when an official pricing source exists. */
export interface RideEstimateDto {
  estimatedFare?: string;
  estimatedEta?: string;
  vehicleType?: RideVehicleType | string;
  lastUpdated?: string;
  pricingSource?: string;
}

export interface RideDeepLinkParams {
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  pickupAddress?: string;
  destinationAddress?: string;
  vehicleType?: RideVehicleType | string;
}

export interface RideDeepLinkResult {
  deepLink: string;
  webFallbackLink: string;
  playStoreUrl: string;
  appStoreUrl: string;
}

export interface RideProviderDto {
  id: RideProviderId;
  name: string;
  mode: RideProviderMode;
  status: ProviderStatus;
  enabled: boolean;
  available: boolean;
  capabilities: RideProviderCapability[];
  supportsFareEstimate: boolean;
  supportsBookingApi: boolean;
  supportsDeepLink: boolean;
  supportsWebBooking: boolean;
  vehicles: string[];
  icon?: string | null;
  color?: string | null;
}

export interface RideOpenResponseDto {
  provider: RideProviderId;
  requestId: string;
  deepLink: string;
  webFallbackLink: string;
  playStore: string;
  appStore: string;
}
