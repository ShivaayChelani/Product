import { Router } from 'express';
import { riddlesController } from './riddles.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import {
  createRiddleSchema,
  updateRiddleSchema,
  submitRiddleSchema,
  rejectRiddleSchema,
} from './riddles.validation';

// ──────────────── User Router (mounted at /riddles) ────────────────
const router = Router();

// Get active riddles based on current GPS location
router.get('/active/current-location', authenticate, riddlesController.getActiveForCurrentLocation);

// Get all my past submissions (with riddle info)
router.get('/my-submissions', authenticate, riddlesController.getMySubmissions);

// Get my submission status for a specific riddle
router.get('/:id/my-submission', authenticate, riddlesController.getMySubmission);

// Get a specific riddle detail (secured by location)
router.get('/:id', authenticate, riddlesController.getByIdUser);

// Get riddle hint (secured by location)
router.post('/:id/hint', authenticate, riddlesController.getHint);

// Validate check-in distance
router.post('/:id/validate-checkin', authenticate, riddlesController.validateCheckIn);

// Submit an answer (photo) for a riddle
router.post('/:id/submit', authenticate, validate(submitRiddleSchema), riddlesController.submit);

export default router;

import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

// ──────────────── Admin Router (mounted at /admin/riddles) ────────────────
export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

// Excel Bulk Import
adminRouter.post('/bulk-import/validate', requireContentOps, upload.single('file'), riddlesController.bulkImportValidate);
adminRouter.post('/bulk-import/confirm', requireContentOps, riddlesController.bulkImportConfirm);

// Riddle CRUD
adminRouter.get('/cities/summary', riddlesController.getCitySummary);
adminRouter.get('/', riddlesController.list);
adminRouter.get('/submissions/pending', riddlesController.getAllPendingSubmissions);
adminRouter.get('/:id', riddlesController.getById);
adminRouter.post('/', requireContentOps, validate(createRiddleSchema), riddlesController.create);
adminRouter.patch('/:id', requireContentOps, validate(updateRiddleSchema), riddlesController.update);
adminRouter.delete('/:id', requireContentOps, riddlesController.delete);

// Submission review
adminRouter.get('/:id/submissions', riddlesController.getSubmissions);
adminRouter.post('/submissions/:submissionId/approve', requireContentOps, riddlesController.approve);
adminRouter.post('/submissions/:submissionId/reject', requireContentOps, validate(rejectRiddleSchema), riddlesController.reject);
