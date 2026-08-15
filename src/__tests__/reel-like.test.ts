import {
  applyReelLikeResult,
  mergeLikedIds,
  isReelCurrentlyLiked,
} from '../services/reels/reelLikeState';

describe('reel like state', () => {
  const reel = { id: 'reel_abc12345', likes: 4, isLiked: false };

  it('treats a like as liked and increments count', () => {
    const next = applyReelLikeResult([reel], reel.id, { isLiked: true, delta: 1 });
    expect(next[0].isLiked).toBe(true);
    expect(next[0].likes).toBe(5);
  });

  it('treats unlike as not liked and decrements count without going negative', () => {
    const liked = { ...reel, likes: 1, isLiked: true };
    const next = applyReelLikeResult([liked], liked.id, { isLiked: false, delta: -1 });
    expect(next[0].isLiked).toBe(false);
    expect(next[0].likes).toBe(0);

    const empty = applyReelLikeResult(
      [{ ...reel, likes: 0, isLiked: true }],
      reel.id,
      { isLiked: false, delta: -1 },
    );
    expect(empty[0].likes).toBe(0);
  });

  it('does not apply a like to a different reel', () => {
    const next = applyReelLikeResult([reel], 'other_reel_id', { isLiked: true, delta: 1 });
    expect(next[0]).toEqual(reel);
  });

  it('records liked ids without duplicates and removes them on unlike', () => {
    expect(mergeLikedIds(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(mergeLikedIds(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(mergeLikedIds(['a', 'b'], 'b', false)).toEqual(['a']);
  });

  it('uses feed isLiked when the local liked-id list has not been seeded', () => {
    expect(isReelCurrentlyLiked('reel_abc12345', [], true)).toBe(true);
    expect(isReelCurrentlyLiked('reel_abc12345', [], false)).toBe(false);
    expect(isReelCurrentlyLiked('reel_abc12345', ['reel_abc12345'], false)).toBe(true);
  });
});
