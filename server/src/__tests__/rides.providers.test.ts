import { UberProvider, BluSmartProvider } from '../modules/rides/providers/concrete-providers';
import { getRideProvider } from '../modules/rides/providers/provider.registry';
import { RideApiNotImplementedError } from '../modules/rides/interfaces/ride-provider.interface';

describe('Ride provider adapters (deeplink-only)', () => {
  const pickup = { pickupLatitude: 28.6139, pickupLongitude: 77.209, destinationLatitude: 28.5355, destinationLongitude: 77.391 };

  it('Uber deeplink encodes coordinates', () => {
    const uber = new UberProvider();
    const links = uber.createDeepLink(pickup);
    expect(links.deepLink).toContain('uber://');
    expect(links.deepLink).toContain('28.6139');
    expect(links.playStoreUrl).toContain('ubercab');
  });

  it('BluSmart limited to service regions', () => {
    const blu = new BluSmartProvider();
    expect(blu.isAvailable(28.6139, 77.209)).toBe(true);
    expect(blu.isAvailable(22.5726, 88.3639)).toBe(false);
  });

  it('API methods throw NotImplemented', async () => {
    const rapido = getRideProvider('rapido')!;
    await expect(rapido.estimateFare(pickup)).rejects.toBeInstanceOf(RideApiNotImplementedError);
  });
});
