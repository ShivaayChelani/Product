import { uploadToCloudinary, uploadVideoToCloudinary, cloudinary, validateImageMagicBytes, validateVideoMagicBytes } from '../../config/upload';
import { ApiError } from '../../shared/utils/ApiError';

interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface MediaActor {
  userId: string;
  isAdmin: boolean;
}

/** Same-process ownership for freshly uploaded assets (tests + single-instance). */
const uploadOwners = new Map<string, string>();

function rememberOwner(publicId: string, userId: string) {
  uploadOwners.set(publicId, userId);
}

async function assertCanDelete(
  publicId: string,
  resourceType: 'image' | 'video',
  actor: MediaActor,
): Promise<void> {
  if (actor.isAdmin) return;

  const mapped = uploadOwners.get(publicId);
  if (mapped === actor.userId) return;
  if (mapped && mapped !== actor.userId) {
    throw new ApiError(403, 'You cannot remove this media.');
  }

  let owner: string | undefined;
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
    const context = resource?.context as { custom?: { owner?: string }; owner?: string } | undefined;
    owner = context?.custom?.owner || context?.owner;
  } catch {
    owner = undefined;
  }

  if (!owner || owner !== actor.userId) {
    throw new ApiError(403, 'You cannot remove this media.');
  }
}

export const uploadService = {
  async uploadImage(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    if (!file) {
      throw new ApiError(400, 'No image file provided.');
    }

    if (!validateImageMagicBytes(file.buffer)) {
      throw new ApiError(400, 'Invalid image file. Only JPEG, PNG, and WebP are allowed.');
    }

    const result = await uploadToCloudinary(file.buffer, 'palsasafar/places', userId);
    rememberOwner(result.publicId, userId);
    return result;
  },

  async uploadVideo(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    if (!file) {
      throw new ApiError(400, 'No video file provided.');
    }

    if (!validateVideoMagicBytes(file.buffer)) {
      throw new ApiError(400, 'Invalid video file. Only MP4, MOV, and WebM are allowed.');
    }

    try {
      const result = await uploadVideoToCloudinary(file.buffer, 'palsasafar/reels', userId);
      rememberOwner(result.publicId, userId);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Video storage upload failed';
      if (/too large|file size|413/i.test(message)) {
        throw new ApiError(413, 'Video is too large. Please choose a smaller video.');
      }
      if (/format|unsupported|invalid/i.test(message)) {
        throw new ApiError(415, 'This video format is not supported.');
      }
      throw new ApiError(502, 'Video storage is temporarily unavailable. Please try again.');
    }
  },

  async deleteImage(publicId: string, actor: MediaActor): Promise<void> {
    await this.deleteMedia(publicId, 'image', actor);
  },

  async deleteMedia(
    publicId: string,
    resourceType: 'image' | 'video' = 'image',
    actor?: MediaActor,
  ): Promise<void> {
    const id = String(publicId || '').trim();
    if (!id) {
      throw new ApiError(400, 'Media id is required.');
    }
    if (!id.startsWith('palsasafar/')) {
      throw new ApiError(400, 'Invalid media id.');
    }
    if (!actor?.userId) {
      throw new ApiError(401, 'Authentication required');
    }
    await assertCanDelete(id, resourceType, actor);
    await cloudinary.uploader.destroy(id, { resource_type: resourceType });
  },
};
