import { Request, Response } from 'express';
import { campaignsService } from './campaigns.service';
import { createCampaignSchema, updateCampaignSchema, claimCampaignSchema, updateClaimStatusSchema } from './campaigns.validation';
import { catchAsync } from '../../shared/utils/catchAsync';

export const campaignsController = {
  listCampaigns: catchAsync(async (req: Request, res: Response) => {
    const query = req.query as any;
    const result = await campaignsService.listCampaigns(query);
    res.json({ success: true, ...result });
  }),

  getCampaignById: catchAsync(async (req: Request, res: Response) => {
    const result = await campaignsService.getCampaignById(String(req.params.id));
    res.json({ success: true, data: result });
  }),

  createCampaign: catchAsync(async (req: Request, res: Response) => {
    const input = createCampaignSchema.parse(req.body);
    const result = await campaignsService.createCampaign(input);
    res.status(201).json({ success: true, data: result });
  }),

  updateCampaign: catchAsync(async (req: Request, res: Response) => {
    const input = updateCampaignSchema.parse(req.body);
    const result = await campaignsService.updateCampaign(String(req.params.id), input);
    res.json({ success: true, data: result });
  }),

  deleteCampaign: catchAsync(async (req: Request, res: Response) => {
    await campaignsService.deleteCampaign(String(req.params.id));
    res.json({ success: true, message: 'Campaign deleted' });
  }),

  claimReward: catchAsync(async (req: any, res: Response) => {
    const input = claimCampaignSchema.parse(req.body);
    const result = await campaignsService.claimReward(req.user!.id, String(req.params.id), input.notes);
    res.json({ success: true, data: result });
  }),

  getUserClaims: catchAsync(async (req: any, res: Response) => {
    const result = await campaignsService.getUserClaims(req.user!.id);
    res.json({ success: true, data: result });
  }),

  listAllClaims: catchAsync(async (req: Request, res: Response) => {
    const query = req.query as any;
    const result = await campaignsService.listAllClaims(query);
    res.json({ success: true, ...result });
  }),

  updateClaimStatus: catchAsync(async (req: Request, res: Response) => {
    const input = updateClaimStatusSchema.parse(req.body);
    const result = await campaignsService.updateClaimStatus(String(req.params.id), input.status);
    res.json({ success: true, data: result });
  })
};
