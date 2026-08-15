import { describe, expect, it } from 'vitest';
import { haversineDistance } from '../../src/shared/utils/geo';
import {
  getItineraryCheckpointRadiusMeters,
  getItineraryGpsAccuracyMaxMeters,
} from '../../src/modules/trips/itinerary-rewards.config';

describe('itinerary GPS checkpoint gates', () => {
  const place = { lat: 23.1254, lng: 79.8134 };

  it('rejects when farther than default 100m radius', () => {
    const far = haversineDistance(place.lat, place.lng, place.lat + 0.002, place.lng);
    expect(far).toBeGreaterThan(getItineraryCheckpointRadiusMeters());
  });

  it('accepts when within ~80m', () => {
    // ~0.0007 deg latitude ≈ 78m
    const near = haversineDistance(place.lat, place.lng, place.lat + 0.0007, place.lng);
    expect(near).toBeLessThan(getItineraryCheckpointRadiusMeters());
  });

  it('uses configurable accuracy ceiling (default 50m)', () => {
    expect(getItineraryGpsAccuracyMaxMeters()).toBe(50);
    const badAccuracy = 150;
    expect(badAccuracy).toBeGreaterThan(getItineraryGpsAccuracyMaxMeters());
  });

  it('disables GPS PalPoints rewards in production by default', async () => {
    const { isItineraryGpsRewardsEnabled } = await import('../../src/modules/trips/itinerary-rewards.config');
    const prevNode = process.env.NODE_ENV;
    const prevFlag = process.env.ITINERARY_GPS_REWARDS_ENABLED;
    delete process.env.ITINERARY_GPS_REWARDS_ENABLED;
    process.env.NODE_ENV = 'production';
    expect(isItineraryGpsRewardsEnabled()).toBe(false);
    process.env.ITINERARY_GPS_REWARDS_ENABLED = 'true';
    expect(isItineraryGpsRewardsEnabled()).toBe(true);
    process.env.NODE_ENV = prevNode;
    if (prevFlag === undefined) delete process.env.ITINERARY_GPS_REWARDS_ENABLED;
    else process.env.ITINERARY_GPS_REWARDS_ENABLED = prevFlag;
  });
});
