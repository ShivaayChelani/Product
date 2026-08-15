import { Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ADMIN_ROLES, hasRole } from '../../middleware/auth';
import { collaborationsService } from './collaborations.service';

export const collaborationsController = {
  create: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.createRequest(req.user.id, req.body);
    sendCreated(res, result, 'Collaboration request sent');
  }),

  listVendor: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.listForVendor(req.user.id, req.query);
    res.json({ success: true, data: result.data, pagination: result.pagination });
  }),

  listCreator: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.listForCreator(req.user.id, req.query);
    res.json({ success: true, data: result.data, pagination: result.pagination });
  }),

  listUploadEligible: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.listActiveForCreatorUpload(req.user.id);
    sendSuccess(res, result);
  }),

  getById: catchAsync(async (req: any, res: Response) => {
    const isAdmin = ADMIN_ROLES.some((role) => hasRole(req.user, role));
    const result = await collaborationsService.getById(req.params.id, req.user.id, isAdmin);
    sendSuccess(res, result);
  }),

  accept: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.accept(req.params.id, req.user.id);
    sendSuccess(res, result, { message: 'Collaboration accepted' });
  }),

  reject: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.reject(req.params.id, req.user.id, req.body.reason);
    sendSuccess(res, result, { message: 'Collaboration rejected' });
  }),

  cancel: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.cancel(req.params.id, req.user.id, req.body.reason);
    sendSuccess(res, result, { message: 'Collaboration cancelled' });
  }),

  markInProgress: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.markInProgress(req.params.id, req.user.id);
    sendSuccess(res, result);
  }),

  submitReel: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.submitReel(req.params.id, req.user.id, req.body);
    sendSuccess(res, result, { message: 'Collaboration reel submitted for review' });
  }),

  approveReel: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.approveReel(req.params.id, req.user.id);
    sendSuccess(res, result, { message: 'Reel approved. The creator can now publish it.' });
  }),

  publishReel: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.publishReel(req.params.id, req.user.id);
    sendSuccess(res, result, { message: 'Reel published' });
  }),

  requestRevision: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.requestRevision(req.params.id, req.user.id, req.body.feedback);
    sendSuccess(res, result, { message: 'Revision requested' });
  }),

  rejectReel: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.rejectReel(req.params.id, req.user.id, req.body.reason);
    sendSuccess(res, result, { message: 'Reel rejected' });
  }),

  canCollaborate: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.canVendorCollaborate(req.user.id, req.params.creatorProfileId);
    sendSuccess(res, result);
  }),

  adminList: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.adminList(req.query);
    res.json({ success: true, data: result.data, pagination: result.pagination });
  }),

  adminSuspend: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.adminSuspend(
      req.params.id,
      req.user.id,
      req.body.reason,
      req.body.disputeNotes,
    );
    sendSuccess(res, result, { message: 'Collaboration suspended' });
  }),

  adminResolve: catchAsync(async (req: any, res: Response) => {
    const result = await collaborationsService.adminResolveDispute(
      req.params.id,
      req.user.id,
      req.body.disputeNotes,
      req.body.status,
    );
    sendSuccess(res, result, { message: 'Dispute resolved' });
  }),

  adminAnalytics: catchAsync(async (_req: any, res: Response) => {
    const result = await collaborationsService.adminAnalyticsSummary();
    sendSuccess(res, result);
  }),
};
