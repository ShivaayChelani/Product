import { Router } from 'express';
import multer from 'multer';
import { riddlesController } from './riddles.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { submitAnswerSchema, locationQuerySchema } from './riddles.validation';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ──────────────── User Router (mounted at /riddles) ────────────────
const router = Router();

// Get the current hunt available in the user's GPS city
router.get('/active/current-location', authenticate, validate(locationQuerySchema, 'query'), riddlesController.getCurrentCityHunt);

// Get my progress
router.get('/my-progress', authenticate, riddlesController.getMyHuntProgress);

// Get hunt details
router.get('/hunt/:id', authenticate, validate(locationQuerySchema, 'query'), riddlesController.getHuntDetails);

// Get riddle details
router.get('/hunt/:huntId/riddle/:riddleId', authenticate, validate(locationQuerySchema, 'query'), riddlesController.getRiddle);

// Submit an answer
router.post(
  '/hunt/:huntId/riddle/:riddleId/answer',
  authenticate,
  validate(locationQuerySchema, 'query'),
  validate(submitAnswerSchema),
  riddlesController.submitAnswer
);

export default router;

// ──────────────── Admin Router (mounted at /admin/riddles) ────────────────
export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

// Excel Bulk Import
adminRouter.post('/bulk-import/validate', requireContentOps, upload.single('file'), riddlesController.bulkImportValidate);
adminRouter.post('/bulk-import/confirm', requireContentOps, riddlesController.bulkImportConfirm);

// Dashboard
adminRouter.get('/overview', riddlesController.getOverview);
adminRouter.get('/cities', riddlesController.getCities);
adminRouter.get('/import-history', riddlesController.listImportHistory);

// Hunts & Riddles listing
adminRouter.get('/hunts', riddlesController.listAllHunts);
adminRouter.get('/riddles', riddlesController.listAllRiddles);

// Delete hunt
adminRouter.delete('/hunts/:id', requireContentOps, riddlesController.deleteHunt);