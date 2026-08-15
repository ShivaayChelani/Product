import { Response } from 'express';
import { tripsService } from './trips.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response';

export const tripsController = {
  create: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.create(req.body, req.user.id);
    sendCreated(res, trip, 'Trip created successfully');
  }),

  list: catchAsync(async (req: any, res: Response) => {
    const result = await tripsService.list(req.user.id, req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.getById(req.params.id, req.user.id);
    sendSuccess(res, trip);
  }),

  update: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.update(req.params.id, req.body, req.user.id);
    sendSuccess(res, trip, { message: 'Trip updated successfully' });
  }),

  delete: catchAsync(async (req: any, res: Response) => {
    await tripsService.delete(req.params.id, req.user.id);
    sendNoContent(res);
  }),

  duplicate: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.duplicate(req.params.id, req.user.id);
    sendCreated(res, trip, 'Trip duplicated successfully');
  }),

  addStop: catchAsync(async (req: any, res: Response) => {
    const stop = await tripsService.addStop(req.params.dayId, req.body, req.user.id);
    sendCreated(res, stop, 'Stop added successfully');
  }),

  updateStop: catchAsync(async (req: any, res: Response) => {
    const stop = await tripsService.updateStop(req.params.stopId, req.body, req.user.id);
    sendSuccess(res, stop, { message: 'Stop updated successfully' });
  }),

  replaceStop: catchAsync(async (req: any, res: Response) => {
    const stop = await tripsService.replaceStop(req.params.stopId, req.body.placeId, req.user.id);
    sendSuccess(res, stop, { message: 'Stop replaced successfully' });
  }),

  deleteStop: catchAsync(async (req: any, res: Response) => {
    await tripsService.deleteStop(req.params.stopId, req.user.id);
    sendNoContent(res);
  }),

  reorderStops: catchAsync(async (req: any, res: Response) => {
    const stops = await tripsService.reorderStops(req.params.dayId, req.body.stopIds, req.user.id);
    sendSuccess(res, stops, { message: 'Stops reordered successfully' });
  }),

  generateItinerary: catchAsync(async (req: any, res: Response) => {
    const { pace, startLocation } = req.body;
    const trip = await tripsService.generateItinerary(req.params.id, pace || 'moderate', req.user.id, startLocation);
    sendSuccess(res, trip, { message: 'Itinerary generated successfully' });
  }),

  optimizeRoute: catchAsync(async (req: any, res: Response) => {
    const { strategy, startLocation } = req.body;
    const trip = await tripsService.optimizeRoute(req.params.id, strategy || 'shortest', req.user.id, startLocation);
    sendSuccess(res, trip, { message: 'Route optimized successfully' });
  }),

  aiGenerate: catchAsync(async (req: any, res: Response) => {
    const result = await tripsService.aiGenerate(req.user.id, req.body);
    sendSuccess(res, result, { statusCode: 201, message: 'Itinerary generated successfully' });
  }),

  quickAdd: catchAsync(async (req: any, res: Response) => {
    const result = await tripsService.quickAdd(req.user.id, req.body.placeId, req.body.tripId);
    sendSuccess(res, result, {
      statusCode: result.alreadyExists ? 200 : 201,
      message: result.alreadyExists ? 'Already in your itinerary' : 'Added to your itinerary',
    });
  }),

  addCollaborator: catchAsync(async (req: any, res: Response) => {
    const collab = await tripsService.addCollaborator(req.params.id, req.body.userId, req.body.role, req.user.id);
    sendCreated(res, collab, 'Collaborator added successfully');
  }),

  removeCollaborator: catchAsync(async (req: any, res: Response) => {
    await tripsService.removeCollaborator(req.params.id, req.params.userId, req.user.id);
    sendNoContent(res);
  }),

  updateCollaboratorRole: catchAsync(async (req: any, res: Response) => {
    const collab = await tripsService.updateCollaboratorRole(req.params.id, req.params.userId, req.body.role, req.user.id);
    sendSuccess(res, collab, { message: 'Collaborator role updated' });
  }),

  start: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.startTrip(req.params.id, req.user.id);
    sendSuccess(res, trip, { message: 'Trip started successfully' });
  }),

  complete: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.completeTrip(req.params.id, req.user.id);
    sendSuccess(res, trip, { message: 'Trip completed successfully' });
  }),

  progress: catchAsync(async (req: any, res: Response) => {
    const progress = await tripsService.getProgress(req.params.id, req.user.id);
    sendSuccess(res, progress);
  }),

  getAllTrips: catchAsync(async (req: any, res: Response) => {
    const result = await tripsService.getAllTrips(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getTripsStats: catchAsync(async (req: any, res: Response) => {
    const stats = await tripsService.getTripsStats();
    sendSuccess(res, stats);
  }),

  adminGetById: catchAsync(async (req: any, res: Response) => {
    const trip = await tripsService.adminGetById(req.params.id);
    sendSuccess(res, trip);
  }),

  adminDelete: catchAsync(async (req: any, res: Response) => {
    await tripsService.adminDelete(req.params.id);
    sendNoContent(res);
  }),

  history: catchAsync(async (req: any, res: Response) => {
    const result = await tripsService.getHistory(req.user.id, req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  markVisited: catchAsync(async (req: any, res: Response) => {
    const result = await tripsService.markStopVisited(req.params.stopId, req.user.id, {
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      accuracy: req.body?.accuracy,
      timestamp: req.body?.timestamp,
    });
    sendSuccess(res, result, {
      message: result.alreadyVerified
        ? 'Checkpoint already verified'
        : 'Checkpoint verified',
    });
  }),

  markSkipped: catchAsync(async (req: any, res: Response) => {
    const stop = await tripsService.skipStop(req.params.stopId, req.user.id);
    sendSuccess(res, stop, { message: 'Stop skipped' });
  }),
};
