import { Router } from 'express';
import { auditController } from './audit.controller';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditListQuerySchema, auditExportQuerySchema } from './audit.validation';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', validate(auditListQuerySchema, 'query'), auditController.list);
router.get('/actions', auditController.getActions);
router.get('/entity-types', auditController.getEntityTypes);
router.get('/export/csv', validate(auditExportQuerySchema, 'query'), auditController.exportCSV);

export default router;
