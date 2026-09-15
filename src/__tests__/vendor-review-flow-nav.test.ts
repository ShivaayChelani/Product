import { mapSegmentThumbX } from '../features/mapExplore/utils/mapSegmentThumb';
import {
  buildVendorReviewMapParams,
  navigateToVendorReviewMap,
  resolveExplicitMapTab,
  shouldOpenRoutedPlaceOnMap,
  shouldRestoreSavedMapTab,
} from '../navigation/vendorReviewFlow';

describe('vendorReviewFlow helpers', () => {
  it('builds Map params that force the Vendors tab and clear stale place targets', () => {
    const params = buildVendorReviewMapParams();
    expect(params.initialMapTab).toBe('vendors');
    expect(params.reviewMode).toBe(true);
    expect(typeof params.mapTabKey).toBe('number');
    expect(params.selectedPlaceId).toBe('');
    expect(params.selectedVendorId).toBe('');
  });

  it('resolves reviewMode to vendors even without initialMapTab', () => {
    expect(resolveExplicitMapTab(undefined, true)).toBe('vendors');
    expect(resolveExplicitMapTab('places', false)).toBe('places');
    expect(resolveExplicitMapTab(undefined, false)).toBeNull();
  });

  it('does not restore a saved Places session over an explicit vendors/review route', () => {
    expect(
      shouldRestoreSavedMapTab({
        reviewMode: true,
        initialMapTab: 'vendors',
      }),
    ).toBe(false);
    expect(
      shouldRestoreSavedMapTab({
        selectedPlaceId: 'p1',
      }),
    ).toBe(false);
    expect(shouldRestoreSavedMapTab({})).toBe(true);
  });

  it('does not open a stale routed place when landing on Vendor review mode', () => {
    expect(
      shouldOpenRoutedPlaceOnMap({
        selectedPlaceId: 'place-1',
        reviewMode: true,
      }),
    ).toBe(false);
    expect(
      shouldOpenRoutedPlaceOnMap({
        selectedPlaceId: 'place-1',
        initialMapTab: 'vendors',
      }),
    ).toBe(false);
    expect(
      shouldOpenRoutedPlaceOnMap({
        selectedPlaceId: 'place-1',
      }),
    ).toBe(true);
  });

  it('navigates to MainTabs Map with a unique mapTabKey so an already-mounted Map switches to Vendor', () => {
    const navigate = jest.fn();
    navigateToVendorReviewMap({ navigate } as any);
    expect(navigate).toHaveBeenCalledTimes(1);
    const [name, arg] = navigate.mock.calls[0];
    expect(name).toBe('MainTabs');
    expect(arg.screen).toBe('Map');
    expect(arg.merge).toBeUndefined();
    expect(arg.params.initialMapTab).toBe('vendors');
    expect(arg.params.reviewMode).toBe(true);
    expect(typeof arg.params.mapTabKey).toBe('number');
    expect(arg.params.selectedPlaceId).toBe('');
  });
});

describe('Map Places/Vendors thumb', () => {
  it('sits on Places at x=0 and on Vendors at the measured half-width', () => {
    expect(mapSegmentThumbX('places', 180)).toBe(0);
    expect(mapSegmentThumbX('vendors', 180)).toBe(180);
  });

  it('does not park the thumb on Places when Vendors is active but width is not measured yet', () => {
    expect(mapSegmentThumbX('vendors', 0)).toBe(0);
  });
});
