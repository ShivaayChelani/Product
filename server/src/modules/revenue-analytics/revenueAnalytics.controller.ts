import { Response } from 'express';
import { revenueAnalyticsService } from './revenueAnalytics.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

const ALLOWED_REVENUE_EXPORT_TYPES = ['redemptions', 'vendors', 'offers'] as const;

export const revenueAnalyticsController = {
  getDashboard: catchAsync(async (req: any, res: Response) => {
    const result = await revenueAnalyticsService.getDashboard(req.query);
    sendSuccess(res, result);
  }),

  exportCSV: catchAsync(async (req: any, res: Response) => {
    const type = ALLOWED_REVENUE_EXPORT_TYPES.includes(req.query.type) ? req.query.type : 'redemptions';
    const csv = await revenueAnalyticsService.getExportCSV({ ...req.query, type });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=revenue-${type}.csv`);
    res.send(csv);
  }),
};
