/**
 * Internal turn-by-turn directions theme.
 *
 * PalSafar draws its own route on the Leaflet map instead of handing off to an
 * external maps app, so the polyline colour is a product decision rather than a
 * brand afterthought.
 *
 * Blue is deliberate: the surrounding PalSafar chrome is bronze/tan, and a
 * bronze route line read as "vendor offer" rather than "you are being guided".
 * The same value already anchors the Events layer (`EVENT_COLORS.accent`,
 * `EVENT_MARKER_COLOR`) and the event map pin, so routing now shares one blue
 * with the rest of the map's wayfinding vocabulary.
 *
 * Ride booking is deliberately NOT covered here. It hands off to Uber/Ola/
 * Rapido/BluSmart and never draws a polyline, so it can never inherit this.
 */
export const INTERNAL_ROUTE_COLOR = '#1E5FD9';

/**
 * Default polyline colour when a caller does not pass one.
 *
 * Kept separate from {@link INTERNAL_ROUTE_COLOR} so the legacy map-card route
 * can be audited against a diff rather than being silently repainted.
 */
export const DEFAULT_ROUTE_COLOR = '#B9834B';

/** Matched white halo, so the line stays legible over dark terrain imagery. */
export const INTERNAL_ROUTE_CASING_COLOR = '#FFFFFF';