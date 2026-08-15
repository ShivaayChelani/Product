import { Request, Response } from 'express';
import { auditService } from './audit.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const auditController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await auditService.list(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getActions: catchAsync(async (_req: Request, res: Response) => {
    const actions = await auditService.getDistinctActions();
    sendSuccess(res, actions);
  }),

  getEntityTypes: catchAsync(async (_req: Request, res: Response) => {
    const types = await auditService.getDistinctEntityTypes();
    sendSuccess(res, types);
  }),

  exportCSV: catchAsync(async (req: Request, res: Response) => {
    const csv = await auditService.exportCSV(req.query as any);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  }),
};
