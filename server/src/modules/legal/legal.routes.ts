import { Router } from 'express';
import { legalController } from './legal.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requirePlatformOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import {
  legalTypeParamSchema,
  createDocumentSchema,
  createVersionSchema,
  updateVersionSchema,
  rollbackVersionSchema,
} from './legal.validation';

// ── Public: mobile app reads only the latest published version, never raw drafts ──
const router = Router();

router.get('/types', legalController.listTypes);
router.get('/:type', validate(legalTypeParamSchema, 'params'), legalController.getPublished);

export default router;

// ── Admin: full CMS workflow (create/edit/draft/preview/publish/archive/rollback) ──
const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

adminRouter.get('/documents', legalController.listDocuments);
adminRouter.post('/documents', requirePlatformOps, validate(createDocumentSchema), legalController.createDocument);
adminRouter.get('/documents/:id', legalController.getDocument);
adminRouter.get('/documents/:id/versions', legalController.listVersions);
adminRouter.post('/documents/:id/versions', requirePlatformOps, validate(createVersionSchema), legalController.createVersion);

adminRouter.get('/versions/:versionId', legalController.getVersion);
adminRouter.patch('/versions/:versionId', requirePlatformOps, validate(updateVersionSchema), legalController.updateVersion);
adminRouter.post('/versions/:versionId/publish', requirePlatformOps, legalController.publishVersion);
adminRouter.post('/versions/:versionId/archive', requirePlatformOps, legalController.archiveVersion);
adminRouter.post('/versions/:versionId/rollback', requirePlatformOps, validate(rollbackVersionSchema), legalController.rollbackVersion);

export { adminRouter };
