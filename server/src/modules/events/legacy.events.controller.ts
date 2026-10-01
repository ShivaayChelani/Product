import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response';
import { ADMIN_ROLES, hasRole } from '../../middleware/auth';
import { eventsService, type EventViewer } from './events.service';
import { EVENT_INCLUDE, mapEventRow } from './events.helpers';
import { publicEventWhere } from './events-public-visibility';
import { assertValidCoordinatePair } from '../../shared/utils/coordinates';
import { canPublicViewPlace } from '../places/services/places-public-visibility';
import { resolvePlace, verifyVendorAccess } from '../places/services/places.helpers';

/**
 * Backwards-compatible adapters for the legacy Place-scoped event routes.
 *
 * WHY THIS FILE EXISTS
 * The audit found three live problems in `places.routes.ts`:
 *   D1  `GET /places/:id/events` is unauthenticated, unthrottled, and returns
 *       events for places the caller may not be allowed to see.
 *   D2  The vendor write routes have no rate limiting at all.
 *   D3  `PATCH /vendor/places/:id/events/:eventId` ignores `:id` entirely, so a
 *       vendor who owns Place A can edit an event hanging off Place B.
 *
 * Rather than delete routes that may still have callers, these handlers proxy
 * into `eventsService`, so legacy and new traffic share ONE moderation and
 * visibility implementation. Legacy rows are already migrated into `events` by
 * migration 20260930120000, so reading `events` here is complete.
 */

/** Load a place for a public caller, applying the standard Place visibility gate. */
async function requirePublicPlace(placeIdOrSlug: string) {
  const id = (await resolvePlace(placeIdOrSlug)).id;
  const place = await prisma.place.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      mergedIntoId: true,
      dataQuality: true,
      source: true,
      verificationLevel: true,
      latitude: true,
      longitude: true,
      city: true,
      state: true,
      fullAddress: true,
    },
  });
  // 404 rather than 403 for a non-visible place: a 403 confirms the place
  // exists, which is itself a disclosure.
  if (!place || !canPublicViewPlace(place, false)) {
    throw new ApiError(404, 'Place not found.');
  }
  return place;
}

/**
 * `GET /places/:id/events`
 *
 * Replaces the old implementation, which returned every `place_events` row for
 * the place regardless of moderation state or date and never checked whether the
 * place itself was publicly visible.
 */
export const legacyEventsController = {
  listForPlace: catchAsync(async (req: Request, res: Response) => {
    const place = await requirePublicPlace(String(req.params.id));
    const viewer = req.user?.id
      ? { id: req.user.id, isAdmin: ADMIN_ROLES.some((role) => hasRole(req.user, role)) }
      : null;

    // Admins and the owning vendor see the full moderation picture; everyone
    // else sees only published, date-valid events.
    const privileged = viewer?.isAdmin === true;
    const where = privileged
      ? { linkedPlaceId: place.id }
      : { linkedPlaceId: place.id, ...publicEventWhere() };

    const rows = await prisma.event.findMany({
      where,
      include: EVENT_INCLUDE,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      take: 100,
    });

    sendSuccess(res, rows.map((r) => mapEventRow(r, viewer)));
  }),

  /**
   * `POST /vendor/places/:id/events`
   *
   * The legacy body has no coordinates. Deriving them from the parent Place is
   * the one legitimate inheritance in this feature — but they are VALIDATED,
   * never copied blindly, so a Place with a broken position cannot manufacture
   * a broken event.
   */
  createForPlace: catchAsync(async (req: any, res: Response) => {
    const place = await requireVendorOwnedPlace(req);
    const viewer: EventViewer = { id: req.user.id, isAdmin: false };

    const coord = assertValidCoordinatePair(place.latitude, place.longitude, {
      label: 'Location',
      // A vendor-managed place is usually inside India's bounds; keep the strict
      // India check but do not demand it, since a few valid listings sit just
      // outside due to border data errors.
      requireIndia: false,
    });

    const result = await eventsService.createEvent(
      {
        title: req.body.title,
        description: req.body.description ?? null,
        eventType: 'OTHER',
        startDate: req.body.startDate,
        endDate: req.body.endDate ?? null,
        startTime: null,
        endTime: null,
        latitude: coord.latitude,
        longitude: coord.longitude,
        address: place.fullAddress ?? null,
        city: place.city,
        state: place.state,
        coverImage: req.body.imageUrl ?? null,
        images: req.body.imageUrl ? [req.body.imageUrl] : [],
        linkedPlaceId: place.id,
        linkedVendorId: null,
      },
      viewer.id,
    );

    sendCreated(res, result, 'Event created');
  }),

  /**
   * `PATCH /vendor/places/:id/events/:eventId` — fixes defect D3.
   *
   * The old handler passed only `:eventId` to the service, so the `:id` segment
   * was decorative. The event is now loaded and its `linkedPlaceId` must match
   * the place in the URL, which restores the tenancy boundary.
   */
  updateForPlace: catchAsync(async (req: any, res: Response) => {
    const place = await requireVendorOwnedPlace(req);
    const event = await loadEventOwnedByPlace(req.params.eventId, place.id);

    const result = await eventsService.updateEvent(
      event.id,
      {
        title: req.body.title,
        description: req.body.description,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        coverImage: req.body.imageUrl,
      },
      // `managesPlaceId` is an explicit, single-Place grant that
      // `requireVendorOwnedPlace` and `loadEventOwnedByPlace` have already
      // proven. The previous version instead rewrote the viewer id to the
      // event's creator, which let the service's owner check pass while the
      // audit trail recorded the wrong actor.
      { id: req.user.id, isAdmin: false, managesPlaceId: place.id },
    );

    sendSuccess(res, result, { message: 'Event updated' });
  }),

  /** `DELETE /vendor/places/:id/events/:eventId` — same tenancy check. */
  deleteForPlace: catchAsync(async (req: any, res: Response) => {
    const place = await requireVendorOwnedPlace(req);
    const event = await loadEventOwnedByPlace(req.params.eventId, place.id);

    await eventsService.deleteEvent(event.id, {
      id: req.user.id,
      isAdmin: false,
      managesPlaceId: place.id,
    });
    sendNoContent(res);
  }),
};

/**
 * Resolve `:id` and assert the caller may manage that place.
 *
 * Delegates to `verifyVendorAccess`, the single existing ownership gate for
 * vendor-managed places (role check, vendor APPROVED, place in the vendor's
 * linkedSpotIds, place APPROVED). Re-implementing that here would be a second
 * copy to keep in sync — and the copy would drift.
 */
async function requireVendorOwnedPlace(req: any) {
  const placeId = (await resolvePlace(String(req.params.id))).id;
  await verifyVendorAccess(placeId, req.user.id);
  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      city: true,
      state: true,
      fullAddress: true,
    },
  });
  if (!place) throw new ApiError(404, 'Place not found.');
  return place;
}

/** Fetch an event and prove it belongs to the place named in the URL. */
async function loadEventOwnedByPlace(eventId: string, placeId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, linkedPlaceId: true } });
  if (!event) throw new ApiError(404, 'Event not found.');
  if (event.linkedPlaceId !== placeId) {
    // 404, not 403: confirming "that event exists but is on another place" leaks
    // the shape of another vendor's catalogue.
    throw new ApiError(404, 'Event not found for this place.');
  }
  return event;
}