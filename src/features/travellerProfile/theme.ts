import { palette } from '../../config/theme';
export const TravellerProfileTheme = {
  bg: palette.surface,
  card: palette.surface,
  primary: palette.primary,
  secondary: palette.textSecondary,
  border: palette.border,
  text: palette.text,
  textSecondary: palette.textSecondary,
  radius: 28,
  shadow: {
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

export const SERIF = 'PlayfairDisplay-Bold';
export const SERIF_REG = 'PlayfairDisplay-Regular';
export const SANS = 'Inter-Medium';
export const SANS_BOLD = 'Inter-Bold';
export const SANS_SEMI = 'Inter-SemiBold';
