import { Router } from 'express';
import { revenueAnalyticsController } from './revenueAnalytics.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/dashboard', revenueAnalyticsController.getDashboard);
router.get('/export/csv', revenueAnalyticsController.exportCSV);

export default router;
