import { VendorSubscriptionStatus, type VendorOffer, type Vendor } from '@prisma/client';

export type OfferWithVendor = VendorOffer & {
  vendor?: Pick<Vendor, 'id' | 'businessName' | 'city' | 'state' | 'status' | 'suspendedAt' | 'latitude' | 'longitude' | 'subscriptionStatus'>;
};

const LIVE_VENDOR_STATUS = 'APPROVED' as const;

export function parseValidTillEnd(validTill: string | null | undefined): Date | null {
  if (!validTill?.trim()) return null;
  const end = new Date(validTill);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isVendorEligibleForPublicOffers(
  vendor: Pick<Vendor, 'status' | 'suspendedAt' | 'subscriptionStatus'> | null | undefined,
): boolean {
  if (!vendor) return false;
  if (vendor.status !== LIVE_VENDOR_STATUS) return false;
  if (vendor.suspendedAt != null) return false;
  if (vendor.subscriptionStatus !== VendorSubscriptionStatus.ACTIVE) return false;
  return true;
}

export function isOfferWithinActiveWindow(
  offer: Pick<VendorOffer, 'startDate' | 'validTill'>,
  now = new Date(),
): boolean {
  if (offer.startDate && offer.startDate > now) return false;
  const end = parseValidTillEnd(offer.validTill);
  if (end && end < now) return false;
  return true;
}

export function hasOfferRedemptionsRemaining(
  offer: Pick<VendorOffer, 'maxRedemptions' | 'currentRedemptions'>,
): boolean {
  if (offer.maxRedemptions == null || offer.maxRedemptions <= 0) return true;
  return offer.currentRedemptions < offer.maxRedemptions;
}

export function isPublicVendorOfferEligible(
  offer: Pick<
    VendorOffer,
    | 'isActive'
    | 'isApproved'
    | 'startDate'
    | 'validTill'
    | 'maxRedemptions'
    | 'currentRedemptions'
  >,
  vendor: Pick<Vendor, 'status' | 'suspendedAt' | 'subscriptionStatus'> | null | undefined,
  now = new Date(),
): boolean {
  if (!offer.isActive) return false;
  if (!offer.isApproved) return false;
  if (!isVendorEligibleForPublicOffers(vendor)) return false;
  if (!isOfferWithinActiveWindow(offer, now)) return false;
  if (!hasOfferRedemptionsRemaining(offer)) return false;
  return true;
}

export function remainingRedemptionCount(
  offer: Pick<VendorOffer, 'maxRedemptions' | 'currentRedemptions'>,
): number | null {
  if (offer.maxRedemptions == null || offer.maxRedemptions <= 0) return null;
  return Math.max(0, offer.maxRedemptions - offer.currentRedemptions);
}

export function publicVendorOffersWhere(now = new Date()) {
  return {
    isActive: true,
    isApproved: true,
    OR: [{ startDate: null }, { startDate: { lte: now } }],
    vendor: {
      status: LIVE_VENDOR_STATUS,
      suspendedAt: null,
      subscriptionStatus: VendorSubscriptionStatus.ACTIVE,
    },
  };
}

export function filterEligiblePublicOffers<T extends OfferWithVendor>(
  rows: T[],
  now = new Date(),
): T[] {
  return rows.filter(o => isPublicVendorOfferEligible(o, o.vendor, now));
}
