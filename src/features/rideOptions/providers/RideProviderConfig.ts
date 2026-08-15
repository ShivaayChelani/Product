import type { RideProviderConfig, RideProviderId } from './types';

/** Local display metadata — server is the source of truth for availability. */
export const RIDE_PROVIDER_REGISTRY: Record<
  RideProviderId,
  Pick<RideProviderConfig, 'color' | 'icon'> & { sortOrder: number }
> = {
  rapido: { color: '#FFCA00', icon: 'bicycle', sortOrder: 0 },
  uber: { color: '#000000', icon: 'car-sport', sortOrder: 1 },
  ola: { color: '#1FAF38', icon: 'car', sortOrder: 2 },
  blusmart: { color: '#0066FF', icon: 'flash', sortOrder: 3 },
};

export const RIDE_ASSISTANT_DISCLAIMER =
  "PalSafar is a travel assistant — not a ride-hailing provider. Pricing, ETA, and driver availability are shown inside the provider's app.";

export const RIDE_PRICING_NOTE = 'Pricing available inside provider app.';

export function sortRideProviders<T extends { id: RideProviderId }>(providers: T[]): T[] {
  return [...providers].sort(
    (a, b) =>
      (RIDE_PROVIDER_REGISTRY[a.id]?.sortOrder ?? 99) -
      (RIDE_PROVIDER_REGISTRY[b.id]?.sortOrder ?? 99),
  );
}

export function integrationLabel(provider: Pick<RideProviderConfig, 'mode' | 'status' | 'supportsBookingApi'>): string {
  if (provider.status === 'PARTNER_PENDING') return 'Partner integration pending';
  if (provider.supportsBookingApi) return 'Partner API';
  return 'Deep link';
}
