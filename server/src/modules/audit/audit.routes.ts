import { Router } from 'express';
import { auditController } from './audit.controller';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/', auditController.list);
router.get('/actions', auditController.getActions);
router.get('/entity-types', auditController.getEntityTypes);
router.get('/export/csv', auditController.exportCSV);

export default router;
