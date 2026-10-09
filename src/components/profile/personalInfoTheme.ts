import { SERIF, SERIF_REG, SANS, SANS_BOLD, SANS_SEMI } from './profileTheme';
import { palette } from '../../config/theme';

export const PI = {
  bg: palette.background,
  card: palette.surface,
  inputBg: palette.background,
  border: palette.border,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textSecondary,
  dark: palette.text,
  darkBtnText: palette.onPrimary,
  accent: palette.primaryDark,
  chipSelected: palette.background,
  chipSelectedBorder: palette.border,
  verified: palette.success,
  verifiedBg: '#F2F2F2',
  divider: palette.border,
} as const;

export { SERIF, SERIF_REG, SANS, SANS_BOLD, SANS_SEMI };

export const TRAVEL_INTERESTS = [
  { key: 'nature', label: 'Nature', icon: 'leaf-outline' },
  { key: 'adventure', label: 'Adventure', icon: 'trail-sign-outline' },
  { key: 'heritage', label: 'Heritage', icon: 'business-outline' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'culture', label: 'Culture', icon: 'color-palette-outline' },
  { key: 'wildlife', label: 'Wildlife', icon: 'paw-outline' },
  { key: 'photography', label: 'Photography', icon: 'camera-outline' },
  { key: 'spiritual', label: 'Spiritual', icon: 'flower-outline' },
  { key: 'trekking', label: 'Trekking', icon: 'walk-outline' },
  { key: 'water sports', label: 'Water Sports', icon: 'water-outline' },
  { key: 'camping', label: 'Camping', icon: 'bonfire-outline' },
  { key: 'luxury', label: 'Luxury', icon: 'diamond-outline' },
] as const;

export { INDIAN_STATES } from '../../constants/locations';

export const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Auto'] as const;

export type GenderOption = 'male' | 'female' | 'prefer_not';
