const fs = require('fs');
const path = require('path');

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('Issue 10 — My Reels dark info card contrast', () => {
  const creator = read('screens/CreatorReelsScreen.tsx');

  it('keeps the tip banner dark but renders white foreground', () => {
    expect(creator).toMatch(/tipBanner:\s*\{[\s\S]*?backgroundColor: C\.soft/);
    expect(creator).toMatch(/bulb-outline[\s\S]*?color="#FFFFFF"/);
    expect(creator).toMatch(/chevron-forward[\s\S]*?color="#FFFFFF"/);
    expect(creator).toMatch(/tipText:.*color: '#FFFFFF'/);
    expect(creator).not.toMatch(/tipText:.*color: C\.deep/);
  });

  it('does not turn the card white and does not introduce a green accent', () => {
    const tipBanner = creator.match(/tipBanner:\s*\{([\s\S]*?)\n\s*\},/)?.[1] || '';
    expect(tipBanner).not.toMatch(/backgroundColor: '#?\s*(?:FFFFFF|FFF|F7F6F1|#F[0-9A-F]{5})/i);
    expect(tipBanner).not.toMatch(/#(?:2F4F3D|16392B|388E3C|1DB954|0E7A0D)/i);
    expect(creator).not.toMatch(/tipBanner[\s\S]*?color="#(?:111111|000000)"[\s\S]*?tipText/);
  });
});

describe('Issue 11 — My Reels thumbnails resolve through the shared poster/first-frame path', () => {
  it('VendorReelsManagementScreen renders via getReelThumbnail + hasValidImageUrl', () => {
    const vendor = read('screens/VendorReelsManagementScreen.tsx');
    expect(vendor).toMatch(/getReelThumbnail\(item\)/);
    expect(vendor).toMatch(/hasValidImageUrl\(thumbUri\)/);
    expect(vendor).not.toMatch(/const thumbUri = item\.thumbnail \|\| null/);
  });

  it('PlaceReelsScreen renders via getReelThumbnail + hasValidImageUrl', () => {
    const place = read('screens/PlaceReelsScreen.tsx');
    expect(place).toMatch(/hasValidImageUrl\(getReelThumbnail\(item\)\)/);
    expect(place).not.toMatch(/\{item\.thumbnail \?/);
  });

  it('CreatorReelsScreen already resolves thumbnails through getReelThumbnail', () => {
    const creator = read('screens/CreatorReelsScreen.tsx');
    expect(creator).toMatch(/getReelThumbnail\(item, index\)/);
    expect(creator).toMatch(/hasValidImageUrl\(getReelThumbnail\(item, index\)\)/);
  });

  it('getReelThumbnail supports thumbnail, poster, preview, image-reel, and derived-poster sources', () => {
    const reelService = read('services/reelService.ts');
    expect(reelService).toMatch(/reel\?\.thumbnail/);
    expect(reelService).toMatch(/thumbnailUrl/);
    expect(reelService).toMatch(/posterUrl/);
    expect(reelService).toMatch(/previewUrl/);
    expect(reelService).toMatch(/isStaticImageUrl/);
    expect(reelService).toMatch(/deriveReelPosterFromVideo/);
  });

  it('vendor cards, profile, and list resolve posters through getReelThumbnail', () => {
    const mapCard = read('components/MapVendorDetailCard.tsx');
    const profile = read('screens/VendorProfileScreen.tsx');
    const vendorReels = read('screens/VendorReelsScreen.tsx');
    const tagged = read('components/TaggedReelReviewRow.tsx');
    const mapper = read('features/mapExplore/utils/mapVendorReelToFeed.ts');
    const spot = read('screens/SpotDetailScreen.tsx');

    expect(mapCard).toMatch(/getReelThumbnail\(reel\)/);
    expect(mapCard).toMatch(/hasValidImageUrl\(thumb\)/);
    expect(profile).toMatch(/hasValidImageUrl\(getReelThumbnail\(reel\)\)/);
    expect(vendorReels).toMatch(/hasValidImageUrl\(getReelThumbnail\(item\)\)/);
    expect(tagged).toMatch(/getReelThumbnail\(reel\)/);
    expect(mapper).toMatch(/thumbnail: getReelThumbnail\(reel\)/);
    expect(spot).toMatch(/hasValidImageUrl\(getReelThumbnail\(reel\)\)/);
    expect(mapCard).not.toMatch(/reel\.thumbnail \|\| deriveReelPosterFromVideo/);
    expect(profile).not.toMatch(/\{reel\.thumbnail \?/);
  });
});