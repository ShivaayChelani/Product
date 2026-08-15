import { Response } from 'express';
import { pointsService } from './points.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const pointsController = {
  getBalance: catchAsync(async (req: any, res: Response) => {
    const balance = await pointsService.getBalance(req.user.id);
    sendSuccess(res, {
      ...balance,
      rupeeValue: pointsService.pointsToRupees(balance.balance),
    });
  }),

  earn: catchAsync(async (req: any, res: Response) => {
    const balance = await pointsService.earn(req.body.userId, req.body.amount, req.body.reason, req.body.referenceId);
    sendSuccess(res, balance, { message: `Earned ${req.body.amount} points` });
  }),

  history: catchAsync(async (req: any, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await pointsService.getTransactionHistory(req.user.id, page, limit);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),
};
