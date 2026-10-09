import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';
import { env } from './env';
import { ApiError } from '../shared/utils/ApiError';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

const storage = multer.memoryStorage();

function imageMimeAllowed(raw: string | undefined): boolean {
  const mime = String(raw || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  // Exact types plus Android Photo Picker generics. Bytes are still gated by validateImageMagicBytes.
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/pjpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    mime === 'image/*' ||
    mime === 'application/octet-stream' ||
    mime === ''
  );
}

function videoMimeAllowed(raw: string | undefined): boolean {
  const mime = String(raw || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  return (
    mime === 'video/mp4' ||
    mime === 'video/quicktime' ||
    mime === 'video/webm' ||
    mime === 'video/*' ||
    mime === 'application/octet-stream' ||
    mime === ''
  );
}

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (imageMimeAllowed(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

export const videoUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for Reels
  fileFilter: (_req, file, cb) => {
    if (videoMimeAllowed(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'Only MP4, MOV, and WebM videos are allowed'));
    }
  },
});

export function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    if (buffer.length < 4) return false;
    const header = buffer.toString('hex', 0, 4).toUpperCase();
    if (header.startsWith('FFD8FF')) return true; // JPEG
    if (header === '89504E47') return true; // PNG
    return false;
  }
  const header = buffer.toString('hex', 0, 4).toUpperCase();
  if (header.startsWith('FFD8FF')) return true; // JPEG
  if (header === '89504E47') return true; // PNG
  // WebP is RIFF....WEBP — require both RIFF container and WEBP brand
  if (header === '52494646' && buffer.toString('ascii', 8, 12) === 'WEBP') return true;
  return false;
}

export function validateVideoMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  // Quicktime/MP4 usually has ftyp box at bytes 4-8: 66747970
  const boxType = buffer.toString('hex', 4, 8).toUpperCase();
  if (boxType === '66747970') return true;
  // WebM usually starts with 1A45DFA3
  const webmHeader = buffer.toString('hex', 0, 4).toUpperCase();
  if (webmHeader === '1A45DFA3') return true;
  return false;
}

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  ownerUserId?: string,
): Promise<{ url: string; publicId: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1200, height: 900, crop: 'limit', quality: 'auto' }],
        ...(ownerUserId ? { context: { owner: ownerUserId } } : {}),
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Upload failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/** Derive a lazy Cloudinary poster (a video frame served as a JPG) from a
 *  Cloudinary video URL. Cloudinary generates the frame on first request and
 *  caches it at the CDN — no eager or synchronous transformation, so it costs
 *  nothing at upload time (matching the Render request-budget constraint
 *  documented below). The `so_0` start offset and `q_auto` quality are enough;
 *  the extension swap from a video container to `.jpg` selects the image output. */
export function deriveVideoPosterUrl(videoUrl?: string | null): string | undefined {
  if (!videoUrl) return undefined;
  const match = String(videoUrl).match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(?:(v\d+|[\w_,.-]+)\/)?(.+?)\.(mp4|mov|webm|m3u8)(?:[?#].*)?$/i,
  );
  if (!match) return undefined;
  const [, base, segment, path] = match;
  const rest = segment && !/^v\d+/i.test(segment) ? `${segment}/${path}` : path;
  return `${base}so_0,q_auto/${rest}.jpg`;
}

export function isLikelyVideoMediaUrl(url?: string | null): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/\.(jpe?g|png|webp|gif|bmp)(?:[?#]|$)/i.test(value)) return false;
  return /\.(mp4|mov|webm|m3u8)(?:[?#]|$)/i.test(value);
}

export function resolveStoredReelPoster(
  thumbnail?: string | null,
  videoUrl?: string | null,
): string | null {
  const raw = String(thumbnail || '').trim();
  if (raw && !isLikelyVideoMediaUrl(raw)) return raw;
  return deriveVideoPosterUrl(videoUrl) || deriveVideoPosterUrl(raw) || null;
}

/** Incoming video transformations are synchronous at Cloudinary and routinely
 *  exceed Render's request budget, so the mobile client never receives a URL
 *  and the job appears stuck. Playback already applies `q_auto,vc_h264`. */
export const CLOUDINARY_VIDEO_UPLOAD_OPTIONS = {
  resource_type: 'video' as const,
  allowed_formats: ['mp4', 'mov', 'webm'],
};

export const uploadVideoToCloudinary = (
  buffer: Buffer,
  folder: string,
  ownerUserId?: string,
): Promise<{ url: string; publicId: string; duration: number }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        ...CLOUDINARY_VIDEO_UPLOAD_OPTIONS,
        ...(ownerUserId ? { context: { owner: ownerUserId } } : {}),
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Video upload failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          duration: result.duration || 0,
        });
      },
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

export { cloudinary };
