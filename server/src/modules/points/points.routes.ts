import { Router } from 'express';
import { pointsController } from './points.controller';
import { authenticate } from '../../middleware/auth';
import { requireFinanceOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { earnPointsSchema } from './points.validation';

const router = Router();

router.get('/balance', authenticate, pointsController.getBalance);
router.post('/earn', authenticate, requireFinanceOps, validate(earnPointsSchema), pointsController.earn);
router.get('/history', authenticate, pointsController.history);

export default router;
