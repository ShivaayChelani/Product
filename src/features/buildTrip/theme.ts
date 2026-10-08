import { palette } from '../../config/theme';
export const BT = {
  bg: palette.surface,
  card: palette.surface,
  primary: palette.primaryDark,
  secondary: palette.textSecondary,
  accent: palette.primary,
  border: palette.border,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textSecondary,
  selectedBg: palette.primaryLight,
  radius: 18,
  shadow: {
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
};

export const SERIF = 'PlayfairDisplay-Bold';
export const SANS = 'Inter-Medium';
export const SANS_BOLD = 'Inter-Bold';
export const SANS_SEMI = 'Inter-SemiBold';
