import {
  PlanAudience,
  SubscriptionStatus,
  VendorStatus,
  VendorSubscriptionStatus,
} from '@prisma/client';

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

/** Paid/trial vendor plans that should appear on the public map. */
const LIVE_VENDOR_SUB_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

function liveVendorSubscriptionSome(now = new Date()) {
  return {
    user: {
      subscriptions: {
        some: {
          audience: PlanAudience.VENDOR,
          status: { in: LIVE_VENDOR_SUB_STATUSES },
          currentPeriodEnd: { gte: now },
        },
      },
    },
  };
}

/**
 * Approved vendors with a live UserSubscription (period not ended).
 * Denormalized vendor.subscriptionStatus is not enough — expired rows can stay ACTIVE
 * until reconcile runs.
 */
export function getPublicVendorListingWhere(now = new Date()) {
  return {
    status: APPROVED,
    suspendedAt: null,
    ...liveVendorSubscriptionSome(now),
  };
}

/**
 * Map pins: subscribed + approved + coordinates.
 * An active subscription always shows the pin — `showOnMap` cannot hide a paid listing.
 */
export function getPublicVendorMapWhere(now = new Date()) {
  return {
    ...getPublicVendorListingWhere(now),
    latitude: { not: null },
    longitude: { not: null },
  };
}

/** @deprecated Prefer getPublicVendorListingWhere() so subscription end dates stay current. */
export const publicVendorListingWhere = getPublicVendorListingWhere();

/** @deprecated Prefer getPublicVendorMapWhere() so subscription end dates stay current. */
export const publicVendorMapWhere = getPublicVendorMapWhere();

export function isPublicVendorListingVisible(vendor: {
  status: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
  hasLiveSubscription?: boolean;
}): boolean {
  const subscribed =
    vendor.hasLiveSubscription === true
    || (vendor.hasLiveSubscription === undefined && vendor.subscriptionStatus === ACTIVE_SUB);
  return (
    vendor.status === APPROVED &&
    subscribed &&
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
  hasLiveSubscription?: boolean;
}): boolean {
  return (
    isPublicVendorListingVisible(vendor) &&
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
  AND suspended_at IS NULL
  AND EXISTS (
    SELECT 1 FROM user_subscriptions us
    WHERE us.user_id = vendors.user_id
      AND us.audience = 'VENDOR'
      AND us.status IN ('ACTIVE', 'TRIALING')
      AND us.current_period_end >= NOW()
  )
`;
