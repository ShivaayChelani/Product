import { describe, expect, it } from 'vitest';
import { CLOUDINARY_VIDEO_UPLOAD_OPTIONS, deriveVideoPosterUrl, resolveStoredReelPoster } from '../config/upload';

describe('Cloudinary reel video upload options', () => {
  it('uploads videos without a synchronous incoming transformation', () => {
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS.resource_type).toBe('video');
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS.allowed_formats).toEqual(['mp4', 'mov', 'webm']);
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS).not.toHaveProperty('transformation');
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS).not.toHaveProperty('eager');
  });

  it('derives a lazy poster URL from a Cloudinary video URL', () => {
    expect(
      deriveVideoPosterUrl('https://res.cloudinary.com/palsasafar/video/upload/v123456/palsasafar/reels/abc123.mp4'),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,q_auto/palsasafar/reels/abc123.jpg');
  });

  it('supports mov/webm and version-less upload URLs', () => {
    expect(
      deriveVideoPosterUrl('https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/x.mov'),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,q_auto/palsasafar/reels/x.jpg');
    expect(
      deriveVideoPosterUrl('https://res.cloudinary.com/palsasafar/video/upload/palsasafar/reels/y.webm'),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,q_auto/palsasafar/reels/y.jpg');
  });

  it('returns undefined for non-Cloudinary or image URLs', () => {
    expect(deriveVideoPosterUrl('https://res.cloudinary.com/palsasafar/image/upload/v1/f/photo.jpg')).toBeUndefined();
    expect(deriveVideoPosterUrl('https://cdn.example.com/palsasafar/reels/a.mp4')).toBeUndefined();
    expect(deriveVideoPosterUrl(null)).toBeUndefined();
    expect(deriveVideoPosterUrl(undefined)).toBeUndefined();
  });

  it('derives a poster from a video URL that already carries a transformation', () => {
    expect(
      deriveVideoPosterUrl(
        'https://res.cloudinary.com/palsasafar/video/upload/q_auto,vc_h264/palsasafar/reels/t.mp4',
      ),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,q_auto/q_auto,vc_h264/palsasafar/reels/t.jpg');
  });

  it('keeps a saved image poster and replaces a video-as-thumbnail with a derived poster', () => {
    expect(
      resolveStoredReelPoster(
        'https://cdn.example.com/poster.jpg',
        'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/a.mp4',
      ),
    ).toBe('https://cdn.example.com/poster.jpg');
    expect(
      resolveStoredReelPoster(
        'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/a.mp4',
        'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/a.mp4',
      ),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,q_auto/palsasafar/reels/a.jpg');
    expect(resolveStoredReelPoster(null, 'https://cdn.example.com/reels/a.mp4')).toBeNull();
  });
});
