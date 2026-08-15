import { Response } from 'express';
import { hiddenGemsService } from './hiddenGems.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ADMIN_ROLES, hasRole } from '../../middleware/auth';

function isAdminViewer(user: Express.Request['user']) {
  return ADMIN_ROLES.some((role) => hasRole(user, role));
}

export const hiddenGemsController = {
  create: catchAsync(async (req: any, res: Response) => {
    const submission = await hiddenGemsService.create(req.body, req.user.id);
    sendCreated(res, submission, 'Hidden gem submitted for review');
  }),

  list: catchAsync(async (req: any, res: Response) => {
    const result = await hiddenGemsService.list(req.query as any, {
      isAdmin: isAdminViewer(req.user),
      userId: req.user?.id,
    });
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getById: catchAsync(async (req: any, res: Response) => {
    const submission = await hiddenGemsService.getById(req.params.id as string, {
      isAdmin: isAdminViewer(req.user),
      userId: req.user?.id,
    });
    sendSuccess(res, submission);
  }),

  updatePending: catchAsync(async (req: any, res: Response) => {
    const submission = await hiddenGemsService.updatePending(
      req.params.id as string,
      req.body,
      req.user.id,
    );
    sendSuccess(res, submission, { message: 'Pending hidden gem updated' });
  }),

  deletePending: catchAsync(async (req: any, res: Response) => {
    const result = await hiddenGemsService.deletePending(req.params.id as string, req.user.id);
    sendSuccess(res, result, { message: result.message });
  }),

  approve: catchAsync(async (req: any, res: Response) => {
    const submission = await hiddenGemsService.approve(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, submission, { message: 'Hidden gem approved successfully' });
  }),

  reject: catchAsync(async (req: any, res: Response) => {
    const submission = await hiddenGemsService.reject(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, submission, { message: 'Hidden gem rejected' });
  }),

  findDuplicates: catchAsync(async (req: any, res: Response) => {
    const candidates = await hiddenGemsService.findDuplicateCandidates(req.params.id as string);
    sendSuccess(res, candidates);
  }),

  mergeContribution: catchAsync(async (req: any, res: Response) => {
    const result = await hiddenGemsService.mergeContribution(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, result, { message: 'Contribution merged into existing place' });
  }),

  unpublish: catchAsync(async (req: any, res: Response) => {
    const result = await hiddenGemsService.unpublish(req.params.id as string, req.body, req.user.id);
    sendSuccess(res, result, { message: 'Hidden gem unpublished' });
  }),
};
