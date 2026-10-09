/** Canonical status a non-owner may see. Creator reels publish as APPROVED. */
export const PUBLIC_REEL_STATUS = 'APPROVED';

export function isPublishableMediaUrl(url: unknown): boolean {
  return /^https?:\/\//i.test(String(url ?? '').trim());
}

/**
 * Public surfaces only return APPROVED reels.
 * The owner and a tagged collaboration vendor may still open their private copy.
 */
export function isReelVisibleToViewer(
  status: unknown,
  viewer: { isOwner?: boolean; isCollabVendor?: boolean } = {},
): boolean {
  if (String(status || '') === PUBLIC_REEL_STATUS) return true;
  return Boolean(viewer.isOwner || viewer.isCollabVendor);
}
