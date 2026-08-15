import { useQuery } from '@tanstack/react-query';
import { creatorApi } from '../api/creatorApi';

export function useCreatorAnalytics(period: '7d' | '30d' | '90d' | 'all' | 'custom') {
  return useQuery({
    queryKey: ['creator', 'analytics', period] as const,
    queryFn: async () => {
      const res = await creatorApi.getAnalytics(period);
      if (!res?.data) throw new Error('Failed to load analytics');
      return res.data;
    },
    staleTime: 60_000,
    retry: 2,
  });
}
