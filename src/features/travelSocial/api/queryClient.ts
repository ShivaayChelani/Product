import { QueryClient } from '@tanstack/react-query';

export const travelSocialQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export const travelSocialQueryKeys = {
  reelsFeed: (category: string, page: number) => ['reels-feed', category, page] as const,
  creatorProfile: (username: string) => ['creator-profile', username] as const,
  reelComments: (reelId: string) => ['reel-comments', reelId] as const,
  collections: () => ['social-collections'] as const,
};
