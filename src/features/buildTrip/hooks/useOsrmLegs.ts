/**
 * Driving legs between itinerary stops via the PalSafar backend OSRM proxy.
 */
import { useEffect, useState } from 'react';
import type { TripPlanStop } from '../../../services/api/trips';
import { fetchDrivingRoute } from '../../../services/location/travelTime';
import { haversineDistanceKm } from '../../../services/location/distance';

export type RouteLeg = { minutes: number; km: number } | null;

async function fetchLeg(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<RouteLeg> {
  const route = await fetchDrivingRoute(
    { latitude: fromLat, longitude: fromLng },
    { latitude: toLat, longitude: toLng },
  );
  if (route) {
    return {
      minutes: Math.max(1, Math.round(route.durationSeconds / 60)),
      km: route.distanceMeters / 1000,
    };
  }
  return null;
}

export function useOsrmLegs(stops: TripPlanStop[]) {
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (stops.length < 2) {
      setLegs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const next: RouteLeg[] = [null];
      for (let i = 1; i < stops.length; i++) {
        const prev = stops[i - 1].place;
        const cur = stops[i].place;
        if (
          prev?.latitude != null &&
          prev?.longitude != null &&
          cur?.latitude != null &&
          cur?.longitude != null
        ) {
          const leg = await fetchLeg(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
          if (cancelled) return;
          if (leg) {
            next.push(leg);
            continue;
          }
          const km = haversineDistanceKm(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
          if (!Number.isFinite(km)) {
            next.push(null);
            continue;
          }
          next.push({ km, minutes: Math.max(5, Math.round(km * 2.5)) });
        } else {
          const km = stops[i].distanceFromPrev ?? 0;
          next.push(km > 0 ? { km, minutes: Math.max(5, Math.round(km * 2.5)) } : null);
        }
      }
      if (!cancelled) {
        setLegs(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stops]);

  const travelMinutes = legs.reduce((s, l) => s + (l?.minutes ?? 0), 0);
  const travelKm = legs.reduce((s, l) => s + (l?.km ?? 0), 0);

  return { legs, travelMinutes, travelKm, loading };
}
