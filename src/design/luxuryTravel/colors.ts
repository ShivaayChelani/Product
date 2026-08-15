/** Luxury Travel home palette — light theme (dark tokens mirror for future theme toggle). */
export const LuxuryTravelColors = {
  light: {
    background: '#FFFFFF',
    card: '#FFFFFF',
    primaryBrown: '#6E4424',
    accentBrown: '#B8895A',
    border: '#ECE3D8',
    textPrimary: '#2D241D',
    textSecondary: '#7A7068',
    divider: '#EFE7DD',
    success: '#5F8A55',
    error: '#C94C4C',
    palPoints: '#D4843A',
    palPointsSoft: '#F3E0CC',
    mapFab: '#2D241D',
    overlayDark: 'rgba(45, 36, 29, 0.45)',
    white: '#FFFFFF',
  },
  dark: {
    background: '#1A1612',
    card: '#2A241E',
    primaryBrown: '#C9A27B',
    accentBrown: '#B8895A',
    border: '#3D352C',
    textPrimary: '#FFFFFF',
    textSecondary: '#A89E94',
    divider: '#3D352C',
    success: '#7BA872',
    error: '#E57373',
    palPoints: '#E8A55A',
    palPointsSoft: '#3D2E22',
    mapFab: '#FFFFFF',
    overlayDark: 'rgba(0, 0, 0, 0.55)',
    white: '#FFFFFF',
  },
} as const;

export type LuxuryColorScheme = keyof typeof LuxuryTravelColors;
