import fs from 'fs';
import path from 'path';

describe('Place reels vendor UX', () => {
  it('hides creator Create Reel actions for approved vendor users', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/PlaceReelsScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/isVendorApproved/);
    expect(src).toMatch(/canCreateCreatorReel/);
    expect(src).toMatch(/vendor dashboard/);
    expect(src).not.toMatch(/canCreateCreatorReel \? null : \(.*Create Reel/s);
  });
});
