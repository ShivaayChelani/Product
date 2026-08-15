import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '../../../services/api/trips';
import { normalizeTripPlan } from '../../../utils/normalizeTripPlan';

const queryKey = (tripId: string) => ['trip-preview', tripId] as const;

export function useTripPreview(tripId: string | undefined) {
  const query = useQuery({
    queryKey: tripId ? queryKey(tripId) : ['trip-preview', 'missing'],
    queryFn: async () => {
      if (!tripId) throw new Error('Trip id required');
      const data = await tripsApi.getById(tripId);
      return normalizeTripPlan(data);
    },
    enabled: !!tripId,
    staleTime: 30_000,
  });

  useFocusEffect(
    useCallback(() => {
      if (tripId) {
        void query.refetch();
      }
    }, [tripId, query.refetch]),
  );

  return query;
}
