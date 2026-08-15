import { haversineDistance, isValidLatLng } from './distance';
import {
  type HomeCategoryDef,
  placeMatchesHomeCategory,
} from '../../components/home/constants';

/** Canonical PalSafar nearby-search radius. Use this everywhere GPS nearby results are fetched or filtered. */
export const NEARBY_SEARCH_RADIUS_M = 30_000;

export function isWithinCategoryRadius(
  originLat: number,
  originLng: number,
  itemLat: number | null | undefined,
  itemLng: number | null | undefined,
  radiusM: number = NEARBY_SEARCH_RADIUS_M,
): boolean {
  const meters = haversineDistance(
    originLat,
    originLng,
    itemLat as number,
    itemLng as number,
  );
  return Number.isFinite(meters) && meters <= radiusM;
}

/** Testable GPS + category filter. Does not call the network. */
export function filterPlacesForCategoryNearby<T extends {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  tags?: string[] | null;
  name?: string | null;
}>(
  places: T[],
  category: HomeCategoryDef,
  lat: number,
  lng: number,
  radiusM: number = NEARBY_SEARCH_RADIUS_M,
): T[] {
  if (!isValidLatLng(lat, lng)) return [];
  return places.filter(p => {
    if (!isWithinCategoryRadius(lat, lng, p.latitude, p.longitude, radiusM)) return false;
    return placeMatchesHomeCategory(p, category);
  });
}
