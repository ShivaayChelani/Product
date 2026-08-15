import { Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { creatorService } from './creator.service';
import { socialService } from '../social/social.service';

export const creatorController = {
  getDashboard: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.getDashboard(req.user.id);
    sendSuccess(res, data);
  }),

  getAnalytics: catchAsync(async (req: any, res: Response) => {
    const period = (req.query.period as string) || '7d';
    const data = await creatorService.getAnalytics(req.user.id, period);
    sendSuccess(res, data);
  }),

  getProfile: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.getProfile(req.user.id);
    sendSuccess(res, data);
  }),

  updateProfile: catchAsync(async (req: any, res: Response) => {
    const data = await socialService.updateProfile(req.user.id, req.body);
    sendSuccess(res, data);
  }),

  listReels: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.listReels(req.user.id, req.query as Record<string, string>);
    sendSuccess(res, data);
  }),

  createDraft: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.createDraft(req.user.id, req.body);
    sendSuccess(res, data, { message: 'Draft saved.', statusCode: 201 });
  }),

  publishDraft: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.publishDraft(req.user.id, req.params.id);
    sendSuccess(res, data, { message: 'Reel published.' });
  }),

  deleteReel: catchAsync(async (req: any, res: Response) => {
    await socialService.deleteOwnReel(req.user.id, req.params.id);
    sendSuccess(res, null, { message: 'Reel deleted.' });
  }),

  getReelAnalytics: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.getReelAnalytics(req.user.id, req.params.id);
    sendSuccess(res, data);
  }),

  getResources: catchAsync(async (_req: any, res: Response) => {
    const data = await creatorService.getResources();
    sendSuccess(res, data);
  }),

  getCollaborations: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.getCollaborations(req.user.id, req.query);
    sendSuccess(res, data);
  }),

  getChallenges: catchAsync(async (req: any, res: Response) => {
    const data = await creatorService.getChallenges(req.user.id);
    sendSuccess(res, data);
  }),

  getLeaderboard: catchAsync(async (req: any, res: Response) => {
    const limit = req.query.limit as string | undefined;
    const data = await creatorService.getLeaderboard(limit ? parseInt(limit, 10) : 20);
    sendSuccess(res, data);
  }),

  createReel: catchAsync(async (req: any, res: Response) => {
    const data = await socialService.createReel(req.user.id, req.body);
    sendSuccess(res, data, { message: 'Reel published.', statusCode: 201 });
  }),
};
