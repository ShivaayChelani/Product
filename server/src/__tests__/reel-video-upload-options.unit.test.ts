import { describe, expect, it } from 'vitest';
import { CLOUDINARY_VIDEO_UPLOAD_OPTIONS } from '../config/upload';

describe('Cloudinary reel video upload options', () => {
  it('uploads videos without a synchronous incoming transformation', () => {
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS.resource_type).toBe('video');
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS.allowed_formats).toEqual(['mp4', 'mov', 'webm']);
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS).not.toHaveProperty('transformation');
    expect(CLOUDINARY_VIDEO_UPLOAD_OPTIONS).not.toHaveProperty('eager');
  });
});
