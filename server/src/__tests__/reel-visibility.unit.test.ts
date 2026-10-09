import { describe, expect, it } from 'vitest';
import {
  isPublishableMediaUrl,
  isReelVisibleToViewer,
  PUBLIC_REEL_STATUS,
} from '../modules/social/reelVisibility';

describe('reel public visibility', () => {
  it('shows only APPROVED reels to everyone else', () => {
    expect(PUBLIC_REEL_STATUS).toBe('APPROVED');
    for (const status of ['DRAFT', 'HIDDEN', 'PENDING', 'REJECTED', 'ARCHIVED', 'SCHEDULED']) {
      expect(isReelVisibleToViewer(status)).toBe(false);
    }
    expect(isReelVisibleToViewer('APPROVED')).toBe(true);
  });

  it('lets the owner and a tagged vendor open a private reel', () => {
    expect(isReelVisibleToViewer('DRAFT', { isOwner: true })).toBe(true);
    expect(isReelVisibleToViewer('ARCHIVED', { isCollabVendor: true })).toBe(true);
    expect(isReelVisibleToViewer('ARCHIVED', { isOwner: false })).toBe(false);
  });

  it('treats only http(s) media as ready to publish', () => {
    expect(isPublishableMediaUrl('https://cdn.example/reel.mp4')).toBe(true);
    expect(isPublishableMediaUrl('http://cdn.example/reel.mp4')).toBe(true);
    expect(isPublishableMediaUrl('file:///data/incomplete.mp4')).toBe(false);
    expect(isPublishableMediaUrl('')).toBe(false);
  });
});
