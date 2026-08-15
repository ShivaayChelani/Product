import { haversineDistance } from './distance';

export function isWithinGeofence(
  userLat: number,
  userLon: number,
  spotLat: number,
  spotLon: number,
  radiusMeters: number = 50
): boolean {
  return haversineDistance(userLat, userLon, spotLat, spotLon) <= radiusMeters;
}

export function nearestNeighborSort<T extends { id: string; latitude: number; longitude: number }>(
  spots: T[],
  startLat: number,
  startLon: number
): Array<T & { distanceFromPrevious?: number }> {
  if (spots.length === 0) return [];

  const sorted: Array<T & { distanceFromPrevious?: number }> = [];
  const remaining = [...spots];
  let currentLat = startLat;
  let currentLon = startLon;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(currentLat, currentLon, remaining[i].latitude, remaining[i].longitude);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }

    const nearest = remaining.splice(nearestIndex, 1)[0];
    sorted.push({
      ...nearest,
      distanceFromPrevious: nearestDistance,
    });

    currentLat = nearest.latitude;
    currentLon = nearest.longitude;
  }

  sorted.forEach((spot, index) => {
    spot.distanceFromPrevious =
      index === 0
        ? haversineDistance(startLat, startLon, spot.latitude, spot.longitude)
        : haversineDistance(sorted[index - 1].latitude, sorted[index - 1].longitude, spot.latitude, spot.longitude);
  });

  return sorted;
}
