import { Router } from 'express';
import { aiController } from './ai.controller';
import { validate } from '../../middleware/validate';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { aiLimiter } from '../../config/rateLimit';
import { recQuerySchema, similarQuerySchema, userVectorQuerySchema, tripPlanQuerySchema, discoveryQuerySchema, structuredDiscoverySchema } from './ai.validation';

const router = Router();

router.use(aiLimiter);

router.get('/recommendations', optionalAuth, validate(recQuerySchema, 'query'), aiController.getRecommendations);
router.get('/similar/:id', validate(similarQuerySchema, 'query'), aiController.getSimilar);
router.get('/user-vector/:userId', authenticate, validate(userVectorQuerySchema, 'query'), aiController.getUserVector);
router.get('/trip-planner', optionalAuth, validate(tripPlanQuerySchema, 'query'), aiController.planTrip);
router.get('/discover', validate(discoveryQuerySchema, 'query'), aiController.discover);
router.get('/discover/structured', validate(structuredDiscoverySchema, 'query'), aiController.structuredDiscovery);

export default router;
