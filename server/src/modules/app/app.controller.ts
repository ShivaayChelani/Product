import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { appPublicService } from './app.service';

export const appPublicController = {
  mobileConfig: catchAsync(async (_req: Request, res: Response) => {
    const data = await appPublicService.getMobileConfig();
    sendSuccess(res, data);
  }),

  licenses: catchAsync(async (_req: Request, res: Response) => {
    const data = await appPublicService.getOpenSourceLicenses();
    sendSuccess(res, data);
  }),
};
