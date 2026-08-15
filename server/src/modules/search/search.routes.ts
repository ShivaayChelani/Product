import { Router } from 'express';
import { searchController } from './search.controller';
import { validate } from '../../middleware/validate';
import { optionalAuth, authenticate, requireAdmin } from '../../middleware/auth';
import { universalSearchSchema } from './search.validation';

const router = Router();

router.get('/universal', optionalAuth, validate(universalSearchSchema, 'query'), searchController.universalSearch);
router.get('/trending', searchController.getTrending);
router.get('/admin/analytics', authenticate, requireAdmin, searchController.getAnalytics);
router.get('/admin/global', authenticate, requireAdmin, searchController.adminGlobalSearch);

export default router;
