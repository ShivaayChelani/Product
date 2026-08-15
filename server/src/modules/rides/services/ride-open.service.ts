import { rideLauncher } from './ride-launcher.service';
import type { RideDeepLinkParams, RideOpenResponseDto, RideProviderId } from '../ride.types';

/** @deprecated Use rideLauncher — kept for backward compatibility within the module. */
export const rideOpenService = {
  open(input: {
    userId?: string;
    provider: RideProviderId;
    params: RideDeepLinkParams;
  }): Promise<RideOpenResponseDto> {
    return rideLauncher.open(input);
  },
};
