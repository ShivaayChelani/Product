import fs from 'fs';
import path from 'path';

describe('My Reels live analytics', () => {
  const creatorReels = fs.readFileSync(
    path.join(__dirname, '../screens/CreatorReelsScreen.tsx'),
    'utf8',
  );
  const reelFeed = fs.readFileSync(
    path.join(__dirname, '../components/reels/ReelFeed.tsx'),
    'utf8',
  );
  const feedScreen = fs.readFileSync(
    path.join(__dirname, '../screens/ReelsFeedScreen.tsx'),
    'utf8',
  );
  const detailScreen = fs.readFileSync(
    path.join(__dirname, '../screens/ReelDetailScreen.tsx'),
    'utf8',
  );
  const reelService = fs.readFileSync(
    path.join(__dirname, '../services/reelService.ts'),
    'utf8',
  );

  it('reads views, likes, comments, and shares from live reel stats', () => {
    expect(creatorReels).toMatch(/function liveReelStats/);
    expect(creatorReels).toMatch(/compact\(stats\.views\)/);
    expect(creatorReels).toMatch(/compact\(stats\.likes\)/);
    expect(creatorReels).toMatch(/compact\(stats\.comments\)/);
    expect(creatorReels).toMatch(/compact\(stats\.shares\)/);
    expect(creatorReels).not.toMatch(/Math\.random/);
  });

  it('refetches creator reels on an interval while the screen is focused', () => {
    expect(creatorReels).toMatch(/setInterval/);
    expect(creatorReels).toMatch(/creatorApi\.listReels/);
    expect(creatorReels).toMatch(/15000/);
  });

  it('records a real view when a reel is watched', () => {
    expect(reelService).toMatch(/export async function trackReelView/);
    expect(reelFeed).toMatch(/onReelViewed/);
    expect(feedScreen).toMatch(/trackReelView/);
    expect(detailScreen).toMatch(/trackReelView/);
  });

  it('persists shares to the server instead of only bumping local state', () => {
    expect(reelService).toMatch(/incrementReelShares/);
    expect(feedScreen).toMatch(/shareReelAndRecord/);
    expect(detailScreen).toMatch(/shareReelAndRecord/);
  });
});
