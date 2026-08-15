import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tripsApi, TripPlan } from '../../../services/api/trips';
import { DEV_FLAGS } from '../../../config/devFlags';
import { MY_TRIPS_QUERY_KEY, registerMyTripsInvalidator } from '../myTripsCache';

function sortSavedTrips(trips: TripPlan[]): TripPlan[] {
  return [...trips]
    .filter(t => t.status !== 'ARCHIVED')
    .sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt).getTime();
      const tb = new Date(b.updatedAt || b.createdAt).getTime();
      return tb - ta;
    });
}

async function fetchSavedTrips(): Promise<TripPlan[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];
  const res = await tripsApi.list({ limit: 24 });
  return sortSavedTrips(res?.data || []);
}

export function useMyTripsData(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MY_TRIPS_QUERY_KEY,
    queryFn: fetchSavedTrips,
    enabled,
    staleTime: 45_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MY_TRIPS_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    registerMyTripsInvalidator(() => {
      void queryClient.invalidateQueries({ queryKey: MY_TRIPS_QUERY_KEY });
    });
    return () => registerMyTripsInvalidator(null);
  }, [queryClient]);

  return {
    trips: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refresh,
  };
}
