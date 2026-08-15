import { Platform, ViewStyle } from 'react-native';

/** Soft elevation — ~8% opacity, large blur */
export function luxurySoftShadow(color = '#2D241D'): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
    },
    android: { elevation: 4 },
    default: {},
  }) as ViewStyle;
}

export function luxuryCardShadow(): ViewStyle {
  return luxurySoftShadow('#6E4424');
}
