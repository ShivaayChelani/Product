import fs from 'fs';
import path from 'path';

const screen = fs.readFileSync(
  path.join(__dirname, '../screens/VendorOfferDetailScreen.tsx'),
  'utf8',
);
const rewardsService = fs.readFileSync(
  path.join(__dirname, '../../server/src/modules/rewards/rewards.service.ts'),
  'utf8',
);

describe('VendorOfferDetail buttons', () => {
  it('wires Call, WhatsApp, Website, Directions, and Redeem without Save Offer', () => {
    expect(screen).toContain('openVendorCall');
    expect(screen).toContain('openVendorWhatsApp');
    expect(screen).toContain('openVendorWebsite');
    // Directions now route through PalSafar's own map instead of launching an
    // external maps app, so the offer screen must not reference the old helper.
    expect(screen).toContain('openInternalDirections');
    expect(screen).not.toContain('openVendorDirections');
    expect(screen).not.toContain('onSaveOffer');
    expect(screen).not.toContain('Save Offer');
    expect(screen).not.toContain('isSaved={isSaved}');
    expect(screen).toContain('onRedeemPress');
    expect(screen).toContain('Sign In Required');
    expect(screen).toContain('setRedeemOpen(true)');
    expect(screen).toContain('walletPoints ??');
  });

  it('returns vendor phone and website on the public offer detail API', () => {
    expect(rewardsService).toContain('async getPublicVendorOfferById');
    expect(rewardsService).toMatch(/phone:\s*true/);
    expect(rewardsService).toMatch(/website:\s*true/);
    expect(rewardsService).toContain('vendor.showContact === false ? null : vendor.phone');
    expect(rewardsService).toContain('vendor.showWebsite === false ? null : vendor.website');
    expect(rewardsService).toContain('vendor.showNavigation === false ? null : vendor.latitude');
    expect(rewardsService).toContain('vendor.showNavigation === false ? null : vendor.longitude');
  });
});
