export type ReelLikeSnapshot = {
  id: string;
  likes?: number;
  isLiked?: boolean;
};

export type ReelLikeResult = {
  isLiked: boolean;
  delta: 1 | -1;
};

export function applyReelLikeResult<T extends ReelLikeSnapshot>(
  reels: T[],
  reelId: string,
  result: ReelLikeResult,
): T[] {
  return reels.map(r => {
    if (r.id !== reelId) return r;
    const current = Math.max(0, r.likes ?? 0);
    return {
      ...r,
      isLiked: result.isLiked,
      likes: Math.max(0, current + result.delta),
    };
  });
}

export function mergeLikedIds(
  likedIds: string[],
  reelId: string,
  isLiked: boolean,
): string[] {
  if (isLiked) {
    return likedIds.includes(reelId) ? likedIds : [...likedIds, reelId];
  }
  return likedIds.filter(id => id !== reelId);
}

export function isReelCurrentlyLiked(
  reelId: string,
  likedIds: string[],
  reelIsLiked?: boolean,
): boolean {
  return likedIds.includes(reelId) || !!reelIsLiked;
}
