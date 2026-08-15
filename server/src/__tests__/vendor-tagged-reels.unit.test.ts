import { describe, expect, it } from 'vitest';
import { isTaggedReelPublicOnVendorCard } from '../modules/vendors/vendor-tagged-reel-visibility';

describe('tagged creator reels on vendor map card', () => {
  it('hides a business-tagged reel until the vendor allows it', () => {
    expect(isTaggedReelPublicOnVendorCard({
      vendorId: 'v1',
      status: 'APPROVED',
      vendorListingStatus: 'PENDING',
    })).toBe(false);
    expect(isTaggedReelPublicOnVendorCard({
      vendorId: 'v1',
      status: 'APPROVED',
      vendorListingStatus: 'REJECTED',
    })).toBe(false);
  });

  it('shows the reel on the vendor card after allow', () => {
    expect(isTaggedReelPublicOnVendorCard({
      vendorId: 'v1',
      status: 'APPROVED',
      vendorListingStatus: 'APPROVED',
    })).toBe(true);
  });

  it('never lists an untagged or non-approved reel on the vendor card', () => {
    expect(isTaggedReelPublicOnVendorCard({
      vendorId: null,
      status: 'APPROVED',
      vendorListingStatus: 'APPROVED',
    })).toBe(false);
    expect(isTaggedReelPublicOnVendorCard({
      vendorId: 'v1',
      status: 'PENDING',
      vendorListingStatus: 'APPROVED',
    })).toBe(false);
  });
});
