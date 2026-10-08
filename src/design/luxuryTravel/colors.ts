import { palette } from '../../config/theme';
import { darkTheme, lightTheme } from '../../config/theme';

/** Luxury Travel palette backed by the canonical PalSafar theme tokens. */
export const LuxuryTravelColors = {
  light: {
    background: palette.background,
    card: palette.surface,
    primaryBrown: palette.primary,
    accentBrown: palette.textSecondary,
    border: palette.border,
    textPrimary: palette.text,
    textSecondary: palette.textSecondary,
    divider: palette.border,
    success: palette.success,
    error: palette.error,
    palPoints: palette.primary,
    palPointsSoft: palette.primaryLight,
    mapFab: palette.primaryDark,
    overlayDark: lightTheme.overlay,
    white: palette.surface,
  },
  dark: {
    background: darkTheme.background,
    card: darkTheme.card,
    primaryBrown: palette.primary,
    accentBrown: darkTheme.textSecondary,
    border: darkTheme.border,
    textPrimary: darkTheme.text,
    textSecondary: darkTheme.textSecondary,
    divider: darkTheme.border,
    success: palette.success,
    error: palette.error,
    palPoints: palette.primaryLight,
    palPointsSoft: darkTheme.backgroundSecondary,
    mapFab: palette.primaryLight,
    overlayDark: darkTheme.overlay,
    white: palette.surface,
  },
} as const;

export type LuxuryColorScheme = keyof typeof LuxuryTravelColors;
