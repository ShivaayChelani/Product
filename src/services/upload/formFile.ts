export type FormFileKind = 'image' | 'video';

export interface FormFilePart {
  uri: string;
  type: string;
  name: string;
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
};

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
};

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

function extensionFromName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const clean = name.split('?')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  if (!ext || ext.length > 5 || !/^[a-z0-9]+$/.test(ext)) return undefined;
  return ext;
}

function extensionFromUri(uri: string): string | undefined {
  if (uri.startsWith('content://')) return undefined;
  return extensionFromName(uri);
}

function stripMime(raw?: string | null): string {
  return String(raw || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

/**
 * Android Photo Picker often sends `image/*`, `image/jpg`, or empty MIME.
 * Map those to a concrete type multer will accept. Do not invent HEIC support.
 */
export function normalizeUploadMime(
  kind: FormFileKind,
  mimeHint?: string | null,
  ext?: string | null,
): string {
  const mime = stripMime(mimeHint);

  if (kind === 'video') {
    if (mime === 'video/quicktime' || mime === 'video/mp4' || mime === 'video/webm') return mime;
    if (mime === 'video/mov') return 'video/quicktime';
    if (ext && VIDEO_MIME[ext]) return VIDEO_MIME[ext];
    return 'video/mp4';
  }

  if (mime === 'image/jpg' || mime === 'image/pjpeg') return 'image/jpeg';
  if (ALLOWED_IMAGE_MIME.has(mime)) return mime;
  if (mime === 'image/heic' || mime === 'image/heif') return mime;
  if (ext && IMAGE_MIME[ext]) return IMAGE_MIME[ext];
  return 'image/jpeg';
}

export function isUnsupportedPortfolioImageMime(mime: string): boolean {
  const normalized = stripMime(mime);
  return normalized === 'image/heic' || normalized === 'image/heif' || normalized === 'image/gif';
}

export function assertSupportedUploadMime(kind: FormFileKind, mime: string): void {
  if (kind === 'video') {
    if (!ALLOWED_VIDEO_MIME.has(mime)) {
      throw new Error('Only MP4, MOV, and WebM videos are allowed.');
    }
    return;
  }
  if (isUnsupportedPortfolioImageMime(mime) || !ALLOWED_IMAGE_MIME.has(mime)) {
    throw new Error('Please choose a JPEG, PNG, or WebP image.');
  }
}

/**
 * Build a React Native FormData file part that works for file:// and Android content:// URIs.
 * Never infer an extension from a content:// path — use picker MIME / fileName instead.
 */
export function toFormFile(
  uri: string,
  kind: FormFileKind,
  mimeHint?: string | null,
  fileNameHint?: string | null,
): FormFilePart {
  const ext =
    extensionFromName(fileNameHint) ||
    extensionFromUri(uri) ||
    (kind === 'video' ? 'mp4' : 'jpg');

  const type = normalizeUploadMime(kind, mimeHint, ext);

  if (kind === 'video') {
    const name = fileNameHint || `reel.${ext === 'mov' ? 'mov' : 'mp4'}`;
    return { uri, type, name };
  }

  const name = fileNameHint || `upload.${ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg'}`;
  return { uri, type, name };
}
