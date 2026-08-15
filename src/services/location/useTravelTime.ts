import { useEffect, useRef, useState } from 'react';
import { parseLatLng, type LatLng } from './distance';
import { getEstimatedTravelTime, type TravelTimeResult } from './travelTime';

/**
 * Driving travel time from origin GPS to destination coordinates.
 * Clears stale results when origin, destination, or destinationKey changes.
 */
export function useTravelTime(
  origin: LatLng | null | undefined,
  destination: LatLng | null | undefined,
  destinationKey?: string | null,
): { result: TravelTimeResult | null; loading: boolean } {
  const [result, setResult] = useState<TravelTimeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  const oLat = origin?.latitude;
  const oLng = origin?.longitude;
  const dLat = destination?.latitude;
  const dLng = destination?.longitude;

  useEffect(() => {
    const gen = ++genRef.current;
    const from = parseLatLng(oLat, oLng);
    const to = parseLatLng(dLat, dLng);
    if (!from || !to) {
      setResult(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setResult(null);
    setLoading(true);
    void getEstimatedTravelTime({ origin: from, destination: to, mode: 'driving' })
      .then((next) => {
        if (cancelled || gen !== genRef.current) return;
        setResult(next);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled || gen !== genRef.current) return;
        setResult(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [oLat, oLng, dLat, dLng, destinationKey]);

  return { result, loading };
}
