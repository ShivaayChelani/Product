/**
 * Map layer tabs.
 *
 * The control is a fixed-width segmented track with one thumb per tab, so the
 * thumb position is derived from the tab's index rather than hardcoded to 0/1.
 * Events is the third layer (server: `GET /api/v1/events/map`).
 */
export const MAP_LAYER_TABS = ['places', 'events', 'vendors'] as const;

export type MapLayerTab = (typeof MAP_LAYER_TABS)[number];

export function isMapLayerTab(value: unknown): value is MapLayerTab {
  return typeof value === 'string' && (MAP_LAYER_TABS as readonly string[]).includes(value);
}

/**
 * Pixel offset for the sliding thumb.
 *
 * `segmentWidth` is one third of the track, so index 0/1/2 lands at 0 / w / 2w.
 * An unknown tab falls back to the first slot rather than off-track.
 */
export function mapSegmentThumbX(active: MapLayerTab, segmentWidth: number): number {
  if (segmentWidth <= 0) return 0;
  const index = (MAP_LAYER_TABS as readonly string[]).indexOf(active);
  return (index < 0 ? 0 : index) * segmentWidth;
}