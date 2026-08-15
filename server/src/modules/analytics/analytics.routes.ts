import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { placesAnalyticsQuerySchema } from './analytics.validation';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard', analyticsController.getDashboard);
router.get('/places', validate(placesAnalyticsQuerySchema, 'query'), analyticsController.getPlacesAnalytics);
router.get('/users', analyticsController.getUsersAnalytics);

export default router;
