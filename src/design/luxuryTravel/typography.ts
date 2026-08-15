import { Platform, TextStyle } from 'react-native';

const playfair = Platform.select({
  ios: 'PlayfairDisplay-Bold',
  android: 'PlayfairDisplay-Bold',
  default: 'Georgia',
});

const playfairRegular = Platform.select({
  ios: 'PlayfairDisplay-Regular',
  android: 'PlayfairDisplay-Regular',
  default: 'Georgia',
});

const inter = (weight: string) =>
  Platform.select({
    ios: `Inter-${weight}`,
    android: `Inter-${weight}`,
    default: 'System',
  }) ?? 'System';

export const LuxuryTypography = {
  headingLarge: {
    fontFamily: playfair,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  } satisfies TextStyle,
  headingSection: {
    fontFamily: playfairRegular,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontWeight: '700',
  } satisfies TextStyle,
  headingHero: {
    fontFamily: playfair,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
  } satisfies TextStyle,
  body: {
    fontFamily: inter('Regular'),
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodyMedium: {
    fontFamily: inter('Medium'),
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodySemiBold: {
    fontFamily: inter('SemiBold'),
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  caption: {
    fontFamily: inter('Medium'),
    fontSize: 12,
    lineHeight: 16,
  } satisfies TextStyle,
  label: {
    fontFamily: inter('SemiBold'),
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
  } satisfies TextStyle,
  button: {
    fontFamily: inter('SemiBold'),
    fontSize: 14,
    lineHeight: 18,
  } satisfies TextStyle,
  tabLabel: {
    fontFamily: inter('SemiBold'),
    fontSize: 10,
    lineHeight: 12,
  } satisfies TextStyle,
};
