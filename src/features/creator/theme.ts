import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STUDIO_TAB_BAR_HEIGHT,
  STUDIO_TAB_CONTENT_GAP,
  getStudioTabBarClearance,
} from '../../design/tabBarLayout';

/** Shared creator studio tokens — cream/bronze chrome (aligned with VendorUI) */
export const CreatorUI = {
  colors: {
    bg: '#FFFFFF',
    white: '#FFFFFF',
    surface: '#FFFFFF',
    soft: '#FDECBF',
    peach: '#F8E8D8',
    text: '#2C1810',
    textSecondary: '#6D6D6D',
    textMuted: '#A39990',
    primary: '#7B4A22',
    primaryDark: '#2C1810',
    bronze: '#9A6B29',
    deep: '#2C1810',
    border: '#EBE0D0',
    success: '#059669',
    successBg: '#E8F7EE',
    danger: '#DC4C4C',
    shadow: 'rgba(44, 24, 16, 0.14)',
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
    full: 999,
  },
  typography: {
    title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
    section: { fontSize: 16, fontWeight: '800' as const },
    body: { fontSize: 14, fontWeight: '500' as const },
    caption: { fontSize: 12, fontWeight: '600' as const },
  },
  buttonHeight: 48,
  headerBtnSize: 40,
};

/** @deprecated Prefer CreatorUI — kept for existing imports */
export const CreatorTheme = {
  bg: CreatorUI.colors.bg,
  card: CreatorUI.colors.surface,
  accent: CreatorUI.colors.primary,
  text: CreatorUI.colors.text,
  textSecondary: CreatorUI.colors.textSecondary,
  border: CreatorUI.colors.border,
  success: CreatorUI.colors.success,
  radius: CreatorUI.radius.xl,
  shadow: {
    shadowColor: CreatorUI.colors.deep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export function useCreatorScreenInsets(options?: { withTabBar?: boolean }) {
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
      tabBarHeight: STUDIO_TAB_BAR_HEIGHT,
    };
  }, [insets.top, insets.bottom, insets.left, insets.right, withTabBar]);
}
