import {
  assembleVendorMapDetail,
  unwrapVendorDetails,
  unwrapVendorList,
} from '../features/mapExplore/utils/vendorMapDetail';
import type { VendorPublicDetails, VendorReel } from '../services/api/vendors';

const detail: VendorPublicDetails = {
  id: 'vnd_1',
  businessName: 'Street story',
  businessType: 'cafe',
  description: null,
  address: 'Jabalpur',
  city: 'Jabalpur',
  state: 'Madhya Pradesh',
  latitude: 23.16,
  longitude: 79.93,
  imageUrl: null,
  website: null,
  operatingHours: null,
  images: [],
  phone: null,
  showContact: true,
  showWebsite: true,
  showImages: true,
  showOffers: true,
  showReels: true,
  showNavigation: true,
  offers: [
    {
      id: 'off_1',
      title: '20% OFF on All Pizzas',
      description: null,
      discountType: 'percentage',
      discountValue: 20,
      pointsRequired: 0,
      validTill: null,
    },
  ],
};

const reels: VendorReel[] = [
  {
    id: 'reel_1',
    vendorId: 'vnd_1',
    videoUrl: 'https://cdn.example/a.mp4',
    thumbnail: null,
    title: 'Test reel',
    description: null,
    views: 3,
    likes: 1,
    createdAt: new Date().toISOString(),
  },
];

describe('vendor map detail payload', () => {
  it('unwraps { data: [...] } reel lists', () => {
    expect(unwrapVendorList({ success: true, data: reels })).toHaveLength(1);
    expect(unwrapVendorList(reels)).toHaveLength(1);
  });

  it('unwraps vendor details from the API envelope', () => {
    const parsed = unwrapVendorDetails({ success: true, data: detail });
    expect(parsed?.businessName).toBe('Street story');
    expect(parsed?.offers).toHaveLength(1);
  });

  it('counts published vendor reels and live offers on the map card', () => {
    const assembled = assembleVendorMapDetail(detail, reels, {
      reels: [],
      pending: [],
      isOwner: false,
    });
    expect(assembled.reelCount).toBe(1);
    expect(assembled.offerCount).toBe(1);
    expect(assembled.vendorReels).toHaveLength(1);
    expect(assembled.offers[0].title).toBe('20% OFF on All Pizzas');
  });

  it('does not invent empty-state copy when the vendor has published content', () => {
    const assembled = assembleVendorMapDetail(detail, reels, {
      reels: [],
      pending: [],
      isOwner: false,
    });
    expect(assembled.reelCount === 0).toBe(false);
    expect(assembled.offerCount === 0).toBe(false);
  });
});
