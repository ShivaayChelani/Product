import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin, requireCreatorRole, requireVendorRole } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { collaborationsController } from './collaborations.controller';
import {
  adminResolveSchema,
  adminSuspendSchema,
  cancelCollaborationSchema,
  createCollaborationSchema,
  listCollaborationsQuerySchema,
  rejectCollaborationSchema,
  rejectReelSchema,
  revisionRequestSchema,
  submitCollaborationReelSchema,
} from './collaborations.validation';

const router = Router();

const collabRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many collaboration requests. Try again later.' },
});

router.use(authenticate);

// Vendor routes
router.post(
  '/',
  requireVendorRole,
  collabRequestLimiter,
  validate(createCollaborationSchema),
  collaborationsController.create,
);
router.get(
  '/vendor',
  requireVendorRole,
  validate(listCollaborationsQuerySchema, 'query'),
  collaborationsController.listVendor,
);
router.get('/vendor/can-collaborate/:creatorProfileId', requireVendorRole, collaborationsController.canCollaborate);
router.post('/:id/cancel', requireVendorRole, validate(cancelCollaborationSchema), collaborationsController.cancel);
router.post('/:id/approve-reel', requireVendorRole, collaborationsController.approveReel);
router.post('/:id/request-revision', requireVendorRole, validate(revisionRequestSchema), collaborationsController.requestRevision);
router.post('/:id/reject-reel', requireVendorRole, validate(rejectReelSchema), collaborationsController.rejectReel);

// Creator routes
router.get(
  '/creator',
  requireCreatorRole,
  validate(listCollaborationsQuerySchema, 'query'),
  collaborationsController.listCreator,
);
router.get('/creator/upload-eligible', requireCreatorRole, collaborationsController.listUploadEligible);
router.post('/:id/accept', requireCreatorRole, collaborationsController.accept);
router.post('/:id/reject', requireCreatorRole, validate(rejectCollaborationSchema), collaborationsController.reject);
router.post(
  '/:id/submit-reel',
  requireCreatorRole,
  validate(submitCollaborationReelSchema),
  collaborationsController.submitReel,
);

// Shared party routes
router.get('/:id', collaborationsController.getById);
router.post('/:id/in-progress', collaborationsController.markInProgress);

// Admin routes
const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.get('/', validate(listCollaborationsQuerySchema, 'query'), collaborationsController.adminList);
adminRouter.get('/analytics/summary', collaborationsController.adminAnalytics);
adminRouter.post('/:id/suspend', requireContentOps, validate(adminSuspendSchema), collaborationsController.adminSuspend);
adminRouter.post('/:id/resolve', requireContentOps, validate(adminResolveSchema), collaborationsController.adminResolve);

export default router;
export { adminRouter as collaborationsAdminRouter };
