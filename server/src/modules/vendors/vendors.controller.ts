import { Request, Response } from 'express';
import { vendorsService } from './vendors.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const vendorsController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const { vendor, created, resubmitted } = await vendorsService.register(req.body, (req as any).user.id);
    if (created) {
      sendCreated(res, vendor, 'Vendor registration submitted for review');
      return;
    }
    if (resubmitted) {
      sendSuccess(res, vendor, { message: 'Vendor registration resubmitted for review' });
      return;
    }
    sendSuccess(res, vendor, { message: `Vendor registration is already ${vendor.status.toLowerCase()}` });
  }),

  getMyVendor: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    sendSuccess(res, vendor || null, { message: vendor ? 'Success' : 'No vendor account' });
  }),

  getListingPreview: catchAsync(async (req: Request, res: Response) => {
    const preview = await vendorsService.getListingPreview((req as any).user.id);
    sendSuccess(res, preview);
  }),

  updateMyVendor: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.updateMyVendor((req as any).user.id, req.body);
    sendSuccess(res, vendor, { message: 'Vendor updated' });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.list(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getById(req.params.id as string);
    sendSuccess(res, vendor);
  }),

  adminGetVendorDetail: catchAsync(async (req: Request, res: Response) => {
    const detail = await vendorsService.adminGetVendorDetail(req.params.id as string);
    sendSuccess(res, detail);
  }),

  verify: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.verify(
      req.params.id as string,
      req.body.status,
      (req as any).user.id,
      req.body.rejectionReason,
    );
    sendSuccess(res, vendor, { message: `Vendor ${req.body.status.toLowerCase()}` });
  }),

  deleteVendor: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.deleteVendor(req.params.id as string, (req as any).user.id);
    sendSuccess(res, result, { message: 'Vendor deleted' });
  }),

  createOffer: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const offer = await vendorsService.createOffer(vendor.id, req.body);
    sendCreated(res, offer, 'Offer created');
  }),

  updateOffer: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const offer = await vendorsService.updateOffer(req.params.offerId as string, vendor.id, req.body);
    sendSuccess(res, offer, { message: 'Offer updated' });
  }),

  listMyOffers: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, []); return; }
    const offers = await vendorsService.listOffers(vendor.id);
    sendSuccess(res, offers);
  }),

  deleteOffer: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    await vendorsService.deleteOffer(req.params.offerId as string, vendor.id);
    sendSuccess(res, null, { message: 'Offer deleted' });
  }),

  getPublicOffers: catchAsync(async (req: Request, res: Response) => {
    const offers = await vendorsService.getPublicOffers(req.query as any);
    sendSuccess(res, offers);
  }),

  // Business-type-specific public listings
  listByType: (type: string) => catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.listByType(type, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  // ── Public endpoints for map ──

  getNearbyVendors: catchAsync(async (req: Request, res: Response) => {
    const latRaw = req.query.lat ?? req.query.latitude;
    const lngRaw = req.query.lng ?? req.query.longitude;
    const radiusRaw = req.query.radiusKm ?? req.query.radius;
    const lat = latRaw != null ? parseFloat(String(latRaw)) : undefined;
    const lng = lngRaw != null ? parseFloat(String(lngRaw)) : undefined;
    const radiusKm = radiusRaw != null ? parseFloat(String(radiusRaw)) : undefined;
    const vendors = await vendorsService.listNearbyApproved({
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      radiusKm: Number.isFinite(radiusKm) ? radiusKm : undefined,
    });
    sendSuccess(res, vendors);
  }),

  listApprovedForMap: catchAsync(async (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const vendors = await vendorsService.listApprovedForMap(search);
    sendSuccess(res, vendors);
  }),

  searchForLocation: catchAsync(async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string'
      ? req.query.q
      : typeof req.query.search === 'string'
        ? req.query.search
        : '';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 12;
    const vendors = await vendorsService.searchSubscribedVendorsForLocation(q, Number.isFinite(limit) ? limit : 12);
    sendSuccess(res, vendors);
  }),

  listForMapViewport: catchAsync(async (req: Request, res: Response) => {
    const q = req.query as any;
    const vendors = await vendorsService.listForMapViewport({
      north: parseFloat(q.north),
      south: parseFloat(q.south),
      east: parseFloat(q.east),
      west: parseFloat(q.west),
      category: q.category ? String(q.category) : undefined,
      limit: q.limit ? parseInt(String(q.limit), 10) : 200,
    });
    sendSuccess(res, vendors);
  }),

  getPublicDetails: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getPublicDetails(req.params.id as string);
    sendSuccess(res, vendor);
  }),

  getReviews: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.getReviews(req.params.id as string, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  addReview: catchAsync(async (req: any, res: Response) => {
    const review = await vendorsService.addReview(req.params.id as string, req.user.id, req.body);
    sendSuccess(res, review, { message: 'Review submitted' });
  }),

  markReviewHelpful: catchAsync(async (req: any, res: Response) => {
    const review = await vendorsService.markReviewHelpful(
      req.params.id as string,
      req.params.reviewId as string,
    );
    sendSuccess(res, review, { message: 'Review marked as helpful' });
  }),

  // ── Vendor Reels ──

  getVendorReels: catchAsync(async (req: Request, res: Response) => {
    const reels = await vendorsService.listVendorReels(
      req.params.id as string,
      (req as any).user?.id,
    );
    sendSuccess(res, reels);
  }),

  getTaggedCreatorReels: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.listTaggedCreatorReels(
      req.params.id as string,
      (req as any).user?.id,
    );
    sendSuccess(res, result);
  }),

  listMyPendingTaggedReels: catchAsync(async (req: Request, res: Response) => {
    const reels = await vendorsService.listMyPendingTaggedReels((req as any).user.id);
    sendSuccess(res, reels);
  }),

  allowTaggedCreatorReel: catchAsync(async (req: Request, res: Response) => {
    const reel = await vendorsService.reviewTaggedCreatorReel(
      (req as any).user.id,
      req.params.reelId as string,
      'allow',
    );
    sendSuccess(res, reel, { message: 'Reel allowed on your map profile' });
  }),

  rejectTaggedCreatorReel: catchAsync(async (req: Request, res: Response) => {
    const reel = await vendorsService.reviewTaggedCreatorReel(
      (req as any).user.id,
      req.params.reelId as string,
      'reject',
    );
    sendSuccess(res, reel, { message: 'Reel rejected from your map profile' });
  }),

  createVendorReel: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const reel = await vendorsService.createVendorReel(vendor.id, req.body);
    sendCreated(res, reel, 'Reel created');
  }),

  deleteVendorReel: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    await vendorsService.deleteVendorReel(vendor.id, req.params.reelId as string);
    sendSuccess(res, null, { message: 'Reel deleted' });
  }),

  updateVendorReel: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const reel = await vendorsService.updateVendorReel(vendor.id, req.params.reelId as string, req.body);
    sendSuccess(res, reel, { message: 'Reel updated' });
  }),

  // ── Offer Lifecycle ──

  getOfferById: catchAsync(async (req: Request, res: Response) => {
    const offer = await vendorsService.getOfferById(req.params.offerId as string);
    sendSuccess(res, offer);
  }),

  approveOffer: catchAsync(async (req: Request, res: Response) => {
    const offer = await vendorsService.approveOffer(
      req.params.offerId as string,
      (req as any).user.id,
      req.body,
    );
    sendSuccess(res, offer, { message: 'Offer approved' });
  }),

  rejectOffer: catchAsync(async (req: Request, res: Response) => {
    const offer = await vendorsService.rejectOffer(
      req.params.offerId as string,
      (req as any).user.id,
      req.body,
    );
    sendSuccess(res, offer, { message: 'Offer rejected' });
  }),

  pauseOffer: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const offer = await vendorsService.pauseOffer(req.params.offerId as string, vendor.id);
    sendSuccess(res, offer, { message: 'Offer paused' });
  }),

  resumeOffer: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const offer = await vendorsService.resumeOffer(req.params.offerId as string, vendor.id);
    sendSuccess(res, offer, { message: 'Offer resumed' });
  }),

  duplicateOffer: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const offer = await vendorsService.duplicateOffer(req.params.offerId as string, vendor.id);
    sendCreated(res, offer, 'Offer duplicated');
  }),

  recordOfferView: catchAsync(async (req: Request, res: Response) => {
    await vendorsService.recordOfferView(req.params.offerId as string);
    sendSuccess(res, null);
  }),

  recordOfferClick: catchAsync(async (req: Request, res: Response) => {
    await vendorsService.recordOfferClick(req.params.offerId as string);
    sendSuccess(res, null);
  }),

  // ── Dashboard & Analytics ──

  getDashboard: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const stats = await vendorsService.getDashboardStats(vendor.id);
    sendSuccess(res, stats);
  }),

  getAnalytics: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const period = (req.query.period as string) || '7d';
    const analytics = await vendorsService.getAnalytics(vendor.id, period as any);
    sendSuccess(res, analytics);
  }),

  getOfferAnalytics: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.getMyVendor((req as any).user.id);
    if (!vendor) { sendSuccess(res, null, { message: 'No vendor account' }); return; }
    const period = (req.query.period as '7d' | '30d' | '90d') || '30d';
    const granularity = (req.query.granularity as 'daily' | 'weekly' | 'monthly') || 'daily';
    const analytics = await vendorsService.getOfferAnalytics(
      req.params.offerId as string,
      vendor.id,
      period,
      granularity,
    );
    sendSuccess(res, analytics);
  }),

  adminGetOfferAnalytics: catchAsync(async (req: Request, res: Response) => {
    const period = (req.query.period as '7d' | '30d' | '90d') || '30d';
    const granularity = (req.query.granularity as 'daily' | 'weekly' | 'monthly') || 'daily';
    const analytics = await vendorsService.adminGetOfferAnalytics(
      req.params.offerId as string,
      period,
      granularity,
    );
    sendSuccess(res, analytics);
  }),

  // ── Admin Offer Management ──

  adminListAllOffers: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.adminListAllOffers({
      page: req.query.page as string,
      limit: req.query.limit as string,
      status: req.query.status as string,
      search: req.query.search as string,
    });
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  adminFeatureOffer: catchAsync(async (req: Request, res: Response) => {
    const offer = await vendorsService.adminFeatureOffer(
      req.params.offerId as string,
      (req as any).user.id,
      req.body,
    );
    sendSuccess(res, offer, { message: 'Offer featured status updated' });
  }),

  adminDisableOffer: catchAsync(async (req: Request, res: Response) => {
    const offer = await vendorsService.adminDisableOffer(
      req.params.offerId as string,
      (req as any).user.id,
      req.body.reason,
    );
    sendSuccess(res, offer, { message: 'Offer disabled' });
  }),

  adminEnableOffer: catchAsync(async (req: Request, res: Response) => {
    const offer = await vendorsService.adminEnableOffer(req.params.offerId as string);
    sendSuccess(res, offer, { message: 'Offer enabled' });
  }),

  adminRemoveOffer: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.adminRemoveOffer(
      req.params.offerId as string,
      (req as any).user.id,
    );
    sendSuccess(res, result, { message: 'Offer removed' });
  }),

  adminModerateOffer: catchAsync(async (req: Request, res: Response) => {
    const result = await vendorsService.adminModerateOffer(
      req.params.offerId as string,
      (req as any).user.id,
      req.body,
    );
    sendSuccess(res, result, { message: 'Offer moderated' });
  }),

  adminResetVendorCode: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.adminResetVendorCode(
      req.params.id as string,
      (req as any).user.id,
    );
    sendSuccess(res, vendor, { message: 'Vendor code reset' });
  }),

  // ── Admin ──

  adminUpdateVendor: catchAsync(async (req: Request, res: Response) => {
    const vendor = await vendorsService.adminUpdate(
      req.params.id as string,
      req.body,
      (req as any).user.id,
    );
    sendSuccess(res, vendor, { message: 'Vendor location updated' });
  }),
};
