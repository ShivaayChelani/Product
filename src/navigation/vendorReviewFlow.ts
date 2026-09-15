import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { MainTabParamList } from './types';

export type MapLayerTab = 'places' | 'vendors';

/** PalPoints / Wallet → Map → Vendors tab. */
export function buildVendorReviewMapParams(): NonNullable<MainTabParamList['Map']> {
  return {
    initialMapTab: 'vendors',
    reviewMode: true,
    mapTabKey: Date.now(),
    // Tab navigators merge params; empty values replace a stale place/vendor target.
    selectedPlaceId: '',
    selectedVendorId: '',
    selectedPlaceKey: 0,
  };
}

export function resolveExplicitMapTab(
  initialMapTab?: MapLayerTab | null,
  reviewMode?: boolean,
): MapLayerTab | null {
  if (initialMapTab === 'places' || initialMapTab === 'vendors') return initialMapTab;
  if (reviewMode) return 'vendors';
  return null;
}

/** Saved map session must not override an explicit PalPoints / Home vendors route. */
export function shouldRestoreSavedMapTab(opts: {
  selectedPlaceId?: string | null;
  selectedVendorId?: string | null;
  reviewMode?: boolean;
  initialMapTab?: MapLayerTab | null;
}): boolean {
  if (opts.selectedPlaceId) return false;
  if (opts.selectedVendorId) return false;
  if (resolveExplicitMapTab(opts.initialMapTab, opts.reviewMode)) return false;
  return true;
}

/** Stale selectedPlaceId must not force the Places layer during a vendors/review route. */
export function shouldOpenRoutedPlaceOnMap(opts: {
  selectedPlaceId?: string | null;
  reviewMode?: boolean;
  initialMapTab?: MapLayerTab | null;
}): boolean {
  if (!opts.selectedPlaceId) return false;
  if (opts.reviewMode) return false;
  if (opts.initialMapTab === 'vendors') return false;
  return true;
}

/**
 * Open Map on the Vendors layer on first mount and when Map is already mounted.
 * Do not merge existing Map params — that keeps a previous selectedPlaceId and lands on Places.
 */
export function navigateToVendorReviewMap(navigation: NavigationProp<ParamListBase>) {
  (navigation.navigate as (name: string, params?: object) => void)('MainTabs', {
    screen: 'Map',
    params: buildVendorReviewMapParams(),
  });
}
