import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';
import { toFormFile } from '../upload/formFile';

export interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export const uploadApi = {
  async uploadImage(uri: string, mime?: string | null, fileName?: string | null) {
    const formData = new FormData();
    formData.append('image', toFormFile(uri, 'image', mime, fileName) as any);

    const res = await apiClient.upload<UploadResult>(
      API_CONFIG.endpoints.upload.single,
      formData,
    );
    if (!res.data?.url) {
      throw new Error(res.message || 'Image upload failed');
    }
    return res.data;
  },

  async uploadMultiple(uris: string[]) {
    const formData = new FormData();
    uris.forEach((uri, i) => {
      formData.append('images', toFormFile(uri, 'image', null, `upload_${i}.jpg`) as any);
    });

    const res = await apiClient.upload<UploadResult[]>(
      API_CONFIG.endpoints.upload.multiple,
      formData,
    );
    return res.data!;
  },

  async health() {
    return apiClient.get(API_CONFIG.endpoints.health);
  },

  async uploadVideo(
    uri: string,
    _onProgress?: (progress: number) => void,
    mime?: string | null,
    fileName?: string | null,
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('video', toFormFile(uri, 'video', mime, fileName) as any);

    const res = await apiClient.upload<UploadResult>(
      API_CONFIG.endpoints.upload.video,
      formData,
    );
    if (!res.data?.url) {
      throw new Error(res.message || 'Video upload failed');
    }
    return res.data;
  },
};
