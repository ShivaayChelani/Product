import fs from 'fs';
import path from 'path';
import {
  isReelNearActive,
  selectSettledReelIndex,
  shouldMountReelVideo,
} from '../components/reels/reelFeedPlayback';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Moments feed settled playback', () => {
  it('rounds a paging offset to a single in-range index', () => {
    expect(selectSettledReelIndex(0, 800, 12)).toBe(0);
    expect(selectSettledReelIndex(799, 800, 12)).toBe(1);
    expect(selectSettledReelIndex(1600, 800, 12)).toBe(2);
    expect(selectSettledReelIndex(8800, 800, 4)).toBe(3);
    expect(selectSettledReelIndex(-40, 800, 4)).toBe(0);
  });

  it('ignores incomplete layout or empty feeds', () => {
    expect(selectSettledReelIndex(400, 0, 4)).toBeNull();
    expect(selectSettledReelIndex(400, 800, 0)).toBeNull();
    expect(selectSettledReelIndex(Number.NaN, 800, 4)).toBeNull();
  });

  it('keeps chrome for the settled page and its immediate neighbours only', () => {
    expect(isReelNearActive(4, 5)).toBe(true);
    expect(isReelNearActive(5, 5)).toBe(true);
    expect(isReelNearActive(6, 5)).toBe(true);
    expect(isReelNearActive(7, 5)).toBe(false);
    expect(isReelNearActive(3, 5)).toBe(false);
  });

  it('mounts a native video only for the focused settled page', () => {
    expect(shouldMountReelVideo(5, 5, true)).toBe(true);
    expect(shouldMountReelVideo(4, 5, true)).toBe(false);
    expect(shouldMountReelVideo(6, 5, true)).toBe(false);
    expect(shouldMountReelVideo(5, 5, false)).toBe(false);
  });

  it('does not change the active page from viewability mid-fling', () => {
    const feed = read('components/reels/ReelFeed.tsx');
    expect(feed).not.toMatch(/onViewableItemsChanged/);
    expect(feed).not.toMatch(/itemVisiblePercentThreshold/);
    expect(feed).toMatch(/onMomentumScrollEnd=\{onMomentumScrollEnd\}/);
    expect(feed).toMatch(/onScrollEndDrag=\{onScrollEndDrag\}/);
    expect(feed).toMatch(/selectSettledReelIndex/);
    expect(feed).toMatch(/shouldMountReelVideo/);
    expect(feed).toMatch(/keyExtractor=\{keyExtractor\}/);
    expect(feed).toMatch(/item\.id \|\| `reel-\$\{index\}`/);
  });

  it('unmounts react-native-video when the card is not the active page', () => {
    const player = read('components/reels/ReelPlayer.tsx');
    expect(player).toMatch(/showVideo && isActive/);
    expect(player).not.toMatch(/onViewableItemsChanged/);
  });
});
