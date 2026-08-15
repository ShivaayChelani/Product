import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { MainTabParamList } from './types';

/** PalPoints / Wallet → Map → Vendors tab. */
export function buildVendorReviewMapParams(): NonNullable<MainTabParamList['Map']> {
  return {
    initialMapTab: 'vendors',
    reviewMode: true,
    mapTabKey: Date.now(),
  };
}

/** Open Map on the Vendors layer, even if Map is already mounted. */
export function navigateToVendorReviewMap(navigation: NavigationProp<ParamListBase>) {
  (navigation.navigate as (name: string, params?: object) => void)('MainTabs', {
    screen: 'Map',
    params: buildVendorReviewMapParams(),
    merge: true,
  });
}
