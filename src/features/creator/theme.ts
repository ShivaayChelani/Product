import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STUDIO_TAB_BAR_HEIGHT,
  STUDIO_TAB_CONTENT_GAP,
  getStudioTabBarClearance,
} from '../../design/tabBarLayout';
import { palette } from '../../config/theme';

/** Shared creator studio tokens backed by the canonical PalSafar palette. */
export const CreatorUI = {
  colors: {
    bg: palette.surface,
    white: palette.surface,
    surface: palette.surface,
    soft: palette.primaryLight,
    peach: palette.primaryLight,
    text: palette.text,
    textSecondary: palette.textSecondary,
    textMuted: palette.textSecondary,
    primary: palette.primary,
    primaryDark: palette.primaryDark,
    bronze: palette.primary,
    deep: palette.text,
    border: palette.border,
    success: palette.success,
    successBg: palette.successSoft,
    danger: palette.error,
    shadow: 'rgba(29, 36, 32, 0.14)',
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
