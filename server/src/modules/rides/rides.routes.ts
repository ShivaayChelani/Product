import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate';
import { optionalAuth } from '../../middleware/auth';
import { rideOpenBodySchema, rideProvidersQuerySchema } from './rides.validation';
import { getRideProviders, postRideOpen } from './rides.controller';

const router = Router();

const ridesLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many ride requests. Please try again shortly.' },
});

router.use(ridesLimiter);
router.use(optionalAuth);

router.get('/providers', validate(rideProvidersQuerySchema, 'query'), getRideProviders);
router.post('/open', validate(rideOpenBodySchema, 'body'), postRideOpen);

export default router;
