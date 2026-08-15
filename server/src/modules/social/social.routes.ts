import { Router } from 'express';
import { socialController } from './social.controller';
import { authenticate, optionalAuth, requireAdmin, requireCreatorRole } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { usernameCheckLimiter } from '../../config/rateLimit';
import {
  applyCreatorSchema,
  updateCreatorProfileSchema,
  createReelSchema,
  updateReelSchema,
  createCommentSchema,
  verifyCreatorSchema,
  createCollectionSchema,
  updateCollectionSchema,
  addPlaceToCollectionSchema,
} from './social.validation';

const router = Router();

// ── Creators Endpoints ──
router.post('/creators/apply', authenticate, validate(applyCreatorSchema), socialController.applyCreator);
router.patch('/creators/profile', authenticate, requireCreatorRole, validate(updateCreatorProfileSchema), socialController.updateProfile);
router.get('/creators/me/dashboard', authenticate, requireCreatorRole, socialController.getCreatorDashboard);
router.get('/creators/me/analytics', authenticate, requireCreatorRole, socialController.getCreatorAnalytics);
router.get('/creators/me/reels', authenticate, requireCreatorRole, socialController.listMyReels);
router.get('/creators/leaderboard', optionalAuth, socialController.getCreatorLeaderboard);
router.get('/creators/check-username', authenticate, usernameCheckLimiter, socialController.checkUsername);
router.get('/creators/:username', optionalAuth, socialController.getCreatorProfile);
router.post('/creators/:id/follow', authenticate, socialController.followCreator);
router.delete('/creators/:id/follow', authenticate, socialController.unfollowCreator);

// ── Reels Endpoints ──
router.post('/reels', authenticate, requireCreatorRole, validate(createReelSchema), socialController.createReel);
router.get('/reels', optionalAuth, socialController.listReels);
router.get('/reels/:id', optionalAuth, socialController.getReelById);
router.patch('/reels/:id/views', socialController.incrementViews);
router.patch('/reels/:id/shares', socialController.incrementShares);
router.patch('/reels/:id', authenticate, requireCreatorRole, validate(updateReelSchema), socialController.updateReel);
router.delete('/reels/:id', authenticate, requireCreatorRole, socialController.deleteOwnReel);

// Likes
router.post('/reels/:id/like', authenticate, socialController.likeReel);
router.delete('/reels/:id/like', authenticate, socialController.unlikeReel);

// Saves
router.post('/reels/:id/save', authenticate, socialController.saveReel);
router.delete('/reels/:id/save', authenticate, socialController.unsaveReel);

// Comments
router.post('/reels/:id/comments', authenticate, validate(createCommentSchema), socialController.addComment);
router.get('/reels/:id/comments', optionalAuth, socialController.listComments);

// Reports (uses ReelReport model)
router.post('/reels/:id/report', authenticate, socialController.reportReel);
router.get('/admin/reel-reports', authenticate, requireAdmin, socialController.listReelReports);

// ── Collections Endpoints ──
router.post('/collections', authenticate, validate(createCollectionSchema), socialController.createCollection);
router.get('/collections', authenticate, socialController.listCollections);
router.get('/collections/:id', authenticate, socialController.getCollection);
router.put('/collections/:id', authenticate, validate(updateCollectionSchema), socialController.updateCollection);
router.delete('/collections/:id', authenticate, socialController.deleteCollection);
router.post('/collections/:id/places', authenticate, validate(addPlaceToCollectionSchema), socialController.addPlaceToCollection);
router.delete('/collections/:id/places/:placeId', authenticate, socialController.removePlaceFromCollection);

// ── Admin Moderation Endpoints ──
router.get('/admin/creators', authenticate, requireAdmin, socialController.listCreatorApplications);
router.patch('/admin/creators/:id/verify', authenticate, requireContentOps, validate(verifyCreatorSchema), socialController.verifyCreator);
router.get('/admin/reels', authenticate, requireAdmin, socialController.listAllReels);
router.delete('/admin/reels/:id', authenticate, requireContentOps, socialController.deleteReel);
router.patch('/admin/reels/:id/feature', authenticate, requireContentOps, socialController.toggleFeatureReel);

export default router;
