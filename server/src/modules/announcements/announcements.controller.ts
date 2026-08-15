import { Response } from 'express';
import { announcementsService } from './announcements.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const announcementsController = {
  // ── Public ──
  listActive: catchAsync(async (req: any, res: Response) => {
    const audience = req.query.audience as string | undefined;
    const result = await announcementsService.listActive(audience);
    sendSuccess(res, result);
  }),

  // ── Admin ──
  list: catchAsync(async (req: any, res: Response) => {
    const result = await announcementsService.list(req.query);
    res.json({ success: true, ...result });
  }),

  getById: catchAsync(async (req: any, res: Response) => {
    const result = await announcementsService.getById(String(req.params.id));
    sendSuccess(res, result);
  }),

  create: catchAsync(async (req: any, res: Response) => {
    const result = await announcementsService.create(req.user.id, req.body);
    sendCreated(res, result, 'Announcement created');
  }),

  update: catchAsync(async (req: any, res: Response) => {
    const result = await announcementsService.update(String(req.params.id), req.user.id, req.body);
    sendSuccess(res, result, { message: 'Announcement updated' });
  }),

  remove: catchAsync(async (req: any, res: Response) => {
    await announcementsService.remove(String(req.params.id), req.user.id);
    sendSuccess(res, null, { message: 'Announcement deleted' });
  }),
};
