import { palette } from '../config/theme';
/**
 * Internal turn-by-turn directions theme.
 *
 * PalSafar draws its own route on the Leaflet map instead of handing off to an
 * external maps app, so the polyline colour is a product decision rather than a
 * brand afterthought.
 *
 * Blue distinguishes the active route from PalSafar's bronze and neutral chrome.
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
export const DEFAULT_ROUTE_COLOR = '#1E5FD9';

/** Matched white halo, so the line stays legible over dark terrain imagery. */
export const INTERNAL_ROUTE_CASING_COLOR = '#FFFFFF';