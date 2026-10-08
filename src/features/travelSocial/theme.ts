import { palette } from '../../config/theme';
/** Premium travel social — matches luxury Home spec */
export const TravelSocialTheme = {
  background: palette.surface,
  card: palette.surface,
  primary: palette.primary,
  secondary: palette.textSecondary,
  border: palette.border,
  textPrimary: palette.text,
  textSecondary: palette.textSecondary,
  verifiedGold: palette.textSecondary,
  radiusCard: 28,
  radiusButton: 28,
  radiusPill: 999,
  shadow: {
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;
