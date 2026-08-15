import { Platform, type TextStyle } from 'react-native';
export const SettingsTheme = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  primary: '#6E4424',
  secondary: '#B8895A',
  border: '#ECE3D8',
  /** Primary body text — highest contrast on beige/white */
  text: '#2D241D',
  textSecondary: '#5C534C',
  textMuted: '#6B635C',
  danger: '#DC4C4C',
  dangerSoft: '#FEF2F2',
  dangerBorder: 'rgba(220,76,76,0.15)',
  radius: 28,
  rowRadius: 22,
  shadow: {
    shadowColor: '#2D241D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardShadow: {
    shadowColor: '#4A3427',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

/** Playfair/Inter are optional; always pair with fontWeight so Android stays readable. */
function serifStyle(variant: 'bold' | 'regular'): TextStyle {
  const name = variant === 'bold' ? 'PlayfairDisplay-Bold' : 'PlayfairDisplay-Regular';
  const weight = variant === 'bold' ? '700' : '400';
  return Platform.select({
    ios: { fontFamily: name, fontWeight: weight },
    android: { fontFamily: name, fontWeight: weight },
    default: { fontFamily: 'Georgia', fontWeight: weight },
  }) as TextStyle;
}

function sansStyle(weight: '400' | '500' | '600' | '700'): TextStyle {
  const byWeight: Record<string, string> = {
    '400': 'Inter-Regular',
    '500': 'Inter-Medium',
    '600': 'Inter-SemiBold',
    '700': 'Inter-Bold',
  };
  const fontFamily = byWeight[weight];
  return Platform.select({
    ios: { fontFamily, fontWeight: weight },
    android: { fontFamily, fontWeight: weight },
    default: { fontWeight: weight },
  }) as TextStyle;
}

export const SettingsFonts = {
  heroTitle: {
    ...serifStyle('bold'),
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    color: SettingsTheme.primary,
  } satisfies TextStyle,
  heroSubtitle: {
    ...serifStyle('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: SettingsTheme.textSecondary,
  } satisfies TextStyle,
  sectionLabel: {
    ...sansStyle('700'),
    fontSize: 15,
    color: SettingsTheme.primary,
  } satisfies TextStyle,
  rowTitle: {
    ...sansStyle('600'),
    fontSize: 15,
    lineHeight: 20,
    color: SettingsTheme.text,
  } satisfies TextStyle,
  rowSubtitle: {
    ...sansStyle('500'),
    fontSize: 13,
    lineHeight: 18,
    color: SettingsTheme.textSecondary,
  } satisfies TextStyle,
  rowMeta: {
    ...sansStyle('500'),
    fontSize: 13,
    color: SettingsTheme.textSecondary,
  } satisfies TextStyle,
  profileName: {
    ...serifStyle('bold'),
    fontSize: 20,
    color: SettingsTheme.primary,
  } satisfies TextStyle,
  profileMeta: {
    ...sansStyle('500'),
    fontSize: 13,
    color: SettingsTheme.textSecondary,
  } satisfies TextStyle,
  signOut: {
    ...sansStyle('700'),
    fontSize: 16,
    color: SettingsTheme.danger,
  } satisfies TextStyle,
};

/** @deprecated Use SettingsFonts — kept for gradual migration */
export const SERIF = 'PlayfairDisplay-Bold';
export const SERIF_REG = 'PlayfairDisplay-Regular';
export const SANS = 'Inter-Medium';
export const SANS_BOLD = 'Inter-Bold';
export const SANS_SEMI = 'Inter-SemiBold';

export const SETTINGS_HERO = require('../../../src/assets/settings_hero.jpg');
