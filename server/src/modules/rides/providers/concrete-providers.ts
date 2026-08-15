import { BaseRideProvider } from './base-ride.provider';
import type { RideDeepLinkParams, RideDeepLinkResult, RideVehicleType } from '../ride.types';
import { isInBluSmartRegion, isInIndia } from '../utils/ride-geo';

export class UberProvider extends BaseRideProvider {
  readonly id = 'uber' as const;
  protected readonly playStoreUrl = 'market://details?id=com.ubercab';
  protected readonly appStoreUrl = 'https://apps.apple.com/app/uber/id368677368';

  isAvailable(lat: number, lng: number): boolean {
    return isInIndia(lat, lng);
  }

  displayName(): string {
    return 'Uber';
  }

  icon(): string {
    return 'car-sport';
  }

  color(): string {
    return '#000000';
  }

  supportedVehicleTypes(): RideVehicleType[] {
    return ['cab', 'bike', 'xl'];
  }

  vehicleLabels(): string[] {
    return ['Go', 'Moto', 'XL'];
  }

  createDeepLink(p: RideDeepLinkParams): RideDeepLinkResult {
    const { pickupLatitude: oLat, pickupLongitude: oLng, destinationLatitude: dLat, destinationLongitude: dLng } = p;
    const web =
      'https://m.uber.com/looking?' +
      `pickup=${encodeURIComponent(JSON.stringify({ latitude: oLat, longitude: oLng }))}` +
      `&drop[0]=${encodeURIComponent(JSON.stringify({ latitude: dLat, longitude: dLng }))}`;
    const deep =
      `uber://riderequest?pickup[latitude]=${oLat}&pickup[longitude]=${oLng}` +
      `&dropoff[latitude]=${dLat}&dropoff[longitude]=${dLng}`;
    return { deepLink: deep, webFallbackLink: web, playStoreUrl: this.playStoreUrl, appStoreUrl: this.appStoreUrl };
  }
}

export class OlaProvider extends BaseRideProvider {
  readonly id = 'ola' as const;
  protected readonly playStoreUrl = 'market://details?id=com.olacabs.customer';
  protected readonly appStoreUrl = 'https://apps.apple.com/app/ola-cabs/id539179365';

  isAvailable(lat: number, lng: number): boolean {
    return isInIndia(lat, lng);
  }

  displayName(): string {
    return 'Ola';
  }

  icon(): string {
    return 'car';
  }

  color(): string {
    return '#1FAF38';
  }

  supportedVehicleTypes(): RideVehicleType[] {
    return ['cab', 'bike', 'auto'];
  }

  vehicleLabels(): string[] {
    return ['Mini', 'Bike', 'Auto'];
  }

  createDeepLink(p: RideDeepLinkParams): RideDeepLinkResult {
    const { pickupLatitude: oLat, pickupLongitude: oLng, destinationLatitude: dLat, destinationLongitude: dLng } = p;
    const web = `https://book.olacabs.com/?pickup_lat=${oLat}&pickup_lng=${oLng}&drop_lat=${dLat}&drop_lng=${dLng}`;
    const deep =
      `olacabs://app/launch?landing_page=book&pickup_lat=${oLat}&pickup_lng=${oLng}` +
      `&drop_lat=${dLat}&drop_lng=${dLng}`;
    return { deepLink: deep, webFallbackLink: web, playStoreUrl: this.playStoreUrl, appStoreUrl: this.appStoreUrl };
  }
}

export class RapidoProvider extends BaseRideProvider {
  readonly id = 'rapido' as const;
  protected readonly playStoreUrl = 'market://details?id=com.rapido.passenger';
  protected readonly appStoreUrl = 'https://apps.apple.com/app/rapido-bike-taxi-auto-cabs/id1198464606';

  isAvailable(lat: number, lng: number): boolean {
    return isInIndia(lat, lng);
  }

  displayName(): string {
    return 'Rapido';
  }

  icon(): string {
    return 'bicycle';
  }

  color(): string {
    return '#FFCA00';
  }

  supportedVehicleTypes(): RideVehicleType[] {
    return ['bike', 'auto'];
  }

  vehicleLabels(): string[] {
    return ['Bike', 'Auto'];
  }

  createDeepLink(p: RideDeepLinkParams): RideDeepLinkResult {
    const { pickupLatitude: oLat, pickupLongitude: oLng, destinationLatitude: dLat, destinationLongitude: dLng } = p;
    const web = `https://m.rapido.bike/unup-home/seo?pickup_lat=${oLat}&pickup_lng=${oLng}&drop_lat=${dLat}&drop_lng=${dLng}`;
    const deep = `rapido://book?pickupLat=${oLat}&pickupLng=${oLng}&dropLat=${dLat}&dropLng=${dLng}`;
    return { deepLink: deep, webFallbackLink: web, playStoreUrl: this.playStoreUrl, appStoreUrl: this.appStoreUrl };
  }
}

export class BluSmartProvider extends BaseRideProvider {
  readonly id = 'blusmart' as const;
  protected readonly playStoreUrl = 'market://details?id=com.blusmart.rider';
  protected readonly appStoreUrl = 'https://apps.apple.com/app/blusmart/id6443709189';

  isAvailable(lat: number, lng: number): boolean {
    return isInIndia(lat, lng) && isInBluSmartRegion(lat, lng);
  }

  displayName(): string {
    return 'BluSmart';
  }

  icon(): string {
    return 'flash';
  }

  color(): string {
    return '#0066FF';
  }

  supportedVehicleTypes(): RideVehicleType[] {
    return ['electric', 'cab'];
  }

  vehicleLabels(): string[] {
    return ['Electric', 'Premium'];
  }

  createDeepLink(p: RideDeepLinkParams): RideDeepLinkResult {
    const { pickupLatitude: oLat, pickupLongitude: oLng, destinationLatitude: dLat, destinationLongitude: dLng } = p;
    const web = `https://www.blusmart.com/?pickup=${oLat},${oLng}&drop=${dLat},${dLng}`;
    const deep = `blusmart://ride?pickup_lat=${oLat}&pickup_lng=${oLng}&drop_lat=${dLat}&drop_lng=${dLng}`;
    return { deepLink: deep, webFallbackLink: web, playStoreUrl: this.playStoreUrl, appStoreUrl: this.appStoreUrl };
  }
}
