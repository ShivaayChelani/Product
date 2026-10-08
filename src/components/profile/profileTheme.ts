import { SERIF, SERIF_REG, SANS, SANS_BOLD, SANS_SEMI } from '../../features/travellerProfile/theme';
import { palette } from '../../config/theme';

export const ProfileColors = {
  bg: palette.surface,
  card: palette.surface,
  text: '#1C1614',
  textMuted: palette.textSecondary,
  textSecondary: palette.textSecondary,
  gold: palette.primary,
  goldDark: palette.warning,
  goldLight: palette.primaryLight,
  darkCard: palette.text,
  darkCardAlt: palette.text,
  border: palette.primaryLight,
  divider: palette.background,
  badgeOrange: palette.textSecondary,
  progressBg: palette.primaryLight,
  progressFill: palette.primary,
  premiumBtn: palette.primaryLight,
  premiumBtnText: palette.text,
  danger: palette.error,
} as const;

export { SERIF, SERIF_REG, SANS, SANS_BOLD, SANS_SEMI };
