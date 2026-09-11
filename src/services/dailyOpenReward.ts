import type { Dispatch, SetStateAction } from 'react';
import { walletApi } from './api/wallet';
import { applyWalletPalPoints } from '../utils/syncPalPoints';
import type { UserProfile } from '../types';

export interface DailyOpenRewardResult {
  awarded: boolean;
  alreadyClaimed: boolean;
  points: number;
  rewardDate: string;
}

/** Debounce so one foreground transition never fires duplicate claims back-to-back. */
const MIN_ATTEMPT_INTERVAL_MS = 2000;
let lastAttemptAt = 0;

export function shouldAttemptDailyOpenReward(now = Date.now()): boolean {
  return now - lastAttemptAt >= MIN_ATTEMPT_INTERVAL_MS;
}

export function markDailyOpenRewardAttempted(now = Date.now()): void {
  lastAttemptAt = now;
}

export async function claimDailyOpenRewardForUser(): Promise<DailyOpenRewardResult | null> {
  const result = await walletApi.claimDailyOpen();
  return result ?? null;
}

/**
 * Fire-once per foreground transition daily app-open reward. The server is the
 * authority on the calendar day and on idempotency (already_claimed → 0 points);
 * this side only dresses the result and silently refreshes the wallet balance.
 */
export async function attemptDailyOpenReward(
  setUser: Dispatch<SetStateAction<UserProfile>>,
): Promise<DailyOpenRewardResult | null> {
  if (!shouldAttemptDailyOpenReward()) return null;
  markDailyOpenRewardAttempted();
  try {
    const result = await claimDailyOpenRewardForUser();
    if (result?.awarded) {
      void applyWalletPalPoints(setUser);
    }
    return result;
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[DailyOpen] reward attempt failed:', err);
    }
    return null;
  }
}