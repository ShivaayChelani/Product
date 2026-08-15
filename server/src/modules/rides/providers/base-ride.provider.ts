import { RideProviderMode } from '@prisma/client';
import type { IRideProvider } from '../interfaces/ride-provider.interface';
import { RideApiNotImplementedError } from '../interfaces/ride-provider.interface';
import type {
  RideDeepLinkParams,
  RideDeepLinkResult,
  RideProviderId,
  RideVehicleType,
} from '../ride.types';

export abstract class BaseRideProvider implements IRideProvider {
  abstract readonly id: RideProviderId;

  abstract isAvailable(pickupLatitude: number, pickupLongitude: number): boolean;
  abstract displayName(): string;
  abstract icon(): string;
  abstract color(): string;
  abstract supportedVehicleTypes(): RideVehicleType[];
  abstract vehicleLabels(): string[];
  abstract createDeepLink(params: RideDeepLinkParams): RideDeepLinkResult;

  protected abstract readonly playStoreUrl: string;
  protected abstract readonly appStoreUrl: string;

  mode(): RideProviderMode {
    return RideProviderMode.DEEPLINK;
  }

  supportsApi(): boolean {
    return false;
  }

  supportsDeepLink(): boolean {
    return true;
  }

  createStoreLink(platform: 'ios' | 'android'): string {
    return platform === 'ios' ? this.appStoreUrl : this.playStoreUrl;
  }

  async estimateFare(_params: RideDeepLinkParams): Promise<never> {
    throw new RideApiNotImplementedError(this.id, 'estimateFare');
  }

  async bookRide(_params: RideDeepLinkParams): Promise<never> {
    throw new RideApiNotImplementedError(this.id, 'bookRide');
  }

  async trackRide(_rideId: string): Promise<never> {
    throw new RideApiNotImplementedError(this.id, 'trackRide');
  }

  async cancelRide(_rideId: string): Promise<never> {
    throw new RideApiNotImplementedError(this.id, 'cancelRide');
  }
}
