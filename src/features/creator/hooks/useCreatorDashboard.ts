import { useQuery } from '@tanstack/react-query';
import { creatorApi } from '../api/creatorApi';

export const creatorDashboardKey = ['creator', 'dashboard'] as const;

export function useCreatorDashboard(enabled = true) {
  return useQuery({
    queryKey: creatorDashboardKey,
    queryFn: async () => {
      const res = await creatorApi.getDashboard();
      if (!res?.data) throw new Error('Failed to load dashboard');
      return res.data;
    },
    enabled,
    staleTime: 60_000,
    retry: 2,
  });
}
