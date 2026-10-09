type SeekableVideo = {
  seek: (time: number) => void;
};

export const REEL_SCRUB_MIN_DX = 6;

export function clampReelProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function progressFromTrackX(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 0;
  return clampReelProgress(x / width);
}

export function progressFromDrag(startPct: number, dx: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(dx)) return clampReelProgress(startPct);
  return clampReelProgress(startPct + dx / width);
}

export function percentToSeekTime(durationSeconds: number, progress: number): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(progress)) {
    return null;
  }
  return clampReelProgress(progress) * durationSeconds;
}

export function shouldClaimHorizontalScrub(dx: number, dy: number, minDx = REEL_SCRUB_MIN_DX): boolean {
  return Math.abs(dx) > minDx && Math.abs(dx) > Math.abs(dy);
}

export function shouldYieldToVerticalPaging(dx: number, dy: number, isScrubbing: boolean): boolean {
  if (isScrubbing) return false;
  return Math.abs(dy) >= Math.abs(dx);
}

export function canSeekActiveReel(opts: {
  isActive: boolean;
  hasPlayer: boolean;
  durationSeconds: number;
}): boolean {
  return (
    opts.isActive &&
    opts.hasPlayer &&
    Number.isFinite(opts.durationSeconds) &&
    opts.durationSeconds > 0
  );
}

export function shouldAcceptProgressAfterSeek(opts: {
  now: number;
  suppressUntil: number;
  currentTime: number;
  seekTargetTime: number | null;
}): boolean {
  if (opts.seekTargetTime == null || opts.now >= opts.suppressUntil) return true;
  return Math.abs(opts.currentTime - opts.seekTargetTime) <= 0.4;
}

export function seekVideoToPercent(
  player: SeekableVideo | null,
  durationSeconds: number,
  progress: number,
): void {
  const time = percentToSeekTime(durationSeconds, progress);
  if (!player || time == null) return;
  player.seek(time);
}
