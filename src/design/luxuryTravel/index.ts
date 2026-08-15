export { LuxuryTravelColors, type LuxuryColorScheme } from './colors';
export { LuxuryTypography } from './typography';
export { LuxurySpacing, MAX_HOME_CONTENT_WIDTH } from './spacing';
export { LuxuryRadii } from './radii';
export { luxurySoftShadow, luxuryCardShadow } from './shadows';

import { LuxuryTravelColors } from './colors';

/** Default home theme tokens (light). */
export function getLuxuryTheme(scheme: 'light' | 'dark' = 'light') {
  return LuxuryTravelColors[scheme];
}
