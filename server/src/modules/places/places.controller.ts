import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { placesService } from './places.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response';
import { hasRole } from '../../middleware/auth';

export const placesController = {
  create: catchAsync(async (req: any, res: Response) => {
    const isAdmin = hasRole(req.user, Role.ADMIN);
    const place = await placesService.create(req.body, req.user.id, { isAdmin });
    sendCreated(
      res,
      place,
      isAdmin ? 'Place created and published' : 'Place submitted for review',
    );
  }),

  list: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.list(req.query as any, {
      isAdmin: hasRole(req.user, Role.ADMIN),
      userId: req.user?.id,
    });
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  adminList: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.adminList(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  adminCityClusters: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.adminCityClusters(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.getById(req.params.id as string, {
      isAdmin: hasRole(req.user, Role.ADMIN),
      userId: req.user?.id,
    });
    sendSuccess(res, place);
  }),

  update: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.update(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, place, { message: 'Place updated' });
  }),

  delete: catchAsync(async (req: any, res: Response) => {
    await placesService.delete(req.params.id as string, req.user.id);
    sendNoContent(res);
  }),

  updateStatus: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.updateStatus(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, place, { message: `Place ${req.body.status.toLowerCase()} successfully` });
  }),

  getMySubmissions: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.getMySubmissions(req.user.id, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  search: catchAsync(async (req: Request, res: Response) => {
    const result = await placesService.search(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  nearby: catchAsync(async (req: Request, res: Response) => {
    const result = await placesService.nearby(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  viewport: catchAsync(async (req: Request, res: Response) => {
    const places = await placesService.viewport(req.query as any);
    sendSuccess(res, places, { message: 'Viewport places retrieved' });
  }),

  viewportSearch: catchAsync(async (req: Request, res: Response) => {
    const places = await placesService.viewportSearch(req.query as any);
    sendSuccess(res, places, { message: 'Viewport search results' });
  }),

  getClusters: catchAsync(async (req: Request, res: Response) => {
    const clusters = await placesService.getClusters(req.query as any);
    sendSuccess(res, clusters, { message: 'Map clusters generated' });
  }),

  map: catchAsync(async (req: Request, res: Response) => {
    const payload = await placesService.map(req.query as any);
    sendSuccess(res, payload, { message: 'Map places retrieved' });
  }),

  mapCategories: catchAsync(async (_req: Request, res: Response) => {
    const categories = await placesService.mapCategories();
    sendSuccess(res, categories, { message: 'Map categories retrieved' });
  }),

  getTrending: catchAsync(async (_req: Request, res: Response) => {
    const places = await placesService.getTrending();
    sendSuccess(res, places);
  }),

  getHiddenGems: catchAsync(async (_req: Request, res: Response) => {
    const places = await placesService.getHiddenGems();
    sendSuccess(res, places);
  }),

  getRecommendations: catchAsync(async (req: Request, res: Response) => {
    const places = await placesService.getRecommendations(req.params.id as string);
    sendSuccess(res, places, { message: 'Recommendations generated' });
  }),

  getPendingPlaces: catchAsync(async (req: Request, res: Response) => {
    const result = await placesService.getPendingPlaces(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  approvePlace: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.updateStatus(req.params.id as string, { status: 'APPROVED' }, req.user.id);
    sendSuccess(res, place, { message: 'Place approved successfully' });
  }),

  rejectPlace: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.updateStatus(
      req.params.id as string,
      { status: 'REJECTED', reason: req.body?.reason },
      req.user.id,
    );
    sendSuccess(res, place, { message: 'Place rejected' });
  }),

  adminUpdate: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.adminUpdate(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, place, { message: 'Place updated by admin' });
  }),

  adminDeletePlace: catchAsync(async (req: any, res: Response) => {
    await placesService.delete(req.params.id as string, req.user.id);
    sendNoContent(res);
  }),

  adminDeleteAll: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.adminDeleteAll(req.user.id);
    sendSuccess(res, result, { message: `Deleted ${result.deletedCount} places` });
  }),

  bulkImport: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.bulkImport(req.body.places, {
      overwrite: req.body.overwrite,
      source: req.body.source || 'ADMIN',
      status: req.body.status || 'APPROVED',
      userId: req.user.id,
    });
    sendSuccess(res, result, { message: `Import complete: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors` });
  }),

  canonicalUpsert: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.upsertCanonical(req.body, req.user.id);
    sendCreated(res, place, 'Canonical place created');
  }),

  canonicalMerge: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.mergeIntoCanonical({
      canonicalPlaceId: req.body.canonicalPlaceId,
      duplicatePlaceIds: req.body.duplicatePlaceIds,
      mergedById: req.user.id,
      reason: req.body.reason,
    });
    sendSuccess(res, result, { message: 'Places merged into canonical record' });
  }),

  canonicalAddAliases: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.addAliases(req.params.id as string, req.body.aliases);
    sendSuccess(res, result, { message: 'Aliases updated' });
  }),

  canonicalDuplicateCheck: catchAsync(async (req: any, res: Response) => {
    const candidates = await placesService.findDuplicateCandidates(req.body);
    sendSuccess(res, candidates);
  }),

  canonicalResolveSearch: catchAsync(async (req: Request, res: Response) => {
    const q = String(req.query.q || '');
    const hits = await placesService.searchByAliasOrName(q, 15);
    sendSuccess(res, hits);
  }),

  vendorUpdate: catchAsync(async (req: any, res: Response) => {
    const place = await placesService.vendorUpdate(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, place, { message: 'Place updated' });
  }),

  addOffer: catchAsync(async (req: any, res: Response) => {
    const offer = await placesService.addOffer(req.params.id as string, req.body, req.user.id);
    sendCreated(res, offer, 'Offer created');
  }),

  updateOffer: catchAsync(async (req: any, res: Response) => {
    const offer = await placesService.updateOffer(req.params.offerId as string, req.body, req.user.id);
    sendSuccess(res, offer, { message: 'Offer updated' });
  }),

  deleteOffer: catchAsync(async (req: any, res: Response) => {
    await placesService.deleteOffer(req.params.offerId as string, req.user.id);
    sendNoContent(res);
  }),

  getOffers: catchAsync(async (req: Request, res: Response) => {
    const offers = await placesService.getOffers(req.params.id as string);
    sendSuccess(res, offers);
  }),

  addEvent: catchAsync(async (req: any, res: Response) => {
    const event = await placesService.addEvent(req.params.id as string, req.body, req.user.id);
    sendCreated(res, event, 'Event created');
  }),

  updateEvent: catchAsync(async (req: any, res: Response) => {
    const event = await placesService.updateEvent(req.params.eventId as string, req.body, req.user.id);
    sendSuccess(res, event, { message: 'Event updated' });
  }),

  deleteEvent: catchAsync(async (req: any, res: Response) => {
    await placesService.deleteEvent(req.params.eventId as string, req.user.id);
    sendNoContent(res);
  }),

  getEvents: catchAsync(async (req: Request, res: Response) => {
    const events = await placesService.getEvents(req.params.id as string);
    sendSuccess(res, events);
  }),

  addImage: catchAsync(async (req: any, res: Response) => {
    const image = await placesService.addImage(req.params.id as string, req.body, req.user.id);
    sendCreated(res, image, 'Image added');
  }),

  deleteImage: catchAsync(async (req: any, res: Response) => {
    await placesService.deleteImage(req.params.imageId as string, req.user.id);
    sendNoContent(res);
  }),

  setPrimaryImage: catchAsync(async (req: any, res: Response) => {
    const image = await placesService.setPrimaryImage(req.params.imageId as string, req.user.id);
    sendSuccess(res, image, { message: 'Primary image set' });
  }),

  getImages: catchAsync(async (req: Request, res: Response) => {
    const images = await placesService.getImages(req.params.id as string);
    sendSuccess(res, images);
  }),

  addVideo: catchAsync(async (req: any, res: Response) => {
    const video = await placesService.addVideo(req.params.id as string, req.body, req.user.id);
    sendCreated(res, video, 'Video added');
  }),

  deleteVideo: catchAsync(async (req: any, res: Response) => {
    await placesService.deleteVideo(req.params.videoId as string, req.user.id);
    sendNoContent(res);
  }),

  getVideos: catchAsync(async (req: Request, res: Response) => {
    const videos = await placesService.getVideos(req.params.id as string);
    sendSuccess(res, videos);
  }),

  getReels: catchAsync(async (req: Request, res: Response) => {
    const reels = await placesService.getReels(req.params.id as string);
    sendSuccess(res, reels);
  }),

  savePlace: catchAsync(async (req: any, res: Response) => {
    await placesService.savePlace(req.params.id as string, req.user.id);
    sendSuccess(res, null, { message: 'Place saved' });
  }),

  unsavePlace: catchAsync(async (req: any, res: Response) => {
    await placesService.unsavePlace(req.params.id as string, req.user.id);
    sendSuccess(res, null, { message: 'Place unsaved' });
  }),

  getSavedPlaces: catchAsync(async (req: any, res: Response) => {
    const result = await placesService.getSavedPlaces(req.user.id, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  checkIn: catchAsync(async (req: any, res: Response) => {
    const checkin = await placesService.checkIn(req.params.id as string, req.user.id);
    sendSuccess(res, checkin, { message: 'Check-in recorded' });
  }),

  addReview: catchAsync(async (req: any, res: Response) => {
    const review = await placesService.addReview(req.params.id as string, req.user.id, req.body);
    sendSuccess(res, review, { message: 'Review submitted' });
  }),

  getReviews: catchAsync(async (req: Request, res: Response) => {
    const result = await placesService.getReviews(req.params.id as string, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  recordStat: catchAsync(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    await placesService.recordStat(req.params.id as string, req.body.action, userId);
    sendSuccess(res, null, { message: 'Stat recorded' });
  }),

  getStats: catchAsync(async (req: Request, res: Response) => {
    const stats = await placesService.getStats(req.params.id as string);
    sendSuccess(res, stats);
  }),

  getAnalytics: catchAsync(async (req: Request, res: Response) => {
    const analytics = await placesService.getAnalytics(req.params.id as string);
    sendSuccess(res, analytics);
  }),

  getHotspots: catchAsync(async (req: Request, res: Response) => {
    const hotspots = await placesService.getHotspots(req.query as any);
    sendSuccess(res, hotspots);
  }),

  getNearbyVendors: catchAsync(async (req: Request, res: Response) => {
    const vendors = await placesService.getNearbyVendors(req.params.id as string, req.query as any);
    sendSuccess(res, vendors);
  }),

  markReviewHelpful: catchAsync(async (req: any, res: Response) => {
    const review = await placesService.markReviewHelpful(req.params.id as string, req.params.reviewId as string);
    sendSuccess(res, review, { message: 'Review marked as helpful' });
  }),
};
