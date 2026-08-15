import { parseLatLng, type LatLng } from './distance';
import {
  formatDriveDistanceLabel,
  formatTravelTimeLabel,
  getEstimatedTravelTime,
} from './travelTime';

export type RoutedDistanceFields = {
  distanceLabel?: string;
  durationLabel?: string;
  distanceMeters?: number;
  durationSeconds?: number;
};

type Coords = { latitude?: number | null; longitude?: number | null };

export async function getRoutedDistanceFields(
  origin: LatLng,
  destination: Coords,
): Promise<RoutedDistanceFields> {
  const from = parseLatLng(origin.latitude, origin.longitude);
  const to = parseLatLng(destination.latitude, destination.longitude);
  if (!from || !to) return {};

  const route = await getEstimatedTravelTime({ origin: from, destination: to });
  if (!route || route.source !== 'routing' || !Number.isFinite(route.distanceMeters)) {
    return {};
  }

  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    durationLabel: formatTravelTimeLabel(route),
    distanceLabel: formatDriveDistanceLabel(route.distanceMeters, route.durationSeconds),
  };
}

export async function withRoutedDistanceFields<T>(
  origin: LatLng,
  items: T[],
  getCoords: (item: T) => Coords,
  limit = 12,
): Promise<Array<T & RoutedDistanceFields>> {
  const visibleItems = items.slice(0, limit);
  const rest: Array<T & RoutedDistanceFields> = items
    .slice(limit)
    .map(item => ({ ...item }) as T & RoutedDistanceFields);

  const enriched = await Promise.all(
    visibleItems.map(async item => {
      const routed = await getRoutedDistanceFields(origin, getCoords(item));
      return { ...item, ...routed } as T & RoutedDistanceFields;
    }),
  );

  return [...enriched, ...rest];
}

export { formatDriveDistanceLabel };
