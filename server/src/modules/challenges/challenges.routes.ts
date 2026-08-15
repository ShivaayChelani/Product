import { Router } from 'express';
import { challengesController } from './challenges.controller';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { challengeCompleteLimiter } from '../../config/rateLimit';
import {
  createChallengeSchema,
  updateChallengeStatusSchema,
  completeChallengeSchema,
} from './challenges.validation';

const router = Router();

// Public / Optional Auth routes
router.get('/', optionalAuth, challengesController.listApproved);
router.get('/creators/leaderboard', optionalAuth, challengesController.getLeaderboard);
router.get('/:id', optionalAuth, challengesController.getById);

// Authenticated user routes
router.get('/user/mine', authenticate, challengesController.listMyCreated);
router.post('/', authenticate, validate(createChallengeSchema), challengesController.create);
router.post('/:id/complete', authenticate, challengeCompleteLimiter, validate(completeChallengeSchema), challengesController.complete);

// Admin only routes
router.patch('/:id/status', authenticate, requireContentOps, validate(updateChallengeStatusSchema), challengesController.updateStatus);
router.patch('/:id/featured', authenticate, requireContentOps, challengesController.toggleFeatured);
router.patch('/:id/trending', authenticate, requireContentOps, challengesController.toggleTrending);

export default router;
