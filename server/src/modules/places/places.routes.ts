import { Router } from 'express';
import { placesController } from './places.controller';
import { authenticate, optionalAuth, requireAdmin, requireVendorRole } from '../../middleware/auth';
import { requireContentOps, requirePlatformOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import {
  createPlaceSchema, updatePlaceSchema, updatePlaceStatusSchema, rejectPlaceSchema,
  nearbyQuerySchema, viewportQuerySchema, viewportSearchQuerySchema, statActionSchema,
  clusterQuerySchema, mapQuerySchema, searchQuerySchema,
  addImageSchema, addVideoSchema,
  createOfferSchema, updateOfferSchema,
  createEventSchema, updateEventSchema,
  reviewSchema, vendorUpdatePlaceSchema,
} from './places.validation';
import { statsLimiter, createPlaceLimiter, videoUploadLimiter, placesDiscoveryLimiter } from '../../config/rateLimit';

// ── Public / User Router (mounted at /places) ──
const router = Router();

// Create
router.post('/', authenticate, createPlaceLimiter, validate(createPlaceSchema), placesController.create);

// Discovery
router.get('/', placesDiscoveryLimiter, optionalAuth, placesController.list);
router.get('/search', placesDiscoveryLimiter, optionalAuth, validate(searchQuerySchema, 'query'), placesController.search);
router.get('/viewport', placesDiscoveryLimiter, optionalAuth, validate(viewportQuerySchema, 'query'), placesController.viewport);
router.get('/viewport-search', placesDiscoveryLimiter, optionalAuth, validate(viewportSearchQuerySchema, 'query'), placesController.viewportSearch);
router.get('/nearby', placesDiscoveryLimiter, optionalAuth, validate(nearbyQuerySchema, 'query'), placesController.nearby);
router.get('/clusters', placesDiscoveryLimiter, optionalAuth, validate(clusterQuerySchema, 'query'), placesController.getClusters);
router.get('/map', placesDiscoveryLimiter, optionalAuth, validate(mapQuerySchema, 'query'), placesController.map);
router.get('/map/categories', placesDiscoveryLimiter, optionalAuth, placesController.mapCategories);
router.get('/trending', placesDiscoveryLimiter, placesController.getTrending);
router.get('/hidden-gems', placesDiscoveryLimiter, placesController.getHiddenGems);
router.get('/hotspots', placesDiscoveryLimiter, placesController.getHotspots);

// User submissions
router.get('/mine', authenticate, placesController.getMySubmissions);
router.get('/saved', authenticate, placesController.getSavedPlaces);

// Single place
router.get('/:id', optionalAuth, placesController.getById);
router.get('/:id/nearby-vendors', placesDiscoveryLimiter, placesController.getNearbyVendors);
router.patch('/:id', authenticate, validate(updatePlaceSchema), placesController.update);
router.delete('/:id', authenticate, placesController.delete);

// Stats & Analytics
router.get('/:id/stats', statsLimiter, placesController.getStats);
router.get('/:id/analytics', placesController.getAnalytics);
router.get('/:id/recommendations', placesController.getRecommendations);
router.post('/:id/stats', statsLimiter, optionalAuth, validate(statActionSchema), placesController.recordStat);

// Media
router.get('/:id/images', placesController.getImages);
router.post('/:id/images', authenticate, validate(addImageSchema), placesController.addImage);
router.delete('/:id/images/:imageId', authenticate, placesController.deleteImage);
router.patch('/:id/images/:imageId/primary', authenticate, placesController.setPrimaryImage);
router.get('/:id/videos', placesController.getVideos);
router.post('/:id/videos', authenticate, videoUploadLimiter, validate(addVideoSchema), placesController.addVideo);
router.delete('/:id/videos/:videoId', authenticate, placesController.deleteVideo);
router.get('/:id/reels', placesController.getReels);

// Social
router.post('/:id/save', authenticate, placesController.savePlace);
router.delete('/:id/save', authenticate, placesController.unsavePlace);
router.post('/:id/checkin', authenticate, placesController.checkIn);
// POST remains so a malicious client gets an explicit 403 (not a silent 404).
router.post('/:id/review', authenticate, validate(reviewSchema), placesController.addReview);
router.get('/:id/reviews', placesController.getReviews);
router.post('/:id/reviews/:reviewId/helpful', authenticate, placesController.markReviewHelpful);

// Offers & Events (read-only public)
router.get('/:id/offers', placesController.getOffers);
router.get('/:id/events', placesController.getEvents);

// Status update (admin via places router - legacy)
router.patch('/:id/status', authenticate, requireContentOps, validate(updatePlaceStatusSchema), placesController.updateStatus);

export default router;

// ── Admin Router (mounted at /admin/places) ──
export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

adminRouter.get('/', placesController.adminList);
adminRouter.get('/city-clusters', placesController.adminCityClusters);
adminRouter.get('/pending', placesController.getPendingPlaces);
adminRouter.post('/import', requirePlatformOps, placesController.bulkImport);
adminRouter.post('/canonical', requirePlatformOps, placesController.canonicalUpsert);
adminRouter.post('/canonical/merge', requirePlatformOps, placesController.canonicalMerge);
adminRouter.post('/canonical/duplicates', requirePlatformOps, placesController.canonicalDuplicateCheck);
adminRouter.get('/canonical/resolve', placesController.canonicalResolveSearch);
adminRouter.post('/:id/aliases', requirePlatformOps, placesController.canonicalAddAliases);
adminRouter.delete('/', requirePlatformOps, placesController.adminDeleteAll);
adminRouter.patch('/:id', requireContentOps, validate(updatePlaceSchema), placesController.adminUpdate);
adminRouter.patch('/:id/approve', requireContentOps, placesController.approvePlace);
adminRouter.patch('/:id/reject', requireContentOps, validate(rejectPlaceSchema), placesController.rejectPlace);
adminRouter.delete('/:id', requirePlatformOps, placesController.adminDeletePlace);

// ── Vendor Router (mounted at /vendor/places) ──
export const vendorRouter = Router();
vendorRouter.use(authenticate, requireVendorRole);

vendorRouter.patch('/:id', validate(vendorUpdatePlaceSchema), placesController.vendorUpdate);
vendorRouter.get('/:id/offers', placesController.getOffers);
vendorRouter.post('/:id/offers', validate(createOfferSchema), placesController.addOffer);
vendorRouter.patch('/:id/offers/:offerId', validate(updateOfferSchema), placesController.updateOffer);
vendorRouter.delete('/:id/offers/:offerId', placesController.deleteOffer);
vendorRouter.get('/:id/events', placesController.getEvents);
vendorRouter.post('/:id/events', validate(createEventSchema), placesController.addEvent);
vendorRouter.patch('/:id/events/:eventId', validate(updateEventSchema), placesController.updateEvent);
vendorRouter.delete('/:id/events/:eventId', placesController.deleteEvent);
vendorRouter.post('/:id/images', validate(addImageSchema), placesController.addImage);
vendorRouter.delete('/:id/images/:imageId', placesController.deleteImage);
vendorRouter.post('/:id/videos', videoUploadLimiter, validate(addVideoSchema), placesController.addVideo);
vendorRouter.delete('/:id/videos/:videoId', placesController.deleteVideo);
