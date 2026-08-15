import { Response } from 'express';
import { cityAnalyticsService } from './cityAnalytics.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const cityAnalyticsController = {
  getDashboard: catchAsync(async (req: any, res: Response) => {
    const result = await cityAnalyticsService.getDashboard(req.query);
    sendSuccess(res, result);
  }),
};
