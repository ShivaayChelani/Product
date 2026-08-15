import { Router } from 'express';
import { userPlaceImagesController } from './userPlaceImages.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { contributeImageSchema, rejectImageSchema, listImagesSchema } from './userPlaceImages.validation';

const router = Router();

router.post('/places/:id/contribute-image', authenticate, validate(contributeImageSchema), userPlaceImagesController.contribute);
router.get('/places/:id/contribution-status', authenticate, userPlaceImagesController.getContributionStatus);

export default router;

export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.get('/', validate(listImagesSchema, 'query'), userPlaceImagesController.listAdmin);
adminRouter.patch('/:id/approve', requireContentOps, userPlaceImagesController.approve);
adminRouter.patch('/:id/reject', requireContentOps, validate(rejectImageSchema), userPlaceImagesController.reject);
