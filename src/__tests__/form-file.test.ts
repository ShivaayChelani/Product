import {
  assertSupportedUploadMime,
  normalizeUploadMime,
  toFormFile,
} from '../services/upload/formFile';

describe('toFormFile (Android content:// support)', () => {
  it('does not guess an extension from a content:// URI', () => {
    const part = toFormFile('content://media/external/video/123', 'video', 'video/mp4', 'clip.mp4');
    expect(part.uri).toBe('content://media/external/video/123');
    expect(part.type).toBe('video/mp4');
    expect(part.name).toBe('clip.mp4');
  });

  it('defaults content:// video without hints to mp4', () => {
    const part = toFormFile('content://media/external/video/123', 'video');
    expect(part.type).toBe('video/mp4');
    expect(part.name).toBe('reel.mp4');
  });

  it('uses picker MIME for images', () => {
    const part = toFormFile('content://media/external/images/9', 'image', 'image/png', 'shot.png');
    expect(part.type).toBe('image/png');
    expect(part.name).toBe('shot.png');
  });

  it('maps Android Photo Picker image/* to image/jpeg', () => {
    const part = toFormFile('content://media/external/images/9', 'image', 'image/*', 'IMG_0001.jpg');
    expect(part.type).toBe('image/jpeg');
  });

  it('maps image/jpg to image/jpeg', () => {
    expect(normalizeUploadMime('image', 'image/jpg')).toBe('image/jpeg');
    expect(toFormFile('content://media/external/images/1', 'image', 'image/jpg', 'pic.jpg').type).toBe(
      'image/jpeg',
    );
  });

  it('maps empty MIME plus png filename to image/png', () => {
    const part = toFormFile('content://media/external/images/2', 'image', null, 'shot.png');
    expect(part.type).toBe('image/png');
  });

  it('rejects HEIC before upload', () => {
    expect(() => assertSupportedUploadMime('image', 'image/heic')).toThrow(/JPEG, PNG, or WebP/);
    expect(() =>
      assertSupportedUploadMime(
        'image',
        normalizeUploadMime('image', 'image/heif', 'heif'),
      ),
    ).toThrow(/JPEG, PNG, or WebP/);
  });
});
