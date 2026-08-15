import { SERIF, SERIF_REG, SANS, SANS_BOLD, SANS_SEMI } from './profileTheme';

export const PI = {
  bg: '#FEF0E3',
  card: '#FFFFFF',
  inputBg: '#FFFBF7',
  border: '#E8DDD0',
  text: '#2C1810',
  textSecondary: '#8B7355',
  textMuted: '#A39990',
  dark: '#2D241D',
  darkBtnText: '#E5D5C5',
  accent: '#63300E',
  chipSelected: '#F9F9F9',
  chipSelectedBorder: '#D9C4A8',
  verified: '#2E7D32',
  verifiedBg: '#E8F5E9',
  divider: '#E5D5C5',
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
