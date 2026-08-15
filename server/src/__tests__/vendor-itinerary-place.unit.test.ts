import { describe, expect, it } from 'vitest';
import {
  vendorBusinessTypeToPlaceCategory,
  vendorPlaceExternalId,
} from '../modules/trips/vendorItineraryPlace.helpers';

describe('vendor itinerary place', () => {
  it('maps cafes and restaurants to RESTAURANT so they stay off the Places map', () => {
    expect(vendorBusinessTypeToPlaceCategory('cafe')).toBe('RESTAURANT');
    expect(vendorBusinessTypeToPlaceCategory('Restaurant')).toBe('RESTAURANT');
    expect(vendorBusinessTypeToPlaceCategory('bakery')).toBe('RESTAURANT');
  });

  it('maps hotels and shops to commercial categories', () => {
    expect(vendorBusinessTypeToPlaceCategory('hotel')).toBe('HOTEL');
    expect(vendorBusinessTypeToPlaceCategory('homestay')).toBe('HOTEL');
    expect(vendorBusinessTypeToPlaceCategory('gift shop')).toBe('SHOPPING');
  });

  it('uses a stable external id for the vendor-backed place', () => {
    expect(vendorPlaceExternalId('vnd_1')).toBe('vendor:vnd_1');
  });
});
