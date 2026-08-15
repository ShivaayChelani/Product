import { Router } from 'express';
import { campaignsController } from './campaigns.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireMarketingOps } from '../../middleware/adminCapabilities';

const router = Router();

// Public list
router.get('/', campaignsController.listCampaigns);

// Authenticated user routes (must be registered before "/:id")
router.get('/user/claims', authenticate, campaignsController.getUserClaims);
router.post('/:id/claim', authenticate, campaignsController.claimReward);

// Admin routes (must be registered before "/:id")
router.get('/admin/claims', authenticate, requireAdmin, campaignsController.listAllClaims);
router.patch('/admin/claims/:id/status', authenticate, requireMarketingOps, campaignsController.updateClaimStatus);
router.post('/', authenticate, requireMarketingOps, campaignsController.createCampaign);
router.patch('/:id', authenticate, requireMarketingOps, campaignsController.updateCampaign);
router.delete('/:id', authenticate, requireMarketingOps, campaignsController.deleteCampaign);

// Public detail — keep last so it does not shadow /user/* or /admin/*
router.get('/:id', campaignsController.getCampaignById);

export const campaignRoutes = router;
