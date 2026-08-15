import type { VendorBusiness, VendorOffer, UserPosition } from '../types';
import type { NearbyVendorOfferItem } from '../components/home/VendorOffersNearYouSection';
import type { VendorOfferItem } from '../services/api/rewards';
import { haversineDistance } from '../services/location/distance';
import { hasValidImageUrl } from './imageUrl';
import { isLiveVendorOffer, offerDiscountLabel } from './vendorOfferEligibility';

function formatOfferHeadline(offer: VendorOffer): string {
  if (offer.discountType === 'percentage') return `${offer.discountValue}% OFF`;
  if (offer.discountType === 'flat') return `₹${offer.discountValue} OFF`;
  return offer.offerTitle || 'Special Offer';
}

function formatOfferSubtitle(offer: VendorOffer): string {
  if (offer.discountType === 'freebie' && offer.minBillAmount) {
    return `above ₹${offer.minBillAmount}`;
  }
  const desc = offer.offerDescription?.trim();
  if (desc) return desc;
  if (offer.discountType === 'freebie') return 'with qualifying order';
  return 'on selected items';
}

function resolveOfferImage(offer: VendorOffer, vendor?: VendorBusiness): string | undefined {
  if (hasValidImageUrl(offer.imageUrl)) return offer.imageUrl;
  if (vendor && hasValidImageUrl(vendor.imageUrl)) return vendor.imageUrl;
  const gallery = vendor?.images?.find(hasValidImageUrl);
  return gallery;
}

export function buildNearbyVendorOffers(
  vendorOffers: VendorOffer[],
  vendors: VendorBusiness[],
  position: UserPosition | null,
  limit = 3,
): NearbyVendorOfferItem[] {
  const vendorById = new Map(vendors.map(v => [v.id, v]));

  return vendorOffers
    .filter(offer => {
      if (offer.isActive === false) return false;
      const vendor = vendorById.get(offer.vendorId);
      if (!vendor) return true;
      return !vendor.verificationStatus || vendor.verificationStatus === 'approved';
    })
    .map(offer => {
      const vendor = vendorById.get(offer.vendorId);
      const distanceMeters =
        position &&
        vendor?.latitude != null &&
        vendor?.longitude != null
          ? haversineDistance(
              position.latitude,
              position.longitude,
              vendor.latitude,
              vendor.longitude,
            )
          : Number.POSITIVE_INFINITY;

      return {
        offer,
        vendor,
        distanceMeters,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit)
    .map(({ offer, vendor }) => ({
      id: offer.id,
      vendorName: (vendor?.businessName || 'LOCAL VENDOR').toUpperCase(),
      headline: formatOfferHeadline(offer),
      subtitle: formatOfferSubtitle(offer),
      promoCode: offer.couponCode || '',
      distanceLabel: '',
      imageUri: resolveOfferImage(offer, vendor),
      latitude: vendor?.latitude ?? null,
      longitude: vendor?.longitude ?? null,
    }));
}

export function mapPublicOffersToNearbyCards(
  items: VendorOfferItem[],
  position: UserPosition | null,
  limit = 6,
): NearbyVendorOfferItem[] {
  return items
    .filter(item => isLiveVendorOffer(item))
    .map(item => {
      const vendor = item.vendor;
      const distanceMeters =
        position &&
        vendor?.latitude != null &&
        vendor?.longitude != null
          ? haversineDistance(
              position.latitude,
              position.longitude,
              vendor.latitude,
              vendor.longitude,
            )
          : Number.POSITIVE_INFINITY;
      return { item, distanceMeters };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit)
    .map(({ item }) => {
      const image = hasValidImageUrl(item.imageUrl)
        ? item.imageUrl
        : hasValidImageUrl(item.vendor?.imageUrl)
          ? item.vendor?.imageUrl
          : undefined;
      return {
        id: item.id,
        vendorName: (item.vendor?.businessName || 'LOCAL VENDOR').toUpperCase(),
        headline: offerDiscountLabel(item),
        subtitle: (item.description || item.title || 'on selected items').trim(),
        promoCode: item.couponCode || '',
        distanceLabel: '',
        imageUri: image,
        latitude: item.vendor?.latitude ?? null,
        longitude: item.vendor?.longitude ?? null,
      };
    });
}

