import { useMutation } from '@tanstack/react-query';
import { ridesApi, type RideOpenRequest, type RideOpenResponse } from '../../../services/api/rides';

export function useRideOpen() {
  return useMutation({
    mutationFn: async (body: RideOpenRequest): Promise<RideOpenResponse> => {
      const res = await ridesApi.open(body);
      if (!res?.data) throw new Error('OPEN_FAILED');
      return res.data;
    },
    retry: 1,
  });
}
