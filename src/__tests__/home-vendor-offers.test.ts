import { mapPublicOffersToNearbyCards, buildNearbyVendorOffers } from '../utils/homeVendorOffers';
import type { VendorOfferItem } from '../services/api/rewards';
import type { VendorBusiness, VendorOffer } from '../types';

const publicOffer: VendorOfferItem = {
  id: 'off_1',
  vendorId: 'vnd_1',
  title: 'Weekend Pizza Deal',
  description: '20% off on all pizzas',
  discountType: 'percentage',
  discountValue: 20,
  pointsRequired: 50,
  category: 'cafe',
  imageUrl: null,
  isFeatured: false,
  isActive: true,
  isApproved: true,
  currentRedemptions: 0,
  maxRedemptions: null,
  validTill: null,
  couponCode: 'PIZZA20',
  vendor: {
    id: 'vnd_1',
    businessName: 'Street story',
    city: 'Jabalpur',
    state: 'Madhya Pradesh',
    imageUrl: null,
    latitude: 23.16,
    longitude: 79.93,
  },
};

describe('home vendor offers', () => {
  it('maps live public offers onto Home cards without needing DataContext vendors', () => {
    const cards = mapPublicOffersToNearbyCards([publicOffer], {
      latitude: 23.17,
      longitude: 79.94,
    }, 6);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('off_1');
    expect(cards[0].vendorName).toBe('STREET STORY');
    expect(cards[0].headline).toMatch(/20% OFF/i);
  });

  it('hides inactive public offers', () => {
    const cards = mapPublicOffersToNearbyCards(
      [{ ...publicOffer, isActive: false }],
      null,
      6,
    );
    expect(cards).toHaveLength(0);
  });

  it('keeps a local offer even if the vendor is missing from the in-memory list', () => {
    const local: VendorOffer = {
      id: 'off_local',
      vendorId: 'missing-vendor',
      offerTitle: 'Cafe special',
      offerDescription: 'Flat 50 off',
      discountType: 'flat',
      discountValue: 50,
      pointsRequired: 0,
      isActive: true,
    };
    const cards = buildNearbyVendorOffers([local], [] as VendorBusiness[], null, 3);
    expect(cards).toHaveLength(1);
    expect(cards[0].headline).toBe('₹50 OFF');
  });
});
