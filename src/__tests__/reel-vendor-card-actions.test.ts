/**
 * Vendor reel business-card actions.
 *
 * Regression targets:
 *
 * 1. A creator reel gets no business actions and keeps its Follow button. A
 *    business cannot be "followed" like a creator, so a vendor reel swaps Follow
 *    for Like / Share / Directions rather than showing both.
 * 2. The card's Like and Share are the feed's own handlers, the same ones the
 *    right rail calls, so the two hearts cannot disagree about one reel.
 * 3. A vendor with unusable coordinates gets no Direction action at all. Routing
 *    to Null Island `(0,0)` or a swapped pair is worse than omitting the button.
 */
import {
  resolveReelVendorActions,
  vendorHasRouteableLocation,
} from '../components/reels/reelVendorActions';
import { isValidLatLng } from '../services/location/distance';

const GOOD_COORDS = { latitude: 12.9716, longitude: 77.5946 };
const handlers = () => ({
  onLike: jest.fn(),
  onShare: jest.fn(),
  onDirections: jest.fn(),
});

describe('resolveReelVendorActions', () => {
  it('offers nothing for a creator reel with no vendor', () => {
    const actions = resolveReelVendorActions({
      vendor: null, isLiked: false, canRoute: true, ...handlers(),
    });
    expect(actions).toBeUndefined();
  });

  it('offers all three actions for a located vendor', () => {
    const actions = resolveReelVendorActions({
      vendor: GOOD_COORDS, isLiked: false, canRoute: true, ...handlers(),
    });
    expect(actions?.onLike).toBeDefined();
    expect(actions?.onShare).toBeDefined();
    expect(actions?.onDirections).toBeDefined();
  });

  it('passes the liked state straight through', () => {
    const actions = resolveReelVendorActions({
      vendor: GOOD_COORDS, isLiked: true, canRoute: true, ...handlers(),
    });
    expect(actions?.isLiked).toBe(true);
  });

  it('wires the exact handler instances it was given', () => {
    // The rail and the card must share one toggle, not two independent ones.
    const h = handlers();
    const actions = resolveReelVendorActions({
      vendor: GOOD_COORDS, isLiked: false, canRoute: true, ...h,
    });
    expect(actions?.onLike).toBe(h.onLike);
    expect(actions?.onShare).toBe(h.onShare);
    expect(actions?.onDirections).toBe(h.onDirections);
  });

  it.each([
    ['Null Island', { latitude: 0, longitude: 0 }],
    ['swapped pair', { latitude: 77.5946, longitude: 12.9716 }],
    ['latitude out of range', { latitude: 120, longitude: 77.5946 }],
    ['longitude out of range', { latitude: 12.9716, longitude: 200 }],
    ['both null', { latitude: null, longitude: null }],
    ['both undefined', {}],
  ])('omits Direction for a vendor with %s', (_label, vendor) => {
    const actions = resolveReelVendorActions({
      vendor, isLiked: false, canRoute: true, ...handlers(),
    });
    // Like and Share still work; only the unfulfillable action is dropped.
    expect(actions?.onLike).toBeDefined();
    expect(actions?.onShare).toBeDefined();
    expect(actions).not.toHaveProperty('onDirections');
  });

  it('omits Direction when the host screen supplies no route handler', () => {
    const actions = resolveReelVendorActions({
      vendor: GOOD_COORDS, isLiked: false, canRoute: false, ...handlers(),
    });
    expect(actions).not.toHaveProperty('onDirections');
  });
});

describe('vendorHasRouteableLocation', () => {
  it.each([
    ['Bangalore', { latitude: 12.9716, longitude: 77.5946 }, true],
    ['Null Island', { latitude: 0, longitude: 0 }, false],
    ['swapped pair', { latitude: 77.5946, longitude: 12.9716 }, false],
    ['missing', {}, false],
    ['no vendor', null, false],
  ])('%s -> %s', (_label, vendor, expected) => {
    expect(vendorHasRouteableLocation(vendor as any)).toBe(expected);
  });

  it('agrees with the shared coordinate guard the router uses', () => {
    // If these two ever diverge, a vendor could pass this check and still be
    // rejected at navigation time.
    expect(vendorHasRouteableLocation(GOOD_COORDS)).toBe(isValidLatLng(12.9716, 77.5946));
    expect(vendorHasRouteableLocation({ latitude: 0, longitude: 0 })).toBe(isValidLatLng(0, 0));
  });
});