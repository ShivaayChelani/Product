import { likeReel, unlikeReel } from '../reelService';
import type { ReelLikeResult } from './reelLikeState';

export type { ReelLikeSnapshot, ReelLikeResult } from './reelLikeState';
export {
  applyReelLikeResult,
  mergeLikedIds,
  isReelCurrentlyLiked,
} from './reelLikeState';

const pendingReelLikes = new Set<string>();

export function isReelLikePending(reelId: string): boolean {
  return pendingReelLikes.has(reelId);
}

/**
 * Toggle like on the server, then report the committed result.
 * Does not update UI. Callers must apply the result only after this resolves.
 */
export async function commitReelLikeToggle(
  reelId: string,
  currentlyLiked: boolean,
  userId: string,
): Promise<ReelLikeResult> {
  if (!reelId || !userId) {
    throw new Error('Reel like requires a reel id and an authenticated user.');
  }
  if (pendingReelLikes.has(reelId)) {
    throw new Error('Like already in progress.');
  }
  pendingReelLikes.add(reelId);
  try {
    if (currentlyLiked) {
      await unlikeReel(reelId, userId);
      return { isLiked: false, delta: -1 };
    }
    await likeReel(reelId, userId);
    return { isLiked: true, delta: 1 };
  } finally {
    pendingReelLikes.delete(reelId);
  }
}
