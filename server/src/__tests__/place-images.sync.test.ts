import { describe, it, expect } from 'vitest';
import {
  extractCloudinaryPublicId,
  isManagedPlaceImageUrl,
} from '../modules/places/services/place-images.sync';

describe('place-images.sync helpers', () => {
  it('extracts Cloudinary public_id from secure_url', () => {
    const url =
      'https://res.cloudinary.com/demo/image/upload/v1234567890/palsasafar/places/abc123.jpg';
    expect(extractCloudinaryPublicId(url)).toBe('palsasafar/places/abc123');
  });

  it('extracts public_id without version segment', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/palsasafar/places/xyz.png';
    expect(extractCloudinaryPublicId(url)).toBe('palsasafar/places/xyz');
  });

  it('returns null for non-Cloudinary URLs', () => {
    expect(extractCloudinaryPublicId('https://example.com/photo.jpg')).toBeNull();
  });

  it('detects managed place image URLs', () => {
    expect(
      isManagedPlaceImageUrl(
        'https://res.cloudinary.com/demo/image/upload/palsasafar/places/foo.webp',
      ),
    ).toBe(true);
    expect(
      isManagedPlaceImageUrl(
        'https://res.cloudinary.com/demo/image/upload/palsasafar/reels/bar.mp4',
      ),
    ).toBe(false);
  });
});
