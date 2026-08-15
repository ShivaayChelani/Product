import { Router } from 'express';
import { growthAnalyticsController } from './growthAnalytics.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/dashboard', growthAnalyticsController.getDashboard);

export default router;
