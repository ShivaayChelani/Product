import { Response } from 'express';
import { reportsService } from './reports.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

const ALLOWED_REPORT_TYPES = ['users', 'vendors', 'places', 'revenue', 'engagement'] as const;

export const reportsController = {
  generate: catchAsync(async (req: any, res: Response) => {
    const type = ALLOWED_REPORT_TYPES.includes(req.query.type) ? req.query.type : 'users';
    const result = await reportsService.generateReport({
      ...req.query,
      type,
      format: req.query.format as any || 'json',
    });
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=report-${type}.csv`);
      res.send(result);
    }
    sendSuccess(res, result);
  }),
};
