import { Response } from 'express';
import { uploadService } from './upload.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ADMIN_ROLES, hasRole } from '../../middleware/auth';

function mediaActor(req: any) {
  return {
    userId: String(req.user?.id || ''),
    isAdmin: ADMIN_ROLES.some((role) => hasRole(req.user, role)),
  };
}

export const uploadController = {
  uploadImage: catchAsync(async (req: any, res: Response) => {
    const result = await uploadService.uploadImage(req.file, req.user.id);
    sendCreated(res, result, 'Image uploaded successfully');
  }),

  uploadMultiple: catchAsync(async (req: any, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      sendSuccess(res, [], { message: 'No image files provided.' });
      return;
    }

    const results = await Promise.all(
      files.map((file) => uploadService.uploadImage(file, req.user.id)),
    );

    sendCreated(res, results, `${results.length} images uploaded successfully`);
  }),

  uploadVideo: catchAsync(async (req: any, res: Response) => {
    const result = await uploadService.uploadVideo(req.file, req.user.id);
    sendCreated(res, result, 'Video uploaded successfully');
  }),

  deleteMedia: catchAsync(async (req: any, res: Response) => {
    const publicId = String(req.body?.publicId || '').trim();
    const resourceType = req.body?.resourceType === 'video' ? 'video' : 'image';
    await uploadService.deleteMedia(publicId, resourceType, mediaActor(req));
    sendSuccess(res, { deleted: true }, { message: 'Media removed' });
  }),
};
