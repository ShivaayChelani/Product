import fs from 'fs';
import path from 'path';

describe('screen route params crash guards', () => {
  it('PlaceReelsScreen does not destructure route.params without a fallback', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/PlaceReelsScreen.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/const \{[^}]*placeId[^}]*\} = route\.params\s*;/);
    expect(src).toMatch(/params\?\.placeId/);
    expect(src).toMatch(/if \(!placeId\)/);
  });

  it('VendorOfferDetailScreen does not destructure route.params without a fallback', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/VendorOfferDetailScreen.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/const \{ offerId \} = route\.params\s*;/);
    expect(src).toMatch(/route\.params\?\.offerId/);
    expect(src).toMatch(/if \(!offerId\)/);
  });
});
