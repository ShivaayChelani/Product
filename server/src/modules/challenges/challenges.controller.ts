import { Request, Response } from 'express';
import { challengesService } from './challenges.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ChallengeStatus } from '@prisma/client';

export const challengesController = {
  listApproved: catchAsync(async (req: Request, res: Response) => {
    const result = await challengesService.listApproved(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const challenge = await challengesService.getById(req.params.id as string);
    sendSuccess(res, challenge);
  }),

  listMyCreated: catchAsync(async (req: any, res: Response) => {
    const data = await challengesService.listMyCreated(req.user.id);
    sendSuccess(res, data);
  }),

  create: catchAsync(async (req: any, res: Response) => {
    const challenge = await challengesService.create(req.user.id, req.body);
    sendCreated(res, challenge, 'Challenge submitted for moderation');
  }),

  updateStatus: catchAsync(async (req: any, res: Response) => {
    const { status, rejectionReason } = req.body;
    const challenge = await challengesService.updateStatus(
      req.params.id as string,
      status as ChallengeStatus,
      req.user.id,
      rejectionReason
    );
    sendSuccess(res, challenge, { message: `Challenge status updated to ${status.toLowerCase()}` });
  }),

  toggleFeatured: catchAsync(async (req: Request, res: Response) => {
    const challenge = await challengesService.toggleFeatured(req.params.id as string);
    sendSuccess(res, challenge, { message: 'Featured status toggled' });
  }),

  toggleTrending: catchAsync(async (req: Request, res: Response) => {
    const challenge = await challengesService.toggleTrending(req.params.id as string);
    sendSuccess(res, challenge, { message: 'Trending status toggled' });
  }),

  complete: catchAsync(async (req: any, res: Response) => {
    const { proofUrl, qrCode, latitude, longitude } = req.body;
    const result = await challengesService.complete(
      req.params.id as string,
      req.user.id,
      proofUrl,
      { qrCode, latitude, longitude },
    );
    sendSuccess(
      res,
      { ...result.completion, pointsAwarded: result.pointsAwarded },
      { message: 'Challenge completed successfully!' }
    );
  }),

  getLeaderboard: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const result = await challengesService.getLeaderboard(page, limit);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),
};
