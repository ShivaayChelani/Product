import { VendorStatus, VendorSubscriptionStatus } from '@prisma/client';

/**
 * Derived listing states for Vendor Workspace / Admin.
 * These map onto existing VendorStatus + VendorSubscriptionStatus — no new Prisma enums.
 */
export type VendorListingStatus =
  | 'DRAFT'
  | 'SUBSCRIPTION_REQUIRED'
  | 'PAYMENT_PENDING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUSPENDED';

const APPROVED: VendorStatus = VendorStatus.APPROVED;
const ACTIVE_SUB: VendorSubscriptionStatus = VendorSubscriptionStatus.ACTIVE;

export const publicVendorListingWhere = {
  status: APPROVED,
  subscriptionStatus: ACTIVE_SUB,
  suspendedAt: null,
} as const;

export const publicVendorMapWhere = {
  ...publicVendorListingWhere,
  showOnMap: true,
  latitude: { not: null },
  longitude: { not: null },
} as const;

export function isPublicVendorListingVisible(vendor: {
  status: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
}): boolean {
  return (
    vendor.status === APPROVED &&
    vendor.subscriptionStatus === ACTIVE_SUB &&
    vendor.suspendedAt == null
  );
}

export function isPublicVendorMapVisible(vendor: {
  status: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
  showOnMap?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  return (
    isPublicVendorListingVisible(vendor) &&
    vendor.showOnMap !== false &&
    vendor.latitude != null &&
    vendor.longitude != null
  );
}

export function deriveVendorListingStatus(input: {
  vendorStatus: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
  hasPendingPayment?: boolean;
  latestSubscriptionStatus?: string | null;
}): VendorListingStatus {
  if (
    input.vendorStatus === VendorStatus.SUSPENDED ||
    input.subscriptionStatus === VendorSubscriptionStatus.SUSPENDED ||
    input.suspendedAt != null
  ) {
    return 'SUSPENDED';
  }

  if (
    input.vendorStatus === VendorStatus.PENDING ||
    input.vendorStatus === VendorStatus.CHANGES_REQUESTED ||
    input.vendorStatus === VendorStatus.REJECTED ||
    input.vendorStatus === VendorStatus.PAUSED ||
    input.vendorStatus === VendorStatus.RETIRED
  ) {
    return 'DRAFT';
  }

  if (input.subscriptionStatus === VendorSubscriptionStatus.ACTIVE) {
    return 'ACTIVE';
  }

  if (
    input.subscriptionStatus === VendorSubscriptionStatus.EXPIRED ||
    input.subscriptionStatus === VendorSubscriptionStatus.GRACE ||
    input.subscriptionStatus === VendorSubscriptionStatus.PAST_DUE
  ) {
    return 'EXPIRED';
  }

  if (input.hasPendingPayment) {
    return 'PAYMENT_PENDING';
  }

  if (input.latestSubscriptionStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  return 'SUBSCRIPTION_REQUIRED';
}

export const publicVendorListingSql = `
  status = 'APPROVED'
  AND subscription_status = 'ACTIVE'
  AND suspended_at IS NULL
`;
