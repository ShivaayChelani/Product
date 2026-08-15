import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/generate', reportsController.generate);

export default router;
