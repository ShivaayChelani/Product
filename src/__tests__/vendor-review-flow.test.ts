import fs from 'fs';
import path from 'path';

describe('PalPoints vendor review flow', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('PalPoints and Wallet navigate to Map with reviewMode and vendors tab', () => {
    const palPoints = read('screens/PalPointsScreen.tsx');
    const wallet = read('screens/WalletScreen.tsx');
    const navHelper = read('navigation/vendorReviewFlow.ts');

    expect(navHelper).toMatch(/reviewMode:\s*true/);
    expect(navHelper).toMatch(/initialMapTab:\s*['"]vendors['"]/);
    expect(navHelper).toMatch(/navigateToVendorReviewMap/);
    expect(navHelper).toMatch(/CommonActions\.navigate/);
    expect(palPoints).toMatch(/navigateToVendorReviewMap/);
    expect(wallet).toMatch(/navigateToVendorReviewMap/);
  });

  it('MapScreen shows review prompt and Write Review on vendor card', () => {
    const map = read('screens/MapScreen.tsx');
    const card = read('components/MapVendorDetailCard.tsx');

    expect(map).toMatch(/reviewMode/);
    expect(map).toMatch(/Choose a business to review/);
    expect(map).toMatch(/onWriteReview/);
    expect(map).toMatch(/openReview:\s*true/);
    expect(card).toMatch(/Write Review/);
    expect(card).toMatch(/onWriteReview/);
  });

  it('Vendor profile opens review composer and posts via vendorsApi', () => {
    const profile = read('screens/VendorProfileScreen.tsx');
    const types = read('navigation/types.ts');

    expect(types).toMatch(/openReview\?: boolean/);
    expect(types).toMatch(/reviewMode\?: boolean/);
    expect(profile).toMatch(/openReview/);
    expect(profile).toMatch(/vendorsApi\.addReview/);
    expect(profile).toMatch(/Post Review/);
    expect(profile).toMatch(/pointsAwarded/);
    expect(profile).toMatch(/walletApi\.getProfile/);
  });

  it('vendors API exposes server pointsAwarded on review response', () => {
    const vendors = read('services/api/vendors.ts');
    expect(vendors).toMatch(/pointsAwarded\?: number/);
  });
});
