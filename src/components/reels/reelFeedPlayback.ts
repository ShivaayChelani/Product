/** Settled page from a paging FlashList offset. Mid-fling offsets are ignored by callers. */
export function selectSettledReelIndex(
  offsetY: number,
  viewportHeight: number,
  count: number,
): number | null {
  if (!(viewportHeight > 0) || count <= 0 || !Number.isFinite(offsetY)) return null;
  return Math.max(0, Math.min(count - 1, Math.round(offsetY / viewportHeight)));
}

export function isReelNearActive(index: number, activeIndex: number, window = 1): boolean {
  return Math.abs(index - activeIndex) <= window;
}

/** Only the focused, settled page should create a native video player. */
export function shouldMountReelVideo(
  index: number,
  activeIndex: number,
  isTabFocused = true,
): boolean {
  return isTabFocused && index === activeIndex;
}
