import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STUDIO_TAB_BAR_HEIGHT,
  STUDIO_TAB_BAR_BOTTOM_GAP,
  STUDIO_TAB_CONTENT_GAP,
  getStudioTabBarClearance,
} from './tabBarLayout';

/** @deprecated Prefer STUDIO_TAB_BAR_HEIGHT — kept for existing vendor imports */
export const VENDOR_TAB_BAR_HEIGHT = STUDIO_TAB_BAR_HEIGHT;
export const VENDOR_TAB_BAR_BOTTOM_GAP = STUDIO_TAB_BAR_BOTTOM_GAP;
export const VENDOR_TAB_CONTENT_GAP = STUDIO_TAB_CONTENT_GAP;

/** Shared vendor screen tokens — cream/bronze, Creator-aligned chrome */
export const VendorUI = {
  colors: {
    bg: '#FFFFFF',
    white: '#FFFFFF',
    surface: '#FFFFFF',
    soft: '#FFFFFF',
    text: '#4D3227',
    textSecondary: '#8B7355',
    textMuted: '#B8A88A',
    primary: '#A67C52',
    primaryDark: '#63300E',
    primaryLight: '#D4A87A',
    bronze: '#B9834B',
    deep: '#4D3227',
    border: '#E9D4BE',
    borderSoft: 'rgba(200, 155, 60, 0.22)',
    success: '#059669',
    shadow: 'rgba(99, 48, 14, 0.16)',
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    screen: 16,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 20,
    tabBar: 26,
    full: 999,
  },
  typography: {
    title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
    section: { fontSize: 16, fontWeight: '800' as const },
    body: { fontSize: 14, fontWeight: '500' as const },
    caption: { fontSize: 12, fontWeight: '600' as const },
    label: { fontSize: 11, fontWeight: '600' as const },
  },
  buttonHeight: 48,
  headerBtnSize: 42,
};

export function getVendorTabBarClearance(bottomInset: number): number {
  return getStudioTabBarClearance(bottomInset);
}

/**
 * Safe-area insets + scroll padding for Vendor tab screens
 * (Home / Offers / Analytics / Profile under VendorTabs).
 */
export function useVendorScreenInsets(options?: { withTabBar?: boolean }) {
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
    };
  }, [insets.top, insets.bottom, insets.left, insets.right, withTabBar]);
}
