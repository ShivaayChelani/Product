import { Router } from 'express';
import { optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { directionsLimiter } from '../../config/rateLimit';
import { directionsController } from './directions.controller';
import { directionsBodySchema } from './directions.validation';

const router = Router();

router.post(
  '/directions',
  directionsLimiter,
  optionalAuth,
  validate(directionsBodySchema),
  directionsController.driving,
);

export default router;
