import { Request, Response } from 'express';
import { analyticsService } from './analytics.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const analyticsController = {
  getDashboard: catchAsync(async (_req: Request, res: Response) => {
    const data = await analyticsService.getDashboard();
    sendSuccess(res, data);
  }),

  getPlacesAnalytics: catchAsync(async (req: Request, res: Response) => {
    const data = await analyticsService.getPlacesAnalytics(req.query as any);
    sendSuccess(res, data);
  }),

  getCitiesDashboard: catchAsync(async (_req: Request, res: Response) => {
    const data = await analyticsService.getCitiesDashboard();
    sendSuccess(res, data);
  }),

  getGrowthDashboard: catchAsync(async (_req: Request, res: Response) => {
    const data = await analyticsService.getGrowthDashboard();
    sendSuccess(res, data);
  }),

  getRevenueDashboard: catchAsync(async (_req: Request, res: Response) => {
    const data = await analyticsService.getRevenueDashboard();
    sendSuccess(res, data);
  }),

  getUsersAnalytics: catchAsync(async (_req: Request, res: Response) => {
    const data = await analyticsService.getUsersAnalytics();
    sendSuccess(res, data);
  }),
};
