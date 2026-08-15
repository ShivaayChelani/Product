import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Floating pill heights — keep in sync with tab navigators */
export const MAIN_TAB_BAR_HEIGHT = 64;
export const MAIN_TAB_FAB_OVERHANG = 18;
export const MAIN_TAB_BAR_BOTTOM_GAP = 12;
export const MAIN_TAB_CONTENT_GAP = 28;

export const STUDIO_TAB_BAR_HEIGHT = 66;
export const STUDIO_TAB_BAR_BOTTOM_GAP = 12;
export const STUDIO_TAB_CONTENT_GAP = 28;

export function getMainTabBarClearance(bottomInset: number): number {
  const floatGap = Math.max(bottomInset, MAIN_TAB_BAR_BOTTOM_GAP);
  return MAIN_TAB_BAR_HEIGHT + MAIN_TAB_FAB_OVERHANG + floatGap + MAIN_TAB_CONTENT_GAP;
}

export function getStudioTabBarClearance(bottomInset: number): number {
  const floatGap = Math.max(bottomInset, STUDIO_TAB_BAR_BOTTOM_GAP);
  return STUDIO_TAB_BAR_HEIGHT + floatGap + STUDIO_TAB_CONTENT_GAP;
}

/** Alias used by Vendor screens (same geometry as Creator studio tabs). */
export const getVendorTabBarClearance = getStudioTabBarClearance;

export function useMainTabScreenInsets() {
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const tabClearance = getMainTabBarClearance(insets.bottom);
    return {
      top: insets.top,
      bottom: insets.bottom,
      left: insets.left,
      right: insets.right,
      headerPadTop: Math.max(insets.top, 8) + 8,
      scrollPadBottom: tabClearance,
      tabClearance,
      tabBarBottom: Math.max(insets.bottom, MAIN_TAB_BAR_BOTTOM_GAP),
    };
  }, [insets.top, insets.bottom, insets.left, insets.right]);
}

export function useStudioTabScreenInsets(options?: { withTabBar?: boolean }) {
  const insets = useSafeAreaInsets();
  const withTabBar = options?.withTabBar !== false;
  return useMemo(() => {
    const tabClearance = withTabBar
      ? getStudioTabBarClearance(insets.bottom)
      : insets.bottom + STUDIO_TAB_CONTENT_GAP;
    return {
      top: insets.top,
      bottom: insets.bottom,
      left: insets.left,
      right: insets.right,
      headerPadTop: Math.max(insets.top, 8) + 8,
      scrollPadBottom: tabClearance,
      tabClearance,
      tabBarBottom: Math.max(insets.bottom, STUDIO_TAB_BAR_BOTTOM_GAP),
    };
  }, [insets.top, insets.bottom, insets.left, insets.right, withTabBar]);
}
