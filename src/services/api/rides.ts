import { apiClient } from './client';

export type {
  RideProviderId,
  RideProviderMode,
  RideVehicleType,
  ProviderStatus,
  RideProviderCapability,
  RideEstimate,
  RideProviderConfig,
  LaunchTarget,
  RideLaunchPayload,
} from '../../features/rideOptions/providers/types';

import type { RideProviderConfig, RideProviderId, RideVehicleType } from '../../features/rideOptions/providers/types';

/** @deprecated Use RideProviderConfig */
export type RideProvider = RideProviderConfig;

export interface RideOpenRequest {
  provider: RideProviderId;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  pickupAddress?: string;
  destinationAddress?: string;
  vehicleType?: RideVehicleType;
}

export interface RideOpenResponse {
  provider: RideProviderId;
  deepLink: string;
  webFallbackLink?: string;
  playStore: string;
  appStore: string;
  requestId?: string;
}

export const ridesApi = {
  listProviders(pickupLatitude?: number, pickupLongitude?: number) {
    const params = new URLSearchParams();
    if (pickupLatitude != null) params.set('pickupLatitude', String(pickupLatitude));
    if (pickupLongitude != null) params.set('pickupLongitude', String(pickupLongitude));
    const q = params.toString();
    return apiClient.get<RideProviderConfig[]>(`/rides/providers${q ? `?${q}` : ''}`);
  },

  open(body: RideOpenRequest) {
    return apiClient.post<RideOpenResponse>('/rides/open', body);
  },
};
