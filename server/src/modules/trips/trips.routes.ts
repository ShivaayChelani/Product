import { Router } from 'express';
import { tripsController } from './trips.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requirePlatformOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { aiLimiter } from '../../config/rateLimit';
import {
  createTripSchema, updateTripSchema, addStopSchema, updateStopSchema,
  addCollaboratorSchema, generateItinerarySchema, optimizeRouteSchema,
  aiGenerateSchema, quickAddSchema, replaceStopSchema, visitStopSchema,
} from './trips.validation';

const router = Router();

router.use(authenticate);

// Static/fixed-segment routes must be registered before the dynamic `/:id`
// route below, otherwise Express would treat "history"/"ai-generate"/etc.
// as a trip id and the intended handler would be unreachable.
router.get('/history/completed', tripsController.history);
router.post('/ai-generate', aiLimiter, validate(aiGenerateSchema), tripsController.aiGenerate);
router.post('/quick-add', validate(quickAddSchema), tripsController.quickAdd);

router.post('/', validate(createTripSchema), tripsController.create);
router.get('/', tripsController.list);
router.get('/:id', tripsController.getById);
router.patch('/:id', validate(updateTripSchema), tripsController.update);
router.delete('/:id', tripsController.delete);
router.post('/:id/duplicate', tripsController.duplicate);

router.post('/:id/generate', validate(generateItinerarySchema), tripsController.generateItinerary);
router.post('/:id/optimize', validate(optimizeRouteSchema), tripsController.optimizeRoute);

router.post('/:id/collaborators', validate(addCollaboratorSchema), tripsController.addCollaborator);
router.delete('/:id/collaborators/:userId', tripsController.removeCollaborator);
router.patch('/:id/collaborators/:userId', validate(addCollaboratorSchema), tripsController.updateCollaboratorRole);

router.post('/days/:dayId/stops', validate(addStopSchema), tripsController.addStop);
router.patch('/stops/:stopId', validate(updateStopSchema), tripsController.updateStop);
router.post('/stops/:stopId/replace', validate(replaceStopSchema), tripsController.replaceStop);
router.delete('/stops/:stopId', tripsController.deleteStop);
router.patch('/days/:dayId/stops/reorder', tripsController.reorderStops);

// Active trip management
router.post('/:id/start', tripsController.start);
router.post('/:id/complete', tripsController.complete);
router.get('/:id/progress', tripsController.progress);

// Stop visit/skip
router.post('/stops/:stopId/visit', validate(visitStopSchema), tripsController.markVisited);
router.post('/stops/:stopId/skip', tripsController.markSkipped);

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireAdmin);

adminRouter.get('/all', tripsController.getAllTrips);
adminRouter.get('/stats', tripsController.getTripsStats);
adminRouter.get('/:id', tripsController.adminGetById);
adminRouter.delete('/:id', requirePlatformOps, tripsController.adminDelete);

export default router;
