import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { adminPanelController } from './admin-panel.controller';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

// Taxonomy (categories & tags derived from Place data) — mutate = content ops
router.get('/system/categories', adminPanelController.listCategories);
router.get('/system/categories/:id', adminPanelController.getCategory);
router.patch('/system/categories/:id', requireContentOps, adminPanelController.updateCategory);
router.delete('/system/categories/:id', requireContentOps, adminPanelController.deleteCategory);

router.get('/system/tags', adminPanelController.listTags);
router.get('/system/tags/:id', adminPanelController.getTag);
router.patch('/system/tags/:id', requireContentOps, adminPanelController.updateTag);
router.delete('/system/tags/:id', requireContentOps, adminPanelController.deleteTag);

// Media library
router.get('/media', adminPanelController.listMedia);
router.delete('/media/:type/:id', requireContentOps, adminPanelController.deleteMedia);

// Reviews moderation
router.get('/reviews', adminPanelController.listReviews);
router.get('/reviews/:id', adminPanelController.getReview);
router.patch('/reviews/:id/status', requireContentOps, adminPanelController.updateReviewStatus);

// Unified moderation queue
router.get('/moderation/incidents', adminPanelController.listIncidents);
router.get('/moderation/incidents/:id', adminPanelController.getIncident);
router.patch('/moderation/incidents/:id/status', requireContentOps, adminPanelController.updateIncidentStatus);
router.patch('/moderation/incidents/:id/assign', requireContentOps, adminPanelController.assignIncident);

// Roles & permissions (read-only; assignment via /users/:id/role)
router.get('/roles', adminPanelController.listRoles);
router.get('/roles/:id', adminPanelController.getRole);

export default router;
