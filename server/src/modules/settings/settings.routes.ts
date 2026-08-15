import { Router } from 'express';
import { settingsController } from './settings.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requirePlatformOps } from '../../middleware/adminCapabilities';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', settingsController.list);
router.get('/categories', settingsController.getCategories);
router.get('/category/:category', settingsController.getByCategory);
router.patch('/:key', requirePlatformOps, settingsController.update);
router.post('/bulk-update', requirePlatformOps, settingsController.bulkUpdate);
router.post('/reset-defaults', requirePlatformOps, settingsController.resetDefaults);
router.post('/seed', requirePlatformOps, settingsController.seedDefaults);

export default router;
