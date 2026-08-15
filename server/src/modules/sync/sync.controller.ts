import { Response } from 'express';
import { syncService } from './sync.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const syncController = {
  processBatch: catchAsync(async (req: any, res: Response) => {
    const result = await syncService.processBatch(req.user.id, req.body);
    sendCreated(res, result, 'Sync batch queued for processing');
  }),

  getPending: catchAsync(async (req: any, res: Response) => {
    const result = await syncService.getPending(req.user.id, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getUserStatus: catchAsync(async (req: any, res: Response) => {
    const status = await syncService.getUserStatus(req.user.id);
    sendSuccess(res, status);
  }),

  getAllItems: catchAsync(async (req: any, res: Response) => {
    const result = await syncService.getAllAdmin(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getGlobalStats: catchAsync(async (_req: any, res: Response) => {
    const stats = await syncService.getAdminStats();
    sendSuccess(res, stats);
  }),
};
