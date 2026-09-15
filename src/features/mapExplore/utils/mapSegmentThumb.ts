export type MapLayerTab = 'places' | 'vendors';

/** Pixel offset for the sliding Places/Vendors thumb. */
export function mapSegmentThumbX(active: MapLayerTab, segmentWidth: number): number {
  if (segmentWidth <= 0) return 0;
  return active === 'vendors' ? segmentWidth : 0;
}
