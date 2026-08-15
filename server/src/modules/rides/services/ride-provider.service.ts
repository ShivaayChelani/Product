import { RideProviderMode } from '@prisma/client';
import { getRideProvider, listAvailableProviders, listBuiltinProviders } from '../providers/provider.registry';
import { rideRepository } from '../repositories/ride.repository';
import type { ProviderStatus, RideProviderCapability, RideProviderDto, RideProviderId } from '../ride.types';

function buildCapabilities(adapter: { supportsDeepLink(): boolean; supportsApi(): boolean }): RideProviderCapability[] {
  const caps: RideProviderCapability[] = [];
  if (adapter.supportsDeepLink()) {
    caps.push('DEEP_LINK', 'WEB_BOOKING');
  }
  if (adapter.supportsApi()) {
    caps.push('FARE_ESTIMATE', 'ETA_ESTIMATE', 'BOOKING_API', 'RIDE_TRACKING');
  }
  return caps;
}

function resolveStatus(
  adapter: { isAvailable(lat: number, lng: number): boolean; supportsDeepLink(): boolean; supportsApi(): boolean },
  regionOk: boolean,
  enabled: boolean,
): ProviderStatus {
  if (!enabled || !regionOk) return 'UNAVAILABLE';
  if (adapter.supportsDeepLink() || adapter.supportsApi()) return 'ACTIVE';
  return 'PARTNER_PENDING';
}

export const rideProviderService = {
  async listProviders(pickupLatitude?: number, pickupLongitude?: number): Promise<RideProviderDto[]> {
    let dbRows: Awaited<ReturnType<typeof rideRepository.listEnabledProviders>> = [];
    try {
      dbRows = await rideRepository.listEnabledProviders();
    } catch {
      // DB optional at bootstrap
    }

    const dbById = new Map(dbRows.map(r => [r.id, r]));
    const hasPickup = pickupLatitude != null && pickupLongitude != null;
    const adapters = hasPickup
      ? listAvailableProviders(pickupLatitude!, pickupLongitude!)
      : listBuiltinProviders();

    return adapters.map(adapter => {
      const row = dbById.get(adapter.id);
      const mode = row?.mode ?? RideProviderMode.DEEPLINK;
      const regionOk = hasPickup
        ? adapter.isAvailable(pickupLatitude!, pickupLongitude!)
        : true;
      const enabled = row?.enabled !== false;
      const capabilities = buildCapabilities(adapter);
      const status = resolveStatus(adapter, regionOk, enabled);

      return {
        id: adapter.id as RideProviderId,
        name: row?.displayName ?? adapter.displayName(),
        mode,
        status,
        enabled,
        capabilities,
        supportsFareEstimate: row?.supportsApi === true && mode === RideProviderMode.API,
        supportsBookingApi: row?.supportsApi === true && mode === RideProviderMode.API,
        supportsDeepLink: adapter.supportsDeepLink(),
        supportsWebBooking: adapter.supportsDeepLink(),
        vehicles: adapter.vehicleLabels(),
        icon: row?.icon ?? adapter.icon(),
        color: row?.color ?? adapter.color(),
        available: status === 'ACTIVE',
      };
    });
  },

  resolveAdapter(providerId: string) {
    return getRideProvider(providerId) ?? null;
  },
};
