import { CommonActions } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { MainTabParamList } from './types';

/** PalPoints / Wallet → Map → Vendors → pick a business to review. */
export function buildVendorReviewMapParams(): NonNullable<MainTabParamList['Map']> {
  return {
    initialMapTab: 'vendors',
    reviewMode: true,
    mapTabKey: Date.now(),
  };
}

/** Navigate to Map and force the Vendors layer (works when Map tab is already mounted). */
export function navigateToVendorReviewMap(navigation: NavigationProp<ParamListBase>) {
  navigation.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: {
        screen: 'Map',
        params: buildVendorReviewMapParams(),
      },
    }),
  );
}
