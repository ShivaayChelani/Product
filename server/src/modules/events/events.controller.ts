import { Response } from 'express';
import { eventsService, type EventViewer } from './events.service';
import { eventsGeoService } from './events.geo.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ADMIN_ROLES, hasRole } from '../../middleware/auth';
import type {
  AdminListEventsQueryInput,
  AdminEventReportsQueryInput,
  ApproveEventInput,
  CancelEventInput,
  CreateEventInput,
  EventListQueryInput,
  EventMapQueryInput,
  FeatureEventInput,
  NearbyEventsQueryInput,
  RejectEventInput,
  ReportEventInput,
  ResolveEventReportInput,
  UnpublishEventInput,
  UpdateEventInput,
} from './events.validation';

/**
 * The controller is a thin adapter: pull the typed input off the request,
 * resolve who is asking, delegate. Every authorization decision lives in the
 * service so there is exactly one place to audit for IDOR, not two.
 */
function viewerOf(req: { user?: Express.Request['user'] }): EventViewer | null {
  if (!req.user?.id) return null;
  return {
    id: req.user.id,
    isAdmin: ADMIN_ROLES.some((role) => hasRole(req.user, role)),
  };
}

/** Throws 401 when the route needs a user and there isn't one. */
function requireViewer(req: { user?: Express.Request['user'] }): EventViewer {
  const viewer = viewerOf(req);
  if (!viewer) {
    // Mirrors the error the authenticate middleware raises, so the client sees
    // one consistent shape for "log in first".
    const err = new Error('Authentication required') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  return viewer;
}

export const eventsController = {
  // ── Public ────────────────────────────────────────────────────────────────

  list: catchAsync(async (req, res: Response) => {
    const result = await eventsService.listEvents(req.query as unknown as EventListQueryInput, viewerOf(req));
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getMapEvents: catchAsync(async (req, res: Response) => {
    const result = await eventsGeoService.getMapEvents(
      req.query as unknown as EventMapQueryInput,
      viewerOf(req) ?? { isAdmin: false },
    );
    sendSuccess(res, result.events, { meta: result.meta });
  }),

  getNearby: catchAsync(async (req, res: Response) => {
    const result = await eventsGeoService.getNearbyEvents(
      req.query as unknown as NearbyEventsQueryInput,
      viewerOf(req) ?? { isAdmin: false },
    );
    sendSuccess(res, result.events, { meta: result.meta });
  }),

  getFeatured: catchAsync(async (req, res: Response) => {
    const limit = Number(req.query.limit ?? 10);
    const events = await eventsGeoService.getFeaturedEvents(
      Number.isFinite(limit) ? limit : 10,
      viewerOf(req) ?? { isAdmin: false },
    );
    sendSuccess(res, events);
  }),

  getByIdOrSlug: catchAsync(async (req, res: Response) => {
    const event = await eventsService.getEvent(String(req.params.idOrSlug), viewerOf(req));
    sendSuccess(res, event);
  }),

  /**
   * Reels attached to an event. Visibility of the parent event is enforced in
   * the service, so this returns 404 for anything the caller cannot see.
   */
  listReels: catchAsync(async (req, res: Response) => {
    const reels = await eventsService.listReels(
      String(req.params.idOrSlug),
      viewerOf(req),
      req.query.limit != null ? Number(req.query.limit) : undefined,
    );
    sendSuccess(res, reels);
  }),

  // ── Owner / authenticated writes ──────────────────────────────────────────

  create: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const result = await eventsService.createEvent(req.body as CreateEventInput, viewer.id);
    sendCreated(res, result, result.pendingNotice);
  }),

  update: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const result = await eventsService.updateEvent(
      String(req.params.id),
      req.body as UpdateEventInput,
      viewer,
    );
    sendSuccess(res, result);
  }),

  remove: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const result = await eventsService.deleteEvent(String(req.params.id), viewer);
    sendSuccess(res, result);
  }),

  /** An organiser withdrawing their own event. */
  cancel: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const result = await eventsService.cancelEvent(
      String(req.params.id),
      viewer.id,
      req.body as CancelEventInput,
      viewer.isAdmin,
    );
    sendSuccess(res, result);
  }),

  report: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const result = await eventsService.reportEvent(
      String(req.params.id),
      viewer.id,
      req.body as ReportEventInput,
    );
    sendCreated(res, result, 'Thanks — our team will review this.');
  }),

  // ── Admin ─────────────────────────────────────────────────────────────────

  adminList: catchAsync(async (req, res: Response) => {
    const result = await eventsService.adminListEvents(req.query as unknown as AdminListEventsQueryInput);
    sendSuccess(res, result.data, {
      pagination: result.pagination,
      meta: { statusCounts: result.statusCounts, lifecycleCounts: result.lifecycleCounts },
    });
  }),

  adminDelete: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const result = await eventsService.adminDeleteEvent(String(req.params.id), viewer.id);
    sendSuccess(res, result);
  }),

  approve: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const input = req.body as ApproveEventInput;
    const event = await eventsService.approveEvent(String(req.params.id), viewer.id, {
      force: input?.force,
      isFeatured: input?.isFeatured,
    });
    sendSuccess(res, event, { message: 'Event published.' });
  }),

  reject: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const event = await eventsService.rejectEvent(String(req.params.id), viewer.id, req.body as RejectEventInput);
    sendSuccess(res, event, { message: 'Event rejected.' });
  }),

  unpublish: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const event = await eventsService.unpublishEvent(
      String(req.params.id),
      viewer.id,
      req.body as UnpublishEventInput,
    );
    sendSuccess(res, event, { message: 'Event unpublished.' });
  }),

  setFeatured: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const input = req.body as FeatureEventInput;
    const event = await eventsService.setFeatured(String(req.params.id), viewer.id, Boolean(input?.isFeatured));
    sendSuccess(res, event);
  }),

  listReports: catchAsync(async (req, res: Response) => {
    const result = await eventsService.listReports(req.query as unknown as AdminEventReportsQueryInput);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  resolveReport: catchAsync(async (req, res: Response) => {
    const viewer = requireViewer(req);
    const { resolutionNote } = req.body as ResolveEventReportInput;
    sendSuccess(res, await eventsService.resolveReport(String(req.params.reportId), viewer.id, resolutionNote));
  }),

  /**
   * Admin troubleshooting: explains why an APPROVED event still does not appear
   * on the public map. Without this, "I approved it but the map is empty" is the
   * single hardest bug in a map-driven moderation flow.
   */
  visibilityDiagnosis: catchAsync(async (req, res: Response) => {
    sendSuccess(res, await eventsService.explainPublicVisibility(String(req.params.id)));
  }),

  /**
   * Duplicate evidence for the moderation queue, using the same scan that
   * blocks approval, so an admin can compare candidates BEFORE deciding rather
   * than after tripping the 409.
   */
  duplicates: catchAsync(async (req, res: Response) => {
    sendSuccess(res, await eventsService.adminListDuplicateCandidates(String(req.params.id)));
  }),
};