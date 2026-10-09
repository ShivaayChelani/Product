jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { deriveReelPosterFromVideo, isStaticImageUrl, withCloudinaryThumbTransform } from '../services/reels/reelMediaKind';
import { getReelThumbnail, mapReelUrls } from '../services/reelService';
import { sizedImageSource } from '../utils/imageUrl';
import { Reel } from '../types';

describe('Issue 10 reel thumbnail derivation', () => {
  it('derives a lazy Cloudinary poster from a video URL', () => {
    expect(
      deriveReelPosterFromVideo('https://res.cloudinary.com/palsasafar/video/upload/v9/palsasafar/reels/a.mp4'),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/palsasafar/reels/a.jpg');
    expect(
      deriveReelPosterFromVideo('https://res.cloudinary.com/palsasafar/video/upload/palsasafar/reels/b.mov'),
    ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/palsasafar/reels/b.jpg');
    expect(deriveReelPosterFromVideo('https://cdn.example.com/video.mp4')).toBeUndefined();
    expect(deriveReelPosterFromVideo(null)).toBeUndefined();
    expect(deriveReelPosterFromVideo(undefined)).toBeUndefined();
  });

  it('derives a poster even from a video URL that already carries a transformation', () => {
    expect(
      deriveReelPosterFromVideo(
        'https://res.cloudinary.com/palsasafar/video/upload/q_auto,vc_h264/palsasafar/reels/t.mp4',
      ),
      ).toBe('https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/q_auto,vc_h264/palsasafar/reels/t.jpg');
  });

  it('classifies the derived poster as an image, not a video', () => {
    const poster = deriveReelPosterFromVideo(
      'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/c.mp4',
    )!;
    expect(isStaticImageUrl(poster)).toBe(true);
  });

  it('getReelThumbnail falls back to a derived poster when thumbnail is missing', () => {
    const reel = {
      thumbnail: null,
      videoUrl: 'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/d.mp4',
    } as Partial<Reel>;
    expect(getReelThumbnail(reel)).toBe(
      'https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/palsasafar/reels/d.jpg',
    );
  });

  it('getReelThumbnail still prefers an explicit thumbnail and prefixes local paths', () => {
    expect(
      getReelThumbnail({
        thumbnail: 'https://cdn.example.com/thumb.jpg',
        videoUrl: 'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/e.mp4',
      } as Partial<Reel>),
    ).toBe('https://cdn.example.com/thumb.jpg');
    const local = getReelThumbnail({ thumbnail: '/uploads/reels/seed.jpg', videoUrl: 'x' } as Partial<Reel>);
    expect(local.startsWith('http')).toBe(true);
    expect(local.endsWith('/uploads/reels/seed.jpg')).toBe(true);
  });

  it('getReelThumbnail honors poster/preview alias fields before video fallbacks', () => {
    expect(
      getReelThumbnail({ thumbnail: null, poster: 'https://cdn.example.com/poster.jpg' } as any),
    ).toBe('https://cdn.example.com/poster.jpg');
    expect(
      getReelThumbnail({ thumbnail: null, preview: '/uploads/reels/preview.jpg', videoUrl: 'x' } as any).endsWith(
        '/uploads/reels/preview.jpg',
      ),
    ).toBe(true);
  });

  it('getReelThumbnail treats an image reel as its own thumbnail', () => {
    expect(
      getReelThumbnail({
        thumbnail: null,
        videoUrl: 'https://res.cloudinary.com/palsasafar/image/upload/v1/palsasafar/reels/photo.jpg',
      } as any),
    ).toBe('https://res.cloudinary.com/palsasafar/image/upload/w_640,c_fill,q_auto,f_auto/v1/palsasafar/reels/photo.jpg');
  });

  it('mapReelUrls fills the thumbnail field for a poster-less cloudinary video', () => {
    const out = mapReelUrls({
      id: 'r1',
      creatorId: 'c1',
      videoUrl: 'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/f.mp4',
      thumbnail: null,
      title: null,
      description: null,
      likes: 0,
      views: 0,
      shares: 0,
      saves: 0,
      featured: false,
      rewardPoints: 0,
      placeId: null,
      vendorId: null,
      eventId: null,
      createdAt: '',
      creator: { id: 'c1', username: 'u', avatar: null, verified: false, userId: 'u' },
    } as Reel);
    expect(out.thumbnail).toBe(
      'https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/palsasafar/reels/f.jpg',
    );
    expect(out.videoUrl).toContain('/upload/q_auto,vc_h264/');
    expect(out.videoUrl.startsWith('http://')).toBe(false);
  });

  it('does not put a video URL into the image source when thumbnail is itself a video', () => {
    const poster = getReelThumbnail({
      thumbnail: 'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/g.mp4',
      videoUrl: 'https://res.cloudinary.com/palsasafar/video/upload/v1/palsasafar/reels/g.mp4',
    } as Partial<Reel>);
    expect(poster).toBe(
      'https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/palsasafar/reels/g.jpg',
    );
    expect(poster.toLowerCase().endsWith('.mp4')).toBe(false);
  });

  it('upgrades legacy Cloudinary posters and skips already-sized URLs', () => {
    expect(
      withCloudinaryThumbTransform(
        'https://res.cloudinary.com/palsasafar/video/upload/so_0,q_auto/palsasafar/reels/legacy.jpg',
      ),
    ).toBe(
      'https://res.cloudinary.com/palsasafar/video/upload/so_0,w_640,c_fill,q_auto,f_auto/palsasafar/reels/legacy.jpg',
    );
    expect(
      withCloudinaryThumbTransform(
        'https://res.cloudinary.com/palsasafar/image/upload/w_320,c_fill/v1/palsasafar/reels/keep.jpg',
      ),
    ).toBe('https://res.cloudinary.com/palsasafar/image/upload/w_320,c_fill/v1/palsasafar/reels/keep.jpg');
  });

  it('passes decode dimensions for known-size remote images', () => {
    expect(sizedImageSource('https://cdn.example.com/a.jpg', 272.4, 168.2)).toEqual({
      uri: 'https://cdn.example.com/a.jpg',
      width: 272,
      height: 168,
    });
  });

  it('returns empty when no poster can be derived from a non-Cloudinary video', () => {
    expect(
      getReelThumbnail({
        thumbnail: null,
        videoUrl: 'https://cdn.example.com/reels/missing.mp4',
      } as Partial<Reel>),
    ).toBe('');
  });
});