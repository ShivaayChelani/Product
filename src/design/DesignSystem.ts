export const PalSafarDesign = {
  colors: {
    light: {
      // Home-screen cream / bronze palette (canonical app light theme)
      primary: '#B9834B',
      primaryDark: '#63300E',
      primaryLight: '#D4A87A',
      primarySoft: 'rgba(185, 131, 75, 0.12)',
      highlight: '#D4A87A',
      buttonText: '#FFFFFF',
      secondary: '#8B6B3A',
      secondaryDark: '#63300E',
      secondarySoft: 'rgba(139, 107, 58, 0.12)',
      accent: '#B9834B',
      accentDark: '#8B6B3A',
      accentSoft: 'rgba(185, 131, 75, 0.12)',
      success: '#2ECC71',
      successSoft: 'rgba(46, 204, 113, 0.12)',
      warning: '#FF9F1C',
      warningSoft: 'rgba(255, 159, 28, 0.12)',
      danger: '#FF5A5F',
      dangerSoft: 'rgba(255, 90, 95, 0.12)',
      error: '#FF5A5F',

      background: '#FEF0E3',
      backgroundSecondary: '#FEF0E3',
      surface: '#FFFFFF',
      surfaceElevated: '#F9F9F9',
      surfaceSoft: '#FEF0E3',
      surfaceHover: '#F9F9F9',
      card: '#FFFFFF',
      cardHover: '#F9F9F9',

      text: '#2C1810',
      textSecondary: '#8B7355',
      textMuted: '#B8A88A',
      textInverse: '#FFFFFF',
      textLink: '#B9834B',

      border: 'rgba(200, 155, 60, 0.15)',
      borderSoft: 'rgba(200, 155, 60, 0.08)',
      borderFocus: '#B9834B',
      borderError: '#FF5A5F',

      overlay: 'rgba(44, 24, 16, 0.45)',
      overlayLight: 'rgba(44, 24, 16, 0.2)',

      shadow: 'rgba(200, 155, 60, 0.15)',
      shadowMedium: 'rgba(185, 131, 75, 0.2)',
      shadowStrong: 'rgba(99, 48, 14, 0.25)',
      glow: 'rgba(185, 131, 75, 0.35)',

      mapWater: '#A8C5D4',
      mapLand: '#E8D9C4',
      mapRoad: '#D4C4A8',
      mapRoute: '#B9834B',
      hiddenGem: '#D4A87A',
      heritage: '#B9834B',
      nature: '#2ECC71',
      water: '#4FC3F7',
      reward: '#B9834B',

      gradient: {
        primary: ['#B9834B', '#D4A87A'],
        primaryReverse: ['#D4A87A', '#B9834B'],
        secondary: ['#FFFFFF', '#F9F9F9'],
        accent: ['#B9834B', '#8B6B3A'],
        gold: ['#B9834B', '#D4A87A'],
        sunset: ['#FF5A5F', '#FF9F1C'],
        ocean: ['#4FC3F7', '#2ECC71'],
        dark: ['#63300E', '#8B6B3A'],
        cream: ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
      },
    },

    dark: {
      primary: '#B9834B',
      primaryDark: '#63300E',
      primaryLight: '#D4A87A',
      primarySoft: 'rgba(185, 131, 75, 0.15)',
      highlight: '#D4A87A',
      buttonText: '#FFFFFF',
      secondary: '#D4A87A',
      secondaryDark: '#8B6B3A',
      secondarySoft: 'rgba(212, 168, 122, 0.15)',
      accent: '#B9834B',
      accentDark: '#8B6B3A',
      accentSoft: 'rgba(185, 131, 75, 0.15)',
      success: '#2ECC71',
      successSoft: 'rgba(46, 204, 113, 0.15)',
      warning: '#FF9F1C',
      warningSoft: 'rgba(255, 159, 28, 0.15)',
      danger: '#FF5A5F',
      dangerSoft: 'rgba(255, 90, 95, 0.15)',
      error: '#FF5A5F',

      background: '#1A120C',
      backgroundSecondary: '#241810',
      surface: '#2A1E14',
      surfaceElevated: '#3A2A1C',
      surfaceSoft: '#20160E',
      surfaceHover: '#3A2A1C',
      card: '#2A1E14',
      cardHover: '#3A2A1C',

      text: '#FFFFFF',
      textSecondary: '#D4C4A8',
      textMuted: '#8B7355',
      textInverse: '#2C1810',
      textLink: '#D4A87A',

      border: 'rgba(185, 131, 75, 0.25)',
      borderSoft: 'rgba(185, 131, 75, 0.12)',
      borderFocus: '#B9834B',
      borderError: '#FF5A5F',

      overlay: 'rgba(0, 0, 0, 0.7)',
      overlayLight: 'rgba(0, 0, 0, 0.5)',

      shadow: 'rgba(0, 0, 0, 0.4)',
      shadowMedium: 'rgba(0, 0, 0, 0.5)',
      shadowStrong: 'rgba(0, 0, 0, 0.6)',
      glow: 'rgba(185, 131, 75, 0.4)',

      mapWater: '#0F1620',
      mapLand: '#162218',
      mapRoad: '#1C1C1E',
      mapRoute: '#B9834B',
      hiddenGem: '#D4A87A',
      heritage: '#B9834B',
      nature: '#2ECC71',
      water: '#4FC3F7',
      reward: '#B9834B',

      gradient: {
        primary: ['#B9834B', '#63300E'],
        primaryReverse: ['#63300E', '#B9834B'],
        secondary: ['#D4A87A', '#8B6B3A'],
        accent: ['#B9834B', '#8B6B3A'],
        gold: ['#B9834B', '#D4A87A'],
        sunset: ['#FF5A5F', '#FF9F1C'],
        ocean: ['#3DA5FF', '#4FC3F7'],
        dark: ['#1A120C', '#2A1E14'],
        cream: ['#1A120C', '#241810', '#1A120C'],
      },
    },
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
      shadowColor: '#B9834B',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
      elevation: 8,
    },
    goldGlow: {
      shadowColor: '#B9834B',
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

export type PalColors = typeof Pal.colors.light;
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
  backgroundColor: 'rgba(251, 239, 226, 0.92)',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(200, 155, 60, 0.15)',
  shadowColor: 'rgba(185, 131, 75, 0.25)',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 12,
  elevation: 4,
};
