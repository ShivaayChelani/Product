import { Request, Response } from 'express';
import { rewardsService } from './rewards.service';
import { redemptionsService } from '../redemptions/redemptions.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const rewardsController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await rewardsService.listRewards(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const reward = await rewardsService.getRewardById(req.params.id as string);
    sendSuccess(res, reward);
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const reward = await rewardsService.createReward(req.body);
    sendCreated(res, reward, 'Reward created');
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const reward = await rewardsService.updateReward(req.params.id as string, req.body);
    sendSuccess(res, reward, { message: 'Reward updated' });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    await rewardsService.deleteReward(req.params.id as string);
    sendSuccess(res, null, { message: 'Reward deleted' });
  }),

  listOffers: catchAsync(async (req: Request, res: Response) => {
    const result = await rewardsService.listVendorOffers(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getVendorOfferById: catchAsync(async (req: Request, res: Response) => {
    const offer = await rewardsService.getPublicVendorOfferById(String(req.params.offerId));
    sendSuccess(res, offer);
  }),

  redeemOffer: catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { offerId, vendorCode } = req.body as { offerId: string; vendorCode: string };
    const result = await redemptionsService.redeemOffer(userId, offerId, vendorCode);
    sendCreated(res, result, 'Offer redeemed successfully');
  }),

  nearby: catchAsync(async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string || '10');

    if (isNaN(lat) || isNaN(lng)) {
      sendSuccess(res, null, { message: 'Invalid coordinates' });
      return;
    }

    const nearby = await rewardsService.getNearbyRewards(lat, lng, radius);
    sendSuccess(res, nearby);
  }),
};
