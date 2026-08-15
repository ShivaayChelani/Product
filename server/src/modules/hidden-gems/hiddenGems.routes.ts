import { Router } from 'express';
import { hiddenGemsController } from './hiddenGems.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import {
  createHiddenGemSchema,
  updateHiddenGemSchema,
  approveHiddenGemSchema,
  rejectHiddenGemSchema,
  mergeHiddenGemSchema,
  listHiddenGemsSchema,
} from './hiddenGems.validation';
import { createHiddenGemLimiter } from '../../config/rateLimit';

const router = Router();

router.post('/', authenticate, createHiddenGemLimiter, validate(createHiddenGemSchema), hiddenGemsController.create);
router.get('/', authenticate, validate(listHiddenGemsSchema, 'query'), hiddenGemsController.list);
router.get('/:id', authenticate, hiddenGemsController.getById);
router.patch('/:id', authenticate, validate(updateHiddenGemSchema), hiddenGemsController.updatePending);
router.delete('/:id', authenticate, hiddenGemsController.deletePending);

export default router;

export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.patch('/:id/approve', requireContentOps, validate(approveHiddenGemSchema), hiddenGemsController.approve);
adminRouter.patch('/:id/reject', requireContentOps, validate(rejectHiddenGemSchema), hiddenGemsController.reject);
adminRouter.get('/:id/duplicates', hiddenGemsController.findDuplicates);
adminRouter.post('/:id/merge', requireContentOps, validate(mergeHiddenGemSchema), hiddenGemsController.mergeContribution);
adminRouter.patch('/:id/unpublish', requireContentOps, validate(rejectHiddenGemSchema), hiddenGemsController.unpublish);
