import { ApiError } from '../../../shared/utils/ApiError';
import { rideProviderService } from './ride-provider.service';
import { rideRepository } from '../repositories/ride.repository';
import type { RideDeepLinkParams, RideOpenResponseDto, RideProviderId } from '../ride.types';

/**
 * Opens official provider apps or booking websites via server-generated deep links.
 * PalSafar never performs bookings — it only launches external provider experiences.
 */
export const rideLauncher = {
  async open(input: {
    userId?: string;
    provider: RideProviderId;
    params: RideDeepLinkParams;
  }): Promise<RideOpenResponseDto> {
    const adapter = rideProviderService.resolveAdapter(input.provider);
    if (!adapter) {
      throw new ApiError(404, 'Ride provider not found.');
    }

    if (!adapter.isAvailable(input.params.pickupLatitude, input.params.pickupLongitude)) {
      throw new ApiError(400, 'Provider is not listed for this pickup region.');
    }

    if (!adapter.supportsDeepLink()) {
      throw new ApiError(400, 'Provider does not support deeplink booking.');
    }

    const links = adapter.createDeepLink(input.params);
    if (!links.deepLink && !links.webFallbackLink) {
      throw new ApiError(500, 'Failed to generate provider deeplink.');
    }

    let requestId = 'ephemeral';
    try {
      const request = await rideRepository.createRequest({
        userId: input.userId,
        providerId: input.provider,
        params: input.params,
      });
      requestId = request.id;
      await rideRepository.markOpened(request.id);
      await rideRepository.appendHistory({
        userId: input.userId,
        requestId: request.id,
        providerId: input.provider,
        action: 'DEEPLINK_OPENED',
        metadata: { vehicleType: input.params.vehicleType ?? null },
      });
    } catch {
      // Persistence is best-effort
    }

    return {
      provider: input.provider,
      requestId,
      deepLink: links.deepLink,
      webFallbackLink: links.webFallbackLink,
      playStore: links.playStoreUrl,
      appStore: links.appStoreUrl,
    };
  },
};
