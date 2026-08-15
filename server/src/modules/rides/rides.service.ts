import { rideProviderService } from './services/ride-provider.service';
import { rideOpenService } from './services/ride-open.service';
import type { RideDeepLinkParams, RideProviderId } from './ride.types';

export const ridesService = {
  listProviders(pickupLatitude?: number, pickupLongitude?: number) {
    return rideProviderService.listProviders(pickupLatitude, pickupLongitude);
  },

  open(input: { userId?: string; provider: RideProviderId; params: RideDeepLinkParams }) {
    return rideOpenService.open(input);
  },
};
