import { Response } from 'express';
import { adminPanelService } from './admin-panel.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendNoContent } from '../../shared/utils/response';

export const adminPanelController = {
  listCategories: catchAsync(async (req: any, res: Response) => {
    const result = await adminPanelService.listCategories(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getCategory: catchAsync(async (req: any, res: Response) => {
    const category = await adminPanelService.getCategory(req.params.id);
    sendSuccess(res, category);
  }),

  updateCategory: catchAsync(async (req: any, res: Response) => {
    const category = await adminPanelService.updateCategory(req.params.id, req.body);
    sendSuccess(res, category, { message: 'Category updated' });
  }),

  deleteCategory: catchAsync(async (req: any, res: Response) => {
    await adminPanelService.deleteCategory(req.params.id);
    sendNoContent(res);
  }),

  listTags: catchAsync(async (req: any, res: Response) => {
    const result = await adminPanelService.listTags(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getTag: catchAsync(async (req: any, res: Response) => {
    const tag = await adminPanelService.getTag(req.params.id);
    sendSuccess(res, tag);
  }),

  updateTag: catchAsync(async (req: any, res: Response) => {
    const tag = await adminPanelService.updateTag(req.params.id, req.body);
    sendSuccess(res, tag, { message: 'Tag updated' });
  }),

  deleteTag: catchAsync(async (req: any, res: Response) => {
    await adminPanelService.deleteTag(req.params.id);
    sendNoContent(res);
  }),

  listMedia: catchAsync(async (req: any, res: Response) => {
    const result = await adminPanelService.listMedia(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  deleteMedia: catchAsync(async (req: any, res: Response) => {
    await adminPanelService.deleteMedia(req.params.type, req.params.id);
    sendNoContent(res);
  }),

  listReviews: catchAsync(async (req: any, res: Response) => {
    const result = await adminPanelService.listReviews(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getReview: catchAsync(async (req: any, res: Response) => {
    const review = await adminPanelService.getReview(req.params.id);
    sendSuccess(res, review);
  }),

  updateReviewStatus: catchAsync(async (req: any, res: Response) => {
    const review = await adminPanelService.updateReviewStatus(req.params.id, req.body.status);
    sendSuccess(res, review, { message: 'Review status updated' });
  }),

  listIncidents: catchAsync(async (req: any, res: Response) => {
    const result = await adminPanelService.listIncidents(req.query);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getIncident: catchAsync(async (req: any, res: Response) => {
    const incident = await adminPanelService.getIncident(req.params.id);
    sendSuccess(res, incident);
  }),

  updateIncidentStatus: catchAsync(async (req: any, res: Response) => {
    const incident = await adminPanelService.updateIncidentStatus(
      req.params.id,
      req.body.status,
      req.body.notes,
    );
    sendSuccess(res, incident, { message: 'Incident updated' });
  }),

  assignIncident: catchAsync(async (req: any, res: Response) => {
    const incident = await adminPanelService.assignIncident(req.params.id, req.body.moderatorId);
    sendSuccess(res, incident, { message: 'Incident assigned' });
  }),

  listRoles: catchAsync(async (_req: any, res: Response) => {
    const roles = await adminPanelService.listRoles();
    sendSuccess(res, roles);
  }),

  getRole: catchAsync(async (req: any, res: Response) => {
    const role = await adminPanelService.getRole(req.params.id);
    sendSuccess(res, role);
  }),
};
