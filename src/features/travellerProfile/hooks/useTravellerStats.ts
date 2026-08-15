import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '../../../services/api/trips';
import { authApi } from '../../../services/api/auth';
import { socialApi } from '../../../services/api';
import { DEV_FLAGS } from '../../../config/devFlags';
import { travellerProfileKeys } from '../queryKeys';
import type { UserProfile } from '../../../types';

export type TravellerStats = {
  tripsCompleted: number;
  placesVisited: number;
  reelsShared: number;
  followers: number;
};

function countFromList(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  const data = (payload as { data?: unknown[] })?.data;
  if (Array.isArray(data)) return data.length;
  return 0;
}

async function fetchTravellerStats(user: UserProfile): Promise<TravellerStats> {
  const fallbackPlaces = user.visitedSpots?.length ?? 0;
  const fallbackReels = user.createdReels?.length ?? 0;
  const fallbackFollowers = user.creatorProfile?.followerCount ?? 0;

  const tasks: Promise<Partial<TravellerStats>>[] = [
    tripsApi
      .list({ status: 'COMPLETED', limit: 100 })
      .then(res => ({ tripsCompleted: countFromList(res?.data ?? res) }))
      .catch(() => ({ tripsCompleted: 0 })),
    authApi
      .getProfile()
      .then(profile => {
        const checkIns = Array.isArray((profile as { checkIns?: { placeId: string }[] })?.checkIns)
          ? (profile as { checkIns: { placeId: string }[] }).checkIns
          : [];
        const followers = (profile as { creatorProfile?: { followerCount?: number } })?.creatorProfile
          ?.followerCount;
        return {
          placesVisited: checkIns.length || fallbackPlaces,
          followers: typeof followers === 'number' ? followers : fallbackFollowers,
        };
      })
      .catch(() => ({ placesVisited: fallbackPlaces, followers: fallbackFollowers })),
  ];

  if (user.creatorProfile?.status === 'APPROVED') {
    tasks.push(
      socialApi
        .getMyReels(1, 1)
        .then(res => {
          const page = (res as { data?: { pagination?: { total?: number }; items?: unknown[] } })?.data ?? res;
          const total = (page as { pagination?: { total?: number } })?.pagination?.total;
          if (typeof total === 'number') return { reelsShared: total };
          return { reelsShared: countFromList((page as { items?: unknown[] }).items ?? page) };
        })
        .catch(() => ({ reelsShared: fallbackReels })),
    );
  } else {
    tasks.push(Promise.resolve({ reelsShared: fallbackReels }));
  }

  const parts = await Promise.all(tasks);
  return parts.reduce<TravellerStats>(
    (acc, part) => ({
      tripsCompleted: part.tripsCompleted ?? acc.tripsCompleted,
      placesVisited: part.placesVisited ?? acc.placesVisited,
      reelsShared: part.reelsShared ?? acc.reelsShared,
      followers: part.followers ?? acc.followers,
    }),
    { tripsCompleted: 0, placesVisited: fallbackPlaces, reelsShared: fallbackReels, followers: fallbackFollowers },
  );
}

export function useTravellerStats(user: UserProfile, enabled: boolean) {
  return useQuery({
    queryKey: travellerProfileKeys.stats(user.uid),
    queryFn: () => fetchTravellerStats(user),
    enabled: enabled && DEV_FLAGS.USE_SERVER_API && user.uid !== 'guest-user',
    staleTime: 45_000,
    placeholderData: {
      tripsCompleted: 0,
      placesVisited: user.visitedSpots?.length ?? 0,
      reelsShared: user.createdReels?.length ?? 0,
      followers: user.creatorProfile?.followerCount ?? 0,
    },
  });
}
