import client from "./client";
import type { SingleResponse } from "@/types";

export interface WalletData {
  palPoints: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface WalletLeaderboardEntry {
  userId: string;
  palPoints: number;
  user?: { id: string; name: string; email: string };
}

export async function getWalletBatch(userIds: string[]): Promise<Record<string, WalletData>> {
  if (!userIds.length) return {};
  try {
    const res = await client.get<{ success: boolean; data: Record<string, WalletData> }>(
      "/wallet/admin/batch",
      { params: { userIds: userIds.join(",") } },
    );
    return res.data.data || {};
  } catch {
    const walletMap: Record<string, WalletData> = {};
    await Promise.all(
      userIds.map(async (id) => {
        try {
          const wr = await client.get<SingleResponse<WalletData>>(`/wallet/admin/${id}`);
          if (wr.data.data) walletMap[id] = wr.data.data;
        } catch {
          /* skip */
        }
      }),
    );
    return walletMap;
  }
}

export async function getWallet(userId: string): Promise<WalletData | null> {
  try {
    const res = await client.get<SingleResponse<WalletData>>(`/wallet/admin/${userId}`);
    return res.data.data ?? null;
  } catch {
    return null;
  }
}

export async function adjustWallet(
  userId: string,
  palPoints: number,
  reason: string,
): Promise<void> {
  await client.post(`/wallet/adjust/${userId}`, { palPoints, reason });
}

export async function getWalletLeaderboard(limit = 10): Promise<WalletLeaderboardEntry[]> {
  const res = await client.get<{ success: boolean; data: WalletLeaderboardEntry[] }>(
    "/wallet/leaderboard",
    { params: { limit } },
  );
  return res.data.data || [];
}
