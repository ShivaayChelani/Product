export function unwrapReelRewardPoints(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const obj = payload as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === 'object'
    ? (obj.data as Record<string, unknown>)
    : obj;
  const pts = Number(nested.rewardPoints ?? obj.rewardPoints ?? 0);
  return Number.isFinite(pts) && pts > 0 ? Math.round(pts) : 0;
}

export const CREATOR_DAILY_REEL_POINTS = 50;
