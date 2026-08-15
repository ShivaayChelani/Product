import { uploadToCloudinary, uploadVideoToCloudinary, cloudinary, validateImageMagicBytes, validateVideoMagicBytes } from '../../config/upload';
import { ApiError } from '../../shared/utils/ApiError';

interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  duration?: number;
}

export const uploadService = {
  async uploadImage(file: Express.Multer.File): Promise<UploadResult> {
    if (!file) {
      throw new ApiError(400, 'No image file provided.');
    }

    if (!validateImageMagicBytes(file.buffer)) {
      throw new ApiError(400, 'Invalid image file. Only JPEG, PNG, and WebP are allowed.');
    }

    const result = await uploadToCloudinary(file.buffer, 'palsasafar/places');
    return result;
  },

  async uploadVideo(file: Express.Multer.File): Promise<UploadResult> {
    if (!file) {
      throw new ApiError(400, 'No video file provided.');
    }

    if (!validateVideoMagicBytes(file.buffer)) {
      throw new ApiError(400, 'Invalid video file. Only MP4, MOV, and WebM are allowed.');
    }

    // This offloads the compression to Cloudinary which will handle it synchronously 
    // up to 100MB limit per request (Cloudinary allows up to 100MB synchronous upload on paid plans, 
    // but typically we should chunk it for larger files. We'll use the default stream for now).
    try {
      const result = await uploadVideoToCloudinary(file.buffer, 'palsasafar/reels');
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

  async deleteImage(publicId: string): Promise<void> {
    await this.deleteMedia(publicId, 'image');
  },

  async deleteMedia(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<void> {
    const id = String(publicId || '').trim();
    if (!id) {
      throw new ApiError(400, 'Media id is required.');
    }
    if (!id.startsWith('palsasafar/')) {
      throw new ApiError(400, 'Invalid media id.');
    }
    await cloudinary.uploader.destroy(id, { resource_type: resourceType });
  },
};
