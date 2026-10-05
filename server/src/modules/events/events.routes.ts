import { Router } from 'express';
import { eventsController } from './events.controller';
import { authenticate, optionalAuth, requireAdmin } from '../../middleware/auth';
import { requireContentOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { createEventLimiter, eventMapLimiter, updateEventLimiter } from '../../config/rateLimit';
import {
  adminEventReportsQuerySchema,
  adminListEventsQuerySchema,
  approveEventSchema,
  cancelEventSchema,
  createEventSchema,
  eventListQuerySchema,
  eventMapQuerySchema,
  featureEventSchema,
  featuredEventsQuerySchema,
  nearbyEventsQuerySchema,
  rejectEventSchema,
  reportEventSchema,
  resolveEventReportSchema,
  unpublishEventSchema,
  updateEventSchemaWithGuard,
} from './events.validation';

/**
 * Community Events — public router, mounted at `/api/v1/events`.
 *
 * Route ordering matters here: `/map`, `/nearby` and `/featured` are declared
 * BEFORE `/:idOrSlug`, otherwise Express matches "map" as an id and every map
 * request 404s on a slug lookup.
 */
const router = Router();

// ── Discovery (public, rate limited) ─────────────────────────────────────────
router.get(
  '/map',
  eventMapLimiter,
  validate(eventMapQuerySchema, 'query'),
  eventsController.getMapEvents,
);
router.get(
  '/nearby',
  eventMapLimiter,
  validate(nearbyEventsQuerySchema, 'query'),
  eventsController.getNearby,
);
router.get('/featured', validate(featuredEventsQuerySchema, 'query'), eventsController.getFeatured);

/**
 * Reels linked to one event.
 *
 * Declared AFTER `/featured` and before `/:idOrSlug` so the literal segment
 * wins; Express would otherwise treat `featured` as an `:idOrSlug` value.
 */
router.get('/:idOrSlug/reels', optionalAuth, eventsController.listReels);

// ── List / detail ────────────────────────────────────────────────────────────
// `optionalAuth` (not `authenticate`) so an anonymous visitor sees the public
// projection while the submitter can still see their own PENDING/REJECTED
// event, and a content-ops admin can see the diagnosis for anything.
router.get('/', optionalAuth, validate(eventListQuerySchema, 'query'), eventsController.list);
router.get('/:idOrSlug', optionalAuth, eventsController.getByIdOrSlug);

// ── Submission and ownership (any authenticated user, free) ──────────────────
router.post('/', authenticate, createEventLimiter, validate(createEventSchema), eventsController.create);
router.patch(
  '/:id',
  authenticate,
  updateEventLimiter,
  validate(updateEventSchemaWithGuard),
  eventsController.update,
);
router.delete('/:id', authenticate, updateEventLimiter, eventsController.remove);
router.post(
  '/:id/cancel',
  authenticate,
  updateEventLimiter,
  validate(cancelEventSchema),
  eventsController.cancel,
);
router.post('/:id/report', authenticate, validate(reportEventSchema), eventsController.report);

// ── Admin ────────────────────────────────────────────────────────────────────
// Mirrors the hidden-gems split: an exported `adminRouter` mounted under
// /admin/events, with `requireContentOps` on every state-changing action.
export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

adminRouter.get('/', validate(adminListEventsQuerySchema, 'query'), eventsController.adminList);
adminRouter.get('/reports', validate(adminEventReportsQuerySchema, 'query'), eventsController.listReports);
adminRouter.patch(
  '/reports/:reportId/resolve',
  requireContentOps,
  validate(resolveEventReportSchema),
  eventsController.resolveReport,
);
adminRouter.get('/:id/visibility', eventsController.visibilityDiagnosis);
/**
 * Duplicate evidence. Capability-guarded rather than `requireAdmin` because it
 * runs a raw PostGIS scan per call and the moderation queue fires it on every
 * drawer open — read-only admins do not need it.
 */
adminRouter.get('/:id/duplicates', requireContentOps, eventsController.duplicates);
adminRouter.patch(
  '/:id/approve',
  requireContentOps,
  validate(approveEventSchema),
  eventsController.approve,
);
adminRouter.patch(
  '/:id/reject',
  requireContentOps,
  validate(rejectEventSchema),
  eventsController.reject,
);
adminRouter.patch(
  '/:id/unpublish',
  requireContentOps,
  validate(unpublishEventSchema),
  eventsController.unpublish,
);
adminRouter.patch(
  '/:id/feature',
  requireContentOps,
  validate(featureEventSchema),
  eventsController.setFeatured,
);

export default router;