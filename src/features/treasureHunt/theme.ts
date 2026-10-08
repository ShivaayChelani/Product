import { palette } from '../../config/theme';

export const TH = {
  bg: palette.background,
  card: palette.surface,
  cream: palette.primaryLight,
  primary: palette.primary,
  brown: palette.primary,
  brownDark: palette.primaryDark,
  green: palette.success,
  greenBright: palette.success,
  gold: palette.primaryLight,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textSecondary,
  border: palette.border,
  shadow: {
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  journey: {
    clues: palette.success,
    puzzle: palette.primary,
    checkin: palette.primaryDark,
    points: palette.primary,
    treasure: palette.primaryLight,
  },
};

export const SERIF = 'PlayfairDisplay-Bold';
export const SANS = 'Inter-Medium';
export const SANS_BOLD = 'Inter-Bold';
export const SANS_SEMI = 'Inter-SemiBold';
