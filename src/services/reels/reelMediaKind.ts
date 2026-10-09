export type ReelMediaKind = 'video' | 'image';

export function detectReelMediaKind(
  mime?: string | null,
  uri?: string | null,
  fileName?: string | null,
): ReelMediaKind {
  const mimeL = String(mime || '').toLowerCase();
  if (mimeL.startsWith('video/')) return 'video';
  if (mimeL.startsWith('image/')) return 'image';

  const hay = `${fileName || ''} ${uri || ''}`.toLowerCase();
  if (/\.(jpe?g|png|webp|gif|bmp|heic)(\?|$)/i.test(hay)) return 'image';
  return 'video';
}

export function isStaticImageUrl(url?: string | null): boolean {
  const value = String(url || '').toLowerCase();
  if (!value) return false;
  if (value.includes('/image/upload/')) return true;
  // A derived poster keeps the /video/upload/ path but is a JPG — classify by
  // extension so a video-frame poster is treated as an image, never a video.
  return /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(value);
}

/** Derive a lazy Cloudinary poster (a video frame served as a JPG) from a
 *  Cloudinary video URL. Mirrors the server helper so reels whose thumbnail was
 *  never persisted still get a real poster image everywhere they render.
 *  Tolerates both plain upload URLs (`/upload/v123/name.mp4`) and URLs that
 *  already carry a transformation segment (e.g. `/upload/q_auto,vc_h264/name.mp4`)
 *  produced by `mapReelUrls`. */
export function deriveReelPosterFromVideo(videoUrl?: string | null): string | undefined {
  const value = String(videoUrl || '').trim();
  const match = value.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(?:(v\d+|[\w_,.-]+)\/)?(.+?)\.(mp4|mov|webm|m3u8)(?:[?#].*)?$/i,
  );
  if (!match) return undefined;
  const [, base, segment, path] = match;
  const rest = segment && !/^v\d+/i.test(segment) ? `${segment}/${path}` : path;
  return `${base}so_0,q_auto/${rest}.jpg`;
}
