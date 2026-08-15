import { Request, Response } from 'express';
import { walletService } from './wallet.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { ApiError } from '../../shared/utils/ApiError';
import { pointRulesService } from '../point-rules/pointRules.service';

export const walletController = {
  getProfile: catchAsync(async (req: any, res: Response) => {
    const profile = await walletService.getProfile(req.user.id);
    sendSuccess(res, profile);
  }),

  earn: catchAsync(async (req: any, res: Response) => {
    const wallet = await walletService.earn(req.body.userId, req.body.amount, req.body.reason, req.body.referenceId, req.body.referenceType);
    sendSuccess(res, wallet, { message: `Earned ${req.body.amount} Pal Points` });
  }),

  transactions: catchAsync(async (req: any, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const result = await walletService.getTransactions(req.user.id, page, limit);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  adjust: catchAsync(async (req: any, res: Response) => {
    const wallet = await walletService.adjustWallet(req.params.userId, req.user.id, req.body);
    sendSuccess(res, wallet, { message: 'Wallet adjusted successfully' });
  }),

  getByUserId: catchAsync(async (req: any, res: Response) => {
    const profile = await walletService.getProfile(req.params.userId);
    sendSuccess(res, profile);
  }),

  getBatch: catchAsync(async (req: any, res: Response) => {
    const userIds = req.query.userIds as string[];
    const profiles = await walletService.getBatchProfiles(userIds);
    sendSuccess(res, profiles);
  }),

  getLeaderboard: catchAsync(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const result = await walletService.getLeaderboard(page, limit);
    res.json({ success: true, ...result });
  }),

  completeGame: catchAsync(async (req: any, res: Response) => {
    const rule = await pointRulesService.getPointsForAction('game_complete');
    if (!rule) {
      throw new ApiError(400, 'Game rewards are currently disabled');
    }
    const points = rule.points;
    const gameName = String(req.body?.gameName || 'Memory Match').slice(0, 80);

    const wallet = await walletService.earnGameComplete(
      req.user.id,
      points,
      rule.cooldownSec,
      rule.maxDaily,
    );
    sendSuccess(res, { palPoints: wallet.palPoints }, { message: `Earned ${points} Pal Points for completing ${gameName}` });
  }),

  getRegionalLeaderboard: catchAsync(async (req: Request, res: Response) => {
    const city = (req.query.city as string) || 'Jabalpur';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const result = await walletService.getRegionalLeaderboard(city, page, limit);
    sendSuccess(res, result.data);
  }),

  claimDailyLogin: catchAsync(async (req: any, res: Response) => {
    const { claimDailyLoginReward } = await import('../auth/daily-rewards');
    const result = await claimDailyLoginReward(req.user.id);
    sendSuccess(res, result, {
      message: result.alreadyClaimed
        ? 'Already claimed today'
        : `+${result.points} PalPoints claimed`,
    });
  }),

  dailyLoginStatus: catchAsync(async (req: any, res: Response) => {
    const { getDailyLoginStatus } = await import('../auth/daily-rewards');
    const result = await getDailyLoginStatus(req.user.id);
    sendSuccess(res, result);
  }),
};
