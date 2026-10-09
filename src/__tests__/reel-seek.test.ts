import {
  canSeekActiveReel,
  clampReelProgress,
  percentToSeekTime,
  progressFromDrag,
  progressFromTrackX,
  seekVideoToPercent,
  shouldAcceptProgressAfterSeek,
  shouldClaimHorizontalScrub,
  shouldYieldToVerticalPaging,
} from '../components/reels/reelSeek';

describe('reel progress percentage math', () => {
  it('converts a track tap position into a clamped progress percentage', () => {
    expect(progressFromTrackX(0, 200)).toBe(0);
    expect(progressFromTrackX(50, 200)).toBe(0.25);
    expect(progressFromTrackX(200, 200)).toBe(1);
  });

  it('seeks backward and forward while dragging the thumb', () => {
    expect(progressFromDrag(0.5, 40, 200)).toBe(0.7);
    expect(progressFromDrag(0.5, -40, 200)).toBe(0.3);
  });

  it('clamps out-of-range percentages including 0% and 100%', () => {
    expect(clampReelProgress(-1)).toBe(0);
    expect(clampReelProgress(0)).toBe(0);
    expect(clampReelProgress(1)).toBe(1);
    expect(clampReelProgress(2)).toBe(1);
    expect(clampReelProgress(Number.NaN)).toBe(0);
    expect(progressFromTrackX(-20, 200)).toBe(0);
    expect(progressFromTrackX(400, 200)).toBe(1);
    expect(progressFromDrag(0.9, 80, 200)).toBe(1);
    expect(progressFromDrag(0.1, -80, 200)).toBe(0);
  });

  it('returns 0 when the track width is not laid out yet', () => {
    expect(progressFromTrackX(40, 0)).toBe(0);
    expect(progressFromDrag(0.4, 10, 0)).toBe(0.4);
  });
});

describe('percent to native seek time', () => {
  it('converts progress percentage to seconds on the loaded duration', () => {
    expect(percentToSeekTime(40, 0.25)).toBe(10);
    expect(percentToSeekTime(40, 0.75)).toBe(30);
    expect(percentToSeekTime(40, 0)).toBe(0);
    expect(percentToSeekTime(40, 1)).toBe(40);
  });

  it('refuses zero, unknown, or invalid durations', () => {
    expect(percentToSeekTime(0, 0.5)).toBeNull();
    expect(percentToSeekTime(-4, 0.5)).toBeNull();
    expect(percentToSeekTime(Number.NaN, 0.5)).toBeNull();
    expect(percentToSeekTime(12, Number.NaN)).toBeNull();
  });
});

describe('native reel seeking', () => {
  it('seeks backward and forward by a percentage of the loaded duration', () => {
    const player = { seek: jest.fn() };

    seekVideoToPercent(player, 40, 0.25);
    seekVideoToPercent(player, 40, 0.75);

    expect(player.seek).toHaveBeenNthCalledWith(1, 10);
    expect(player.seek).toHaveBeenNthCalledWith(2, 30);
  });

  it('clamps seeks to the native video duration', () => {
    const player = { seek: jest.fn() };

    seekVideoToPercent(player, 40, -1);
    seekVideoToPercent(player, 40, 2);

    expect(player.seek).toHaveBeenNthCalledWith(1, 0);
    expect(player.seek).toHaveBeenNthCalledWith(2, 40);
  });

  it('does not seek when duration is zero or the player is missing', () => {
    const player = { seek: jest.fn() };
    seekVideoToPercent(player, 0, 0.5);
    seekVideoToPercent(null, 40, 0.5);
    expect(player.seek).not.toHaveBeenCalled();
  });
});

describe('horizontal scrub vs vertical reel paging', () => {
  it('claims horizontal thumb drags and yields vertical paging swipes', () => {
    expect(shouldClaimHorizontalScrub(20, 4)).toBe(true);
    expect(shouldClaimHorizontalScrub(-20, 4)).toBe(true);
    expect(shouldClaimHorizontalScrub(4, 20)).toBe(false);
    expect(shouldYieldToVerticalPaging(4, 20, false)).toBe(true);
    expect(shouldYieldToVerticalPaging(20, 4, true)).toBe(false);
  });
});

describe('playback progress after seek', () => {
  it('ignores stale currentTime until the player reaches the seek target', () => {
    expect(shouldAcceptProgressAfterSeek({
      now: 100,
      suppressUntil: 500,
      currentTime: 2,
      seekTargetTime: 20,
    })).toBe(false);
    expect(shouldAcceptProgressAfterSeek({
      now: 100,
      suppressUntil: 500,
      currentTime: 20.1,
      seekTargetTime: 20,
    })).toBe(true);
    expect(shouldAcceptProgressAfterSeek({
      now: 600,
      suppressUntil: 500,
      currentTime: 2,
      seekTargetTime: 20,
    })).toBe(true);
  });
});

describe('active reel seek gating', () => {
  it('only allows the active loaded reel to receive a seek command', () => {
    expect(canSeekActiveReel({ isActive: true, hasPlayer: true, durationSeconds: 12 })).toBe(true);
    expect(canSeekActiveReel({ isActive: false, hasPlayer: true, durationSeconds: 12 })).toBe(false);
    expect(canSeekActiveReel({ isActive: true, hasPlayer: false, durationSeconds: 12 })).toBe(false);
    expect(canSeekActiveReel({ isActive: true, hasPlayer: true, durationSeconds: 0 })).toBe(false);
  });
});
