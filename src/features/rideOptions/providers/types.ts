export type RideProviderId = 'uber' | 'ola' | 'rapido' | 'blusmart';

export type RideProviderMode = 'DEEPLINK' | 'API';

export type RideVehicleType = 'bike' | 'auto' | 'cab' | 'xl' | 'electric';

export type ProviderStatus = 'ACTIVE' | 'UNAVAILABLE' | 'PARTNER_PENDING';

export type RideProviderCapability =
  | 'DEEP_LINK'
  | 'WEB_BOOKING'
  | 'FARE_ESTIMATE'
  | 'ETA_ESTIMATE'
  | 'BOOKING_API'
  | 'RIDE_TRACKING';

/** Optional fare/ETA — only shown when server returns official pricing data. */
export interface RideEstimate {
  estimatedFare?: string;
  estimatedEta?: string;
  vehicleType?: RideVehicleType | string;
  lastUpdated?: string;
  pricingSource?: string;
}

export interface RideProviderConfig {
  id: RideProviderId;
  name: string;
  mode: RideProviderMode;
  status: ProviderStatus;
  capabilities: RideProviderCapability[];
  supportsFareEstimate: boolean;
  supportsBookingApi: boolean;
  supportsDeepLink: boolean;
  supportsWebBooking: boolean;
  vehicles: string[];
  icon?: string | null;
  color?: string | null;
  estimate?: RideEstimate;
}

export type LaunchTarget = 'app' | 'website';

export interface RideLaunchPayload {
  provider: RideProviderId;
  deepLink: string;
  webFallbackLink?: string;
  playStore: string;
  appStore: string;
}
