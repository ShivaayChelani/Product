import { palette } from '../../config/theme';
export const NotificationTheme = {
  bg: palette.surface,
  card: palette.surface,
  primary: palette.primary,
  secondary: palette.textSecondary,
  border: palette.border,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textSecondary,
  unreadDot: palette.warning,
  radius: 24,
  tabRadius: 22,
  shadow: {
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

export const SERIF = 'PlayfairDisplay-Bold';
export const SERIF_REG = 'PlayfairDisplay-Regular';
export const SANS = 'Inter-Medium';
export const SANS_BOLD = 'Inter-Bold';
export const SANS_SEMI = 'Inter-SemiBold';
