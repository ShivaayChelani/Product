import { Router } from 'express';
import { syncController } from './sync.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { syncBatchSchema } from './sync.validation';

const router = Router();

router.use(authenticate);

router.post('/batch', validate(syncBatchSchema), syncController.processBatch);
router.get('/pending', syncController.getPending);
router.get('/status', syncController.getUserStatus);
router.get('/admin/all', requireAdmin, syncController.getAllItems);
router.get('/admin/stats', requireAdmin, syncController.getGlobalStats);

export default router;
