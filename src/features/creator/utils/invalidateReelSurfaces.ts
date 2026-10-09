import type { QueryClient } from '@tanstack/react-query';
import { travelSocialQueryClient, travelSocialQueryKeys } from '../../travelSocial/api/queryClient';

const SURFACE_KEYS: ReadonlyArray<readonly unknown[]> = [
  travelSocialQueryKeys.reelsFeed('', 1).slice(0, 1),
  ['vendor-reels'],
  ['vendor-map-detail'],
  ['map-feed'],
  ['creator-profile'],
  ['creator', 'dashboard'],
];

export function invalidateReelSurfaces(queryClient?: QueryClient | null) {
  const clients = [queryClient, travelSocialQueryClient].filter(
    (client): client is QueryClient => Boolean(client),
  );
  clients.forEach((client) => {
    SURFACE_KEYS.forEach((queryKey) => {
      void client.invalidateQueries({ queryKey: [...queryKey] });
    });
  });
}
