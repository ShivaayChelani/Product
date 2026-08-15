import type { Reel } from '../../../types';
import type { VendorPublicDetails, VendorReel } from '../../../services/api/vendors';

/** Map a vendor-uploaded promo reel into the social Reel feed shape for playback. */
export function mapVendorReelToFeed(
  reel: VendorReel,
  vendor: Pick<VendorPublicDetails, 'id' | 'businessName' | 'city' | 'state' | 'imageUrl'>,
): Reel {
  return {
    id: reel.id,
    creatorId: vendor.id,
    videoUrl: reel.videoUrl,
    thumbnail: reel.thumbnail,
    title: reel.title,
    description: reel.description,
    likes: reel.likes ?? 0,
    views: reel.views ?? 0,
    shares: 0,
    saves: 0,
    featured: false,
    rewardPoints: 0,
    placeId: null,
    vendorId: vendor.id,
    eventId: null,
    createdAt: reel.createdAt,
    creator: {
      id: vendor.id,
      username: vendor.businessName,
      avatar: vendor.imageUrl,
      verified: true,
      userId: vendor.id,
    },
    vendor: {
      id: vendor.id,
      businessName: vendor.businessName,
      city: vendor.city,
      state: vendor.state,
    },
  };
}

export function mapVendorReelsToFeed(
  reels: VendorReel[],
  vendor: Pick<VendorPublicDetails, 'id' | 'businessName' | 'city' | 'state' | 'imageUrl'>,
): Reel[] {
  return reels.filter(r => r.videoUrl).map(r => mapVendorReelToFeed(r, vendor));
}
