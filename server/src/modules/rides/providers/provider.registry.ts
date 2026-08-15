import type { IRideProvider } from '../interfaces/ride-provider.interface';
import { BluSmartProvider, OlaProvider, RapidoProvider, UberProvider } from './concrete-providers';
import type { RideProviderId } from '../ride.types';

const BUILTIN: IRideProvider[] = [
  new UberProvider(),
  new OlaProvider(),
  new RapidoProvider(),
  new BluSmartProvider(),
];

const byId = new Map<RideProviderId, IRideProvider>(BUILTIN.map(p => [p.id, p]));

/** Resolves a built-in provider adapter by id. */
export function getRideProvider(id: string): IRideProvider | undefined {
  return byId.get(id as RideProviderId);
}

/** Factory for creating provider adapter instances (extensible for future partner adapters). */
export const rideProviderFactory = {
  get(id: string): IRideProvider | undefined {
    return getRideProvider(id);
  },
  listAll(): IRideProvider[] {
    return [...BUILTIN];
  },
};

export function listBuiltinProviders(): IRideProvider[] {
  return [...BUILTIN];
}

export function listAvailableProviders(pickupLatitude: number, pickupLongitude: number): IRideProvider[] {
  return listBuiltinProviders().filter(p => p.isAvailable(pickupLatitude, pickupLongitude));
}
