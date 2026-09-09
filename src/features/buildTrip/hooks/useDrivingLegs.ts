import { useEffect, useRef, useState } from 'react';
import { getOSRMRoute } from '../../../services/routing/osrmService';
import type { TripPlanStop } from '../../../services/api/trips';

export type RouteLeg = {
  /** Drive time in whole minutes */
  minutes: number;
  /** Distance in kilometres */
  km: number;
  steps: string[];
  /** true when route came from OSRM, false for fallback estimate */
  isRoad: boolean;
};

/**
 * Computes driving legs between consecutive stops in a trip itinerary.
 * Returns `legs[i]` = route between stops[i] and stops[i+1].
 * legs.length === Math.max(0, stops.length - 1)
 */
export function useDrivingLegs(stops: TripPlanStop[]): { legs: RouteLeg[] } {
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!stops || stops.length < 2) {
      setLegs([]);
      return;
    }

    const gen = ++generationRef.current;
    let cancelled = false;

    const pairs: Array<[TripPlanStop, TripPlanStop]> = [];
    for (let i = 0; i < stops.length - 1; i++) {
      pairs.push([stops[i], stops[i + 1]]);
    }

    Promise.all(
      pairs.map(async ([from, to]) => {
        const oLat = from.place?.latitude;
        const oLng = from.place?.longitude;
        const dLat = to.place?.latitude;
        const dLng = to.place?.longitude;

        if (oLat == null || oLng == null || dLat == null || dLng == null) {
          return { minutes: 0, km: 0, steps: [], isRoad: false } as RouteLeg;
        }

        try {
          const route = await getOSRMRoute(
            oLat,
            oLng,
            dLat,
            dLng,
            'driving',
          );
          if (!route) {
            return { minutes: 0, km: 0, steps: [], isRoad: false } as RouteLeg;
          }
          return {
            minutes: Math.max(1, Math.round(route.durationSeconds / 60)),
            km: route.distanceMeters / 1000,
            steps: [],
            isRoad: route.source === 'routing',
          } as RouteLeg;
        } catch {
          return { minutes: 0, km: 0, steps: [], isRoad: false } as RouteLeg;
        }
      }),
    ).then((computed) => {
      if (!cancelled && gen === generationRef.current) {
        setLegs(computed);
      }
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops.length, stops.map(s => s.id).join(',')]);

  return { legs };
}