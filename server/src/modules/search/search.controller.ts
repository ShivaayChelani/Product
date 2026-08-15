import { Request, Response } from 'express';
import { searchService } from './search.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const searchController = {
  universalSearch: catchAsync(async (req: any, res: Response) => {
    const result = await searchService.universalSearch(req.user?.id, req.query);
    sendSuccess(res, result, { message: 'Universal search complete' });
  }),

  getTrending: catchAsync(async (req: Request, res: Response) => {
    const trending = await searchService.getTrendingKeywords();
    sendSuccess(res, trending, { message: 'Trending keywords retrieved' });
  }),

  getAnalytics: catchAsync(async (req: Request, res: Response) => {
    const analytics = await searchService.getSearchAnalytics();
    sendSuccess(res, analytics, { message: 'Search analytics retrieved' });
  }),

  adminGlobalSearch: catchAsync(async (req: Request, res: Response) => {
    const q = req.query.q as string;
    const result = await searchService.adminGlobalSearch(q);
    sendSuccess(res, result, { message: 'Admin search complete' });
  }),
};
