import { useQuery } from '@tanstack/react-query';
import { walletApi, type WalletProfile } from '../../../services/api/wallet';
import { DEV_FLAGS } from '../../../config/devFlags';
import { travellerProfileKeys } from '../queryKeys';

export type TravellerWallet = {
  palPoints: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

async function fetchWallet(): Promise<TravellerWallet> {
  const res = await walletApi.getProfile();
  const data = ((res as { data?: WalletProfile })?.data ?? res) as WalletProfile & {
    palPoints?: number;
  };
  return {
    palPoints: Number(data.palPoints ?? 0) || 0,
    lifetimeEarned: Number(data.lifetimeEarned ?? 0) || 0,
    lifetimeSpent: Number(data.lifetimeSpent ?? 0) || 0,
  };
}

export function useTravellerWallet(enabled: boolean, fallbackPoints = 0) {
  return useQuery({
    queryKey: travellerProfileKeys.wallet,
    queryFn: fetchWallet,
    enabled: enabled && DEV_FLAGS.USE_SERVER_API,
    staleTime: 30_000,
    placeholderData: {
      palPoints: fallbackPoints,
      lifetimeEarned: fallbackPoints,
      lifetimeSpent: 0,
    },
  });
}
