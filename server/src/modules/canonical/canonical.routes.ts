import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requirePlatformOps } from '../../middleware/adminCapabilities';
import { canonicalController } from './canonical.controller';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/status', canonicalController.platformStatus);
router.get('/metrics/dashboard', canonicalController.dashboardMetrics);
router.get('/resolve', canonicalController.resolvePlace);
router.get('/search/hybrid', canonicalController.hybridSearch);
router.get('/duplicates', canonicalController.duplicateCandidates);
router.post('/duplicates/score', requirePlatformOps, canonicalController.scorePair);
router.post('/duplicates/scan', requirePlatformOps, canonicalController.runDuplicateScan);
router.post('/duplicates/auto-merge', requirePlatformOps, canonicalController.autoMergeCandidates);
router.get('/quality-report', canonicalController.qualityReport);
router.post('/duplicates/:id/dismiss', requirePlatformOps, canonicalController.dismissDuplicate);
router.post('/merge', requirePlatformOps, canonicalController.mergePlaces);
router.get('/verification-queue', canonicalController.verificationQueue);
router.get('/merge-logs', canonicalController.mergeLogs);
router.post('/boundaries/validate-batch', requirePlatformOps, canonicalController.validateBoundariesBatch);
router.post('/images/:id/pipeline', requirePlatformOps, canonicalController.runImagePipeline);
router.post('/images/:id/verify-license', requirePlatformOps, canonicalController.verifyImageLicense);
router.post('/places/bulk-verify', requirePlatformOps, canonicalController.bulkVerifyPlaces);
router.post('/places/:id/verify', requirePlatformOps, canonicalController.verifyPlace);
router.get('/places/:id/versions', canonicalController.listPlaceVersions);
router.post('/places/:id/rollback', requirePlatformOps, canonicalController.rollbackPlaceVersion);

export default router;
