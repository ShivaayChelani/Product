import fs from 'fs';
import path from 'path';

describe('Creator reel tagged to a business', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('notifies the vendor and keeps the reel pending until allow', () => {
    const social = read('../server/src/modules/social/social.service.ts');
    const tagged = read('../server/src/modules/vendors/vendor-tagged-reels.ts');

    expect(social).toMatch(/vendorListingStatus: taggedVendor \? VendorListingStatus.PENDING/);
    expect(social).toMatch(/notifyVendorOfTaggedReel/);
    expect(tagged).toMatch(/vendor_tagged_reel/);
    expect(tagged).toMatch(/Allow it on your map profile/);
    expect(tagged).toMatch(/VendorListingStatus.PENDING/);
    expect(tagged).toMatch(/action === 'allow'/);
  });

  it('shows Allow and Reject on the map vendor profile card', () => {
    const card = read('components/MapVendorDetailCard.tsx');
    const row = read('components/TaggedReelReviewRow.tsx');
    const hook = read('features/mapExplore/hooks/useVendorMapDetail.ts');
    const assembled = read('features/mapExplore/utils/vendorMapDetail.ts');

    expect(assembled).toMatch(/pendingTaggedReels/);
    expect(hook).toMatch(/getTaggedCreatorReels/);
    expect(card).toMatch(/TaggedReelReviewRow/);
    expect(card).toMatch(/pendingTaggedReels/);
    expect(card).toMatch(/Allow/);
    expect(row).toMatch(/Allow/);
    expect(row).toMatch(/Reject/);
    expect(row).toMatch(/Creator tagged your business/);
  });

  it('lets the vendor allow or reject from vendor home', () => {
    const dash = read('screens/VendorDashboardScreen.tsx');
    const api = read('services/api/vendors.ts');
    const routes = read('../server/src/modules/vendors/vendors.routes.ts');

    expect(dash).toMatch(/Creator reels to review/);
    expect(dash).toMatch(/allowTaggedCreatorReel/);
    expect(dash).toMatch(/rejectTaggedCreatorReel/);
    expect(api).toMatch(/allowTaggedCreatorReel/);
    expect(api).toMatch(/rejectTaggedCreatorReel/);
    expect(routes).toMatch(/tagged-reels\/:reelId\/allow/);
    expect(routes).toMatch(/tagged-reels\/:reelId\/reject/);
  });

  it('shows vendor-uploaded reels on the map vendor card only', () => {
    const card = read('components/MapVendorDetailCard.tsx');
    const hook = read('features/mapExplore/hooks/useVendorMapDetail.ts');
    const assembled = read('features/mapExplore/utils/vendorMapDetail.ts');
    const profile = read('screens/VendorProfileScreen.tsx');
    const publicList = read('screens/VendorReelsScreen.tsx');

    expect(hook).toMatch(/vendorReels/);
    expect(hook).toMatch(/assembleVendorMapDetail/);
    expect(assembled).toMatch(/reelCount: visibleVendorReels.length \+ taggedApproved.length/);
    expect(card).toMatch(/Business reels/);
    expect(card).toMatch(/vendorPromoReels/);
    expect(card).toMatch(/mapVendorReelsToFeed/);
    expect(profile).toMatch(/getTaggedCreatorReels/);
    expect(profile).not.toMatch(/getVendorReels/);
    expect(publicList).toMatch(/getTaggedCreatorReels/);
    expect(publicList).toMatch(/getVendorReels/);
  });
});
