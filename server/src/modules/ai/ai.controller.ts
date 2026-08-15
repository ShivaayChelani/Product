import { Request, Response } from 'express';
import { aiService } from './ai.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const aiController = {
  getRecommendations: catchAsync(async (req: any, res: Response) => {
    const query = { ...(req.query as Record<string, unknown>) };
    const isAdmin = req.user && ['ADMIN', 'SUPER_ADMIN', 'OPS_ADMIN', 'ANALYTICS_VIEWER'].some(
      (r: string) => req.user.roles?.includes(r) || req.user.permission === r,
    );
    if (req.user?.id) {
      if (!isAdmin) {
        query.userId = req.user.id;
      }
    } else {
      delete query.userId;
    }
    const result = await aiService.getRecommendations(query as any);
    sendSuccess(res, result);
  }),

  getSimilar: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '10';
    const result = await aiService.getSimilar(id, parseInt(limitStr, 10));
    sendSuccess(res, result);
  }),

  getUserVector: catchAsync(async (req: any, res: Response) => {
    const userId = req.params.userId as string;
    if (req.user.permission !== 'ADMIN' && req.user.id !== userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const result = await aiService.getUserVector(userId);
    sendSuccess(res, result);
  }),

  planTrip: catchAsync(async (req: Request, res: Response) => {
    const prompt = req.query.prompt as string | undefined;
    if (!prompt) {
      const days = parseInt(req.query.days as string, 10);
      if (!days || days < 1) {
        res.status(400).json({ success: false, message: 'days must be at least 1' }); return;
      }
      if (days > 14) {
        res.status(400).json({ success: false, message: 'days must be 14 or fewer' }); return;
      }
    }
    const result = await aiService.planTrip(req.query as any);
    sendSuccess(res, result);
  }),

  discover: catchAsync(async (req: Request, res: Response) => {
    const result = await aiService.discover(req.query as any);
    sendSuccess(res, result);
  }),

  structuredDiscovery: catchAsync(async (req: Request, res: Response) => {
    const result = await aiService.structuredDiscovery(req.query as any);
    sendSuccess(res, result);
  }),
};
