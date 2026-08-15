import { useQuery } from '@tanstack/react-query';
import { ridesApi } from '../../../services/api/rides';

export const rideProvidersQueryKey = (pickupLat?: number | null, pickupLng?: number | null) =>
  ['ride-providers', pickupLat ?? 'none', pickupLng ?? 'none'] as const;

export function useRideProviders(params: {
  enabled: boolean;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
}) {
  const { enabled, pickupLatitude, pickupLongitude } = params;
  const canFetch = enabled && pickupLatitude != null && pickupLongitude != null;

  return useQuery({
    queryKey: rideProvidersQueryKey(pickupLatitude, pickupLongitude),
    queryFn: async () => {
      const res = await ridesApi.listProviders(pickupLatitude!, pickupLongitude!);
      if (!res?.data) throw new Error('EMPTY_RESPONSE');
      return res.data;
    },
    enabled: canFetch,
    staleTime: 120_000,
    gcTime: 300_000,
    retry: 2,
  });
}
