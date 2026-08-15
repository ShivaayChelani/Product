import { getMainTabBarClearance } from '../../design/tabBarLayout';

export type ReelLayoutMode = 'tab' | 'fullscreen';

/** Heights/gaps for bottom overlay — keep in sync with ReelBottomPanel styles */
export const REEL_COMMENT_BAR_H = 0; // Removed comment bar
export const REEL_PROGRESS_H = 3;
export const REEL_BOTTOM_GAP = 10;
export const REEL_CAPTION_BLOCK_H = 64;

/** Extra gap between bottom panel and action rail — tune this to move the rail up/down */
export const REEL_ACTION_RAIL_GAP = 24;

export type ReelActionRailPosition = {
  /** Distance from bottom of reel card; overrides calculated value when set */
  bottom?: number;
  right?: number;
  /** Added to the calculated bottom offset */
  bottomAdjust?: number;
};

export function getReelOverlayInsets(bottomInset: number, mode: ReelLayoutMode = 'tab') {
  const tabClearance = mode === 'tab'
    ? getMainTabBarClearance(bottomInset)
    : Math.max(bottomInset, 12) + 12;

  const bottomStackHeight =
    REEL_PROGRESS_H +
    REEL_BOTTOM_GAP +
    REEL_CAPTION_BLOCK_H;

  return {
    tabClearance,
    actionsBottom: tabClearance + bottomStackHeight + REEL_ACTION_RAIL_GAP,
    contentPaddingBottom: tabClearance,
  };
}

export function getReelActionRailPosition(
  bottomInset: number,
  mode: ReelLayoutMode = 'tab',
  override?: ReelActionRailPosition,
) {
  const insets = getReelOverlayInsets(bottomInset, mode);
  const calculatedBottom = insets.actionsBottom + (override?.bottomAdjust ?? 0);
  return {
    bottom: override?.bottom ?? calculatedBottom,
    right: override?.right ?? 14,
  };
}
