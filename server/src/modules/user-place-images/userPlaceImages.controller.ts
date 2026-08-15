import { Request, Response } from 'express';
import { userPlaceImagesService } from './userPlaceImages.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const userPlaceImagesController = {
  contribute: catchAsync(async (req: any, res: Response) => {
    const submission = await userPlaceImagesService.contribute(req.params.id, req.user.id, req.body);
    sendCreated(res, submission, 'Image submitted for review');
  }),

  getContributionStatus: catchAsync(async (req: any, res: Response) => {
    const status = await userPlaceImagesService.getContributionStatus(req.params.id, req.user.id);
    sendSuccess(res, status);
  }),

  listAdmin: catchAsync(async (req: Request, res: Response) => {
    const result = await userPlaceImagesService.listAdmin(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  approve: catchAsync(async (req: any, res: Response) => {
    const result = await userPlaceImagesService.approve(req.params.id, req.user.id);
    sendSuccess(res, result, { message: 'Image approved' });
  }),

  reject: catchAsync(async (req: any, res: Response) => {
    const result = await userPlaceImagesService.reject(req.params.id, req.user.id, req.body.reason);
    sendSuccess(res, result, { message: 'Image rejected' });
  }),
};
