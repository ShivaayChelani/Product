import { Response } from 'express';
import { uploadService } from './upload.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const uploadController = {
  uploadImage: catchAsync(async (req: any, res: Response) => {
    const result = await uploadService.uploadImage(req.file);
    sendCreated(res, result, 'Image uploaded successfully');
  }),

  uploadMultiple: catchAsync(async (req: any, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      sendSuccess(res, [], { message: 'No image files provided.' });
      return;
    }

    const results = await Promise.all(
      files.map((file) => uploadService.uploadImage(file)),
    );

    sendCreated(res, results, `${results.length} images uploaded successfully`);
  }),

  uploadVideo: catchAsync(async (req: any, res: Response) => {
    const result = await uploadService.uploadVideo(req.file);
    sendCreated(res, result, 'Video uploaded successfully');
  }),

  deleteMedia: catchAsync(async (req: any, res: Response) => {
    const publicId = String(req.body?.publicId || '').trim();
    const resourceType = req.body?.resourceType === 'video' ? 'video' : 'image';
    await uploadService.deleteMedia(publicId, resourceType);
    sendSuccess(res, { deleted: true }, { message: 'Media removed' });
  }),
};
