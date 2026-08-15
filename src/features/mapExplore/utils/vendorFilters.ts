import type { VendorPublicOffer } from '../../../services/api/vendors';

export function formatOfferDiscount(offer: {
  discountType?: string;
  discountValue?: number;
}): string {
  const type = String(offer.discountType || '').toLowerCase();
  const value = Number(offer.discountValue ?? 0);
  if (type === 'percentage' || type === 'percent') return `${Math.round(value)}% OFF`;
  if (type === 'flat' || type === 'fixed') return `₹${Math.round(value)} OFF`;
  return value > 0 ? `${Math.round(value)}% OFF` : 'OFFER';
}

export function isPublicVendorOfferLive(offer: VendorPublicOffer, now = new Date()): boolean {
  if (!offer?.id) return false;
  if (offer.validTill) {
    const end = new Date(offer.validTill);
    if (!Number.isNaN(end.getTime()) && end < now) return false;
  }
  return true;
}

export function filterLiveVendorOffers(offers: VendorPublicOffer[] | undefined): VendorPublicOffer[] {
  if (!offers?.length) return [];
  return offers.filter(o => isPublicVendorOfferLive(o));
}

export function matchesVendorCategoryFilter(
  businessType: string | undefined,
  filterKey: string,
): boolean {
  if (!filterKey || filterKey === 'all') return true;
  const t = normalizeVendorType(businessType);
  switch (filterKey) {
    case 'restaurant':
      return t === 'restaurant' || t === 'food';
    case 'cafe':
      return t === 'cafe';
    case 'hotel':
      return t === 'hotel' || t === 'homestay';
    case 'resort':
      return t === 'resort' || t === 'hotel';
    case 'shopping':
      return t === 'shopping' || t === 'shop';
    case 'adventure':
      return t === 'adventure' || t === 'boating' || t === 'tour_experience';
    case 'rental':
      return t === 'bike_rental' || t === 'car_rental';
    case 'guide':
      return t === 'guide';
    case 'spa':
      return t === 'spa';
    default:
      return t === filterKey;
  }
}

function normalizeVendorType(raw?: string): string {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[\s/-]+/g, '_');
}
