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
  if (value.includes('/video/upload/')) return false;
  if (value.includes('/image/upload/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(value);
}
