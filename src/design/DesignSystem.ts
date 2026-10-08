import { darkTheme, lightTheme } from '../config/theme';

export const PalSafarDesign = {
  colors: {
    light: lightTheme,
    dark: darkTheme,
  },

  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
    20: 80,
  },

  borderRadius: {
    none: 0,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    '2xl': 24,
    '3xl': 32,
    full: 9999,
  },

  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      semibold: 'System',
      bold: 'System',
    },
    fontSize: {
      xs: 10,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      '2xl': 22,
      '3xl': 28,
      '4xl': 34,
      '5xl': 42,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
  },

  shadows: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    xs: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 12,
    },
    glow: {
      shadowColor: '#1F4D3A',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
      elevation: 8,
    },
    goldGlow: {
      shadowColor: '#1F4D3A',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
      elevation: 8,
    },
  },

  animation: {
    duration: {
      fast: 150,
      normal: 250,
      slow: 350,
      slower: 500,
    },
    easing: {
      easeOut: 'ease-out',
      easeIn: 'ease-in',
      easeInOut: 'ease-in-out',
      spring: { tension: 200, friction: 15 },
      springSoft: { tension: 120, friction: 14 },
      springBouncy: { tension: 180, friction: 12 },
    },
  },

  breakpoints: {
    sm: 320,
    md: 375,
    lg: 414,
    xl: 768,
  },

  zIndex: {
    base: 1,
    dropdown: 10,
    sticky: 20,
    modal: 100,
    popover: 110,
    tooltip: 120,
    toast: 200,
  },
};

export type PalColors = typeof Pal.colors.light | typeof Pal.colors.dark;
export type PalTheme = 'light' | 'dark';

export const getColors = (theme: PalTheme): PalColors => Pal.colors[theme];
export const getSpacing = (n: keyof typeof Pal.spacing) => Pal.spacing[n];
export const getRadius = (n: keyof typeof Pal.borderRadius) => Pal.borderRadius[n];
export const getShadow = (n: keyof typeof Pal.shadows) => Pal.shadows[n];

type ColorsWithFlat = typeof PalSafarDesign.colors.light & typeof PalSafarDesign.colors;
export const Pal = PalSafarDesign as typeof PalSafarDesign & { colors: ColorsWithFlat };
export default Pal;
import { ViewStyle } from 'react-native';

export const colors: typeof PalSafarDesign.colors.light = PalSafarDesign.colors.light;

const _cKeys = Object.keys(PalSafarDesign.colors.light) as (keyof typeof PalSafarDesign.colors.light)[];
for (const _k of _cKeys) {
  (PalSafarDesign.colors as any)[_k] = PalSafarDesign.colors.light[_k];
}

export const glassCardStyle: ViewStyle = {
  backgroundColor: 'rgba(247, 246, 241, 0.92)',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(183, 121, 31, 0.15)',
  shadowColor: 'rgba(183, 121, 31, 0.25)',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 12,
  elevation: 4,
};
