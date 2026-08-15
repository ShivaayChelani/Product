import type { Dispatch, SetStateAction } from 'react';
import { walletApi, type WalletProfile } from '../services/api/wallet';
import type { UserProfile } from '../types';

export async function readWalletPalPoints(): Promise<number | null> {
  try {
    const res = await walletApi.getProfile();
    const data = ((res as { data?: WalletProfile })?.data ?? res) as WalletProfile;
    const pts = Number(data?.palPoints);
    return Number.isFinite(pts) ? pts : null;
  } catch {
    return null;
  }
}

export async function applyWalletPalPoints(
  setUser: Dispatch<SetStateAction<UserProfile>>,
): Promise<number | null> {
  const pts = await readWalletPalPoints();
  if (pts == null) return null;
  setUser((prev) => {
    if (prev.uid === 'guest-user' || prev.totalPoints === pts) return prev;
    return { ...prev, totalPoints: pts };
  });
  return pts;
}
