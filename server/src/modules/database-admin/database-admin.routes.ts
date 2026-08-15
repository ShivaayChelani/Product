import { Router } from 'express';
import { authenticate, requireAdmin, requireRoles } from '../../middleware/auth';
import { databaseAdminController, DATABASE_OPS_ROLES } from './database-admin.controller';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/overview', databaseAdminController.overview);
router.get('/tables', databaseAdminController.tableStats);
router.get('/quality-report', databaseAdminController.qualityReport);
router.get('/data-integrity', databaseAdminController.dataIntegrityStatus);

// Database Explorer routes (read-only)
router.get('/explorer/tables', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.explorerTables);
router.get('/explorer/tables/:table/schema', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.explorerTableSchema);
router.get('/explorer/tables/:table/records', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.explorerTableRecords);

router.post(
  '/ops/ensure-extensions',
  requireRoles(DATABASE_OPS_ROLES),
  databaseAdminController.ensureExtensions,
);
router.post('/ops/startup-seed', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.startupSeed);
router.post('/ops/settings-seed', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.settingsSeed);
router.post('/ops/duplicate-scan', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.duplicateScan);
router.post('/ops/auto-merge', requireRoles(DATABASE_OPS_ROLES), databaseAdminController.autoMerge);
router.post(
  '/ops/data-integrity',
  requireRoles(DATABASE_OPS_ROLES),
  databaseAdminController.runDataIntegrityPhase,
);

export default router;
