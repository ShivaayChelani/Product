import type { RideProviderMode } from '@prisma/client';
import type {
  RideDeepLinkParams,
  RideDeepLinkResult,
  RideProviderId,
  RideVehicleType,
} from '../ride.types';

export interface IRideProvider {
  readonly id: RideProviderId;

  isAvailable(pickupLatitude: number, pickupLongitude: number): boolean;
  supportsApi(): boolean;
  supportsDeepLink(): boolean;
  mode(): RideProviderMode;
  displayName(): string;
  icon(): string;
  color(): string;
  supportedVehicleTypes(): RideVehicleType[];
  vehicleLabels(): string[];

  createDeepLink(params: RideDeepLinkParams): RideDeepLinkResult;
  createStoreLink(platform: 'ios' | 'android'): string;

  estimateFare(_params: RideDeepLinkParams): Promise<never>;
  bookRide(_params: RideDeepLinkParams): Promise<never>;
  trackRide(_rideId: string): Promise<never>;
  cancelRide(_rideId: string): Promise<never>;
}

export class RideApiNotImplementedError extends Error {
  constructor(provider: string, method: string) {
    super(`${method} is not implemented for ${provider}. Provider is in DEEPLINK mode.`);
    this.name = 'RideApiNotImplementedError';
  }
}
