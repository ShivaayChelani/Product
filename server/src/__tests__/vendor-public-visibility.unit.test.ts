import { describe, expect, it } from 'vitest';
import {
  deriveVendorListingStatus,
  getPublicVendorListingWhere,
  getPublicVendorMapWhere,
  isPublicVendorListingVisible,
  isPublicVendorMapVisible,
} from '../modules/vendors/vendor-public-visibility';

describe('vendor public visibility', () => {
  it('hides unsubscribed approved vendors from public listing', () => {
    expect(isPublicVendorListingVisible({
      status: 'APPROVED',
      subscriptionStatus: 'NONE',
      suspendedAt: null,
    })).toBe(false);
  });

  it('shows only ACTIVE subscribed approved vendors', () => {
    expect(isPublicVendorListingVisible({
      status: 'APPROVED',
      subscriptionStatus: 'ACTIVE',
      suspendedAt: null,
    })).toBe(true);
  });

  it('hides expired, cancelled-equivalent, grace, and suspended vendors', () => {
    for (const subscriptionStatus of ['EXPIRED', 'GRACE', 'PAST_DUE', 'SUSPENDED']) {
      expect(isPublicVendorListingVisible({
        status: 'APPROVED',
        subscriptionStatus,
        suspendedAt: null,
      })).toBe(false);
    }
    expect(isPublicVendorListingVisible({
      status: 'APPROVED',
      subscriptionStatus: 'ACTIVE',
      suspendedAt: new Date(),
    })).toBe(false);
  });

  it('shows subscribed vendor pins even when showOnMap is off', () => {
    expect(isPublicVendorMapVisible({
      status: 'APPROVED',
      subscriptionStatus: 'ACTIVE',
      showOnMap: true,
      latitude: 23.18,
      longitude: 79.98,
    })).toBe(true);
    expect(isPublicVendorMapVisible({
      status: 'APPROVED',
      subscriptionStatus: 'ACTIVE',
      showOnMap: false,
      latitude: 23.18,
      longitude: 79.98,
    })).toBe(true);
    expect(isPublicVendorMapVisible({
      status: 'APPROVED',
      subscriptionStatus: 'NONE',
      showOnMap: true,
      latitude: 23.18,
      longitude: 79.98,
    })).toBe(false);
  });

  it('maps existing backend statuses onto listing states', () => {
    expect(deriveVendorListingStatus({ vendorStatus: 'PENDING', subscriptionStatus: 'NONE' })).toBe('DRAFT');
    expect(deriveVendorListingStatus({ vendorStatus: 'APPROVED', subscriptionStatus: 'NONE' })).toBe('SUBSCRIPTION_REQUIRED');
    expect(deriveVendorListingStatus({
      vendorStatus: 'APPROVED',
      subscriptionStatus: 'NONE',
      hasPendingPayment: true,
    })).toBe('PAYMENT_PENDING');
    expect(deriveVendorListingStatus({ vendorStatus: 'APPROVED', subscriptionStatus: 'ACTIVE' })).toBe('ACTIVE');
    expect(deriveVendorListingStatus({ vendorStatus: 'APPROVED', subscriptionStatus: 'EXPIRED' })).toBe('EXPIRED');
    expect(deriveVendorListingStatus({
      vendorStatus: 'APPROVED',
      subscriptionStatus: 'NONE',
      latestSubscriptionStatus: 'CANCELLED',
    })).toBe('CANCELLED');
    expect(deriveVendorListingStatus({ vendorStatus: 'SUSPENDED', subscriptionStatus: 'ACTIVE' })).toBe('SUSPENDED');
  });

  it('uses ACTIVE subscription or a live UserSubscription in the public prisma where clause', () => {
    const listing = getPublicVendorListingWhere();
    expect(listing.status).toBe('APPROVED');
    expect(listing.OR).toEqual(expect.arrayContaining([
      { subscriptionStatus: 'ACTIVE' },
    ]));
    const mapWhere = getPublicVendorMapWhere();
    expect(mapWhere).not.toHaveProperty('showOnMap');
    expect(mapWhere.latitude).toEqual({ not: null });
  });
});
