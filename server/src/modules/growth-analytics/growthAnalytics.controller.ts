import { Response } from 'express';
import { growthAnalyticsService } from './growthAnalytics.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const growthAnalyticsController = {
  getDashboard: catchAsync(async (req: any, res: Response) => {
    const result = await growthAnalyticsService.getDashboard(req.query);
    sendSuccess(res, result);
  }),
};
