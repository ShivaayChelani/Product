import { SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../../features/myTrips/theme';
import { palette } from '../../config/theme';

/** Mockup palette — cream screen, white cards, dark brown + gold accents. */
export const TripsColors = {
  bg: palette.surface,
  card: palette.surface,
  cardAlt: palette.background,
  cardBorder: palette.border,
  dark: palette.text,
  darkAlt: palette.text,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textSecondary,
  creamText: palette.surface,
  gold: palette.primary,
  goldBadge: palette.warning,
  goldLight: palette.primaryLight,
  border: palette.border,
  tabInactiveBg: palette.surface,
  iconMuted: palette.textSecondary,
  itineraryBtnBg: palette.surface,
  itineraryBtnText: palette.text,
  coinCircleBg: palette.primaryLight,
  confirmedBg: '#F2F2F2',
  confirmedText: palette.success,
  upcomingBg: palette.background,
  upcomingText: palette.warning,
  pendingBg: palette.background,
  pendingText: palette.primary,
  overlayBg: 'rgba(0, 0, 0, 0.82)',
  shadow: palette.text,
  progressTrack: palette.primaryLight,
  progressFill: palette.primary,
  brandBlue: palette.text,
  brandBlueLight: palette.background,
  brandOrangeLight: palette.background,
  brandBrownButton: palette.warning,
} as const;

export { SERIF, SANS, SANS_BOLD, SANS_SEMI };
