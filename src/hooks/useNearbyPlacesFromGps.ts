import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TouristSpot } from '../types';
import { getNearbyPlaces } from '../services/placesService';
import { haversineDistance, isValidLatLng } from '../services/location/distance';
import { NEARBY_SEARCH_RADIUS_M } from '../services/location/categoryNearbyFilter';

const NEARBY_LIMIT = 20;

export function isNearbySearchQuery(query: string): boolean {
  return /^near\s*by$/i.test(query.trim());
}

export function useNearbyPlacesFromGps(lat?: number | null, lng?: number | null) {
  const [spots, setSpots] = useState<TouristSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const hasCoords =
    lat != null && lng != null && isValidLatLng(lat, lng);

  const fetchNearby = useCallback(async () => {
    if (!hasCoords) return;
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const results = await getNearbyPlaces(lat!, lng!, NEARBY_SEARCH_RADIUS_M);
      if (fetchGenRef.current !== gen) return;
      setSpots(results.slice(0, NEARBY_LIMIT));
    } catch (e: unknown) {
      if (fetchGenRef.current !== gen) return;
      const message = e instanceof Error ? e.message : 'Failed to load nearby places';
      setError(message);
      setSpots([]);
    } finally {
      if (fetchGenRef.current === gen) setLoading(false);
    }
  }, [lat, lng, hasCoords]);

  useEffect(() => {
    if (!hasCoords) {
      setLoading(true);
      setSpots([]);
      setError(null);
      return;
    }
    fetchNearby();
  }, [fetchNearby, hasCoords]);

  const sortedSpots = useMemo(() => {
    if (!hasCoords) return [];
    return [...spots].sort((a, b) => {
      const da = haversineDistance(lat!, lng!, a.latitude, a.longitude);
      const db = haversineDistance(lat!, lng!, b.latitude, b.longitude);
      return da - db;
    });
  }, [spots, lat, lng, hasCoords]);

  return {
    spots: sortedSpots,
    /** True while waiting for GPS or while fetching nearby places. */
    loading: !hasCoords || loading,
    error,
    refresh: fetchNearby,
    hasCoords,
  };
}

export function formatNearbyDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
