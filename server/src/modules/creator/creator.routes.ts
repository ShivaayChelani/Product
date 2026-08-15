import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireCreatorRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createReelSchema } from '../social/social.validation';
import { creatorController } from './creator.controller';
import {
  createDraftSchema,
  creatorAnalyticsQuerySchema,
  creatorReelsQuerySchema,
  updateCreatorProfileSchema,
} from './creator.validation';

const router = Router();

const limiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(limiter);
router.use(authenticate);
router.use(requireCreatorRole);

router.get('/dashboard', creatorController.getDashboard);
router.get('/analytics', validate(creatorAnalyticsQuerySchema, 'query'), creatorController.getAnalytics);
router.get('/profile', creatorController.getProfile);
router.patch('/profile', validate(updateCreatorProfileSchema), creatorController.updateProfile);
router.get('/reels', validate(creatorReelsQuerySchema, 'query'), creatorController.listReels);
router.post('/reels', validate(createReelSchema), creatorController.createReel);
router.post('/drafts', validate(createDraftSchema), creatorController.createDraft);
router.post('/drafts/:id/publish', creatorController.publishDraft);
router.delete('/reels/:id', creatorController.deleteReel);
router.get('/reels/:id/analytics', creatorController.getReelAnalytics);
router.get('/resources', creatorController.getResources);
router.get('/collaborations', creatorController.getCollaborations);
router.get('/challenges', creatorController.getChallenges);
router.get('/leaderboard', creatorController.getLeaderboard);

export default router;
