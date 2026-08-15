import { Router } from 'express';
import { cityAnalyticsController } from './cityAnalytics.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/dashboard', cityAnalyticsController.getDashboard);

export default router;
