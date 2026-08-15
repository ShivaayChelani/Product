import fs from 'fs';
import path from 'path';

describe('PalPoints earn actions', () => {
  it('Wallet earn cards navigate to real flows and do not advertise unimplemented referrals', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/WalletScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/AddHiddenGem/);
    expect(src).toMatch(/navigateToVendorReviewMap/);
    expect(src).toMatch(/handleWatchAd/);
    expect(src).toMatch(/UploadPlacePhoto/);
    expect(src).toMatch(/MyTrips/);
    expect(src).toMatch(/HowItWorks/);
    expect(src).not.toMatch(/Invite friends/);
    expect(src).not.toMatch(/palsafar\.app\/invite/);
  });

  it('PalPoints ways-to-earn cards are pressable and omit refer-a-friend', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/PalPointsScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/navigateToVendorReviewMap/);
    expect(src).toMatch(/Write a Vendor Review/);
    expect(src).toMatch(/Earn More/);
    expect(src).not.toMatch(/Refer a Friend/);
    expect(src).not.toMatch(/<View style=\{styles\.wayCard\}>/);
  });
});
