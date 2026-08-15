import { Response } from 'express';
import { notificationService } from './notification.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response';

export const notificationController = {
  registerToken: catchAsync(async (req: any, res: Response) => {
    const { token, platform } = req.body;
    const deviceToken = await notificationService.registerDeviceToken(req.user.id, token, platform);
    sendCreated(res, deviceToken, 'Device token registered');
  }),

  unregisterToken: catchAsync(async (req: any, res: Response) => {
    const { token } = req.body;
    await notificationService.unregisterDeviceToken(req.user.id, token);
    sendSuccess(res, null, { message: 'Device token unregistered' });
  }),

  sendNotification: catchAsync(async (req: any, res: Response) => {
    const { userId, title, body, data, type } = req.body;
    if (userId) {
      const notification = await notificationService.sendToUser(userId, title, body, data, type || 'admin');
      sendSuccess(res, notification, { message: 'Notification sent' });
    } else {
      await notificationService.sendToAll(title, body, data, type || 'admin');
      sendSuccess(res, null, { message: 'Broadcast notification sent' });
    }
  }),

  getNotifications: catchAsync(async (req: any, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string | undefined;
    const unread = req.query.unread === 'true';
    const q = req.query.q as string | undefined;
    const result = await notificationService.getUserNotifications(req.user.id, page, limit, {
      category,
      unread,
      q,
    });
    sendSuccess(res, {
      notifications: result.data,
      unreadCount: result.unreadCount,
    }, {
      pagination: result.pagination,
    });
  }),

  markRead: catchAsync(async (req: any, res: Response) => {
    const { notificationIds } = req.body;
    await notificationService.markAsRead(req.user.id, notificationIds);
    sendSuccess(res, null, { message: 'Notifications marked as read' });
  }),

  markAllRead: catchAsync(async (req: any, res: Response) => {
    await notificationService.markAllAsRead(req.user.id);
    sendSuccess(res, null, { message: 'All notifications marked as read' });
  }),

  deleteNotification: catchAsync(async (req: any, res: Response) => {
    const result = await notificationService.deleteNotification(req.user.id, req.params.id);
    sendSuccess(res, result, { message: 'Notification deleted' });
  }),

  deleteNotifications: catchAsync(async (req: any, res: Response) => {
    const result = await notificationService.deleteNotifications(req.user.id, req.body.notificationIds);
    sendSuccess(res, result, { message: 'Notifications deleted' });
  }),

  // ── Admin: Send targeted ──
  sendToRole: catchAsync(async (req: any, res: Response) => {
    const { role, title, body, data, type } = req.body;
    await notificationService.sendToRole(role, title, body, data, type || 'admin');
    sendSuccess(res, null, { message: `Notification sent to ${role} users` });
  }),

  sendToCity: catchAsync(async (req: any, res: Response) => {
    const { city, title, body, data, type } = req.body;
    await notificationService.sendToCity(city, title, body, data, type || 'admin');
    sendSuccess(res, null, { message: `Notification sent to ${city} users` });
  }),

  sendToCategory: catchAsync(async (req: any, res: Response) => {
    const { category, title, body, data, type } = req.body;
    await notificationService.sendToCategory(category, title, body, data, type || 'admin');
    sendSuccess(res, null, { message: `Notification sent to ${category} users` });
  }),

  // ── Templates ──
  listTemplates: catchAsync(async (_req: any, res: Response) => {
    const templates = await notificationService.listTemplates();
    sendSuccess(res, templates);
  }),

  createTemplate: catchAsync(async (req: any, res: Response) => {
    const template = await notificationService.createTemplate(req.body);
    sendCreated(res, template, 'Template created');
  }),

  updateTemplate: catchAsync(async (req: any, res: Response) => {
    const template = await notificationService.updateTemplate(req.params.id, req.body);
    sendSuccess(res, template, { message: 'Template updated' });
  }),

  deleteTemplate: catchAsync(async (req: any, res: Response) => {
    await notificationService.deleteTemplate(req.params.id);
    sendNoContent(res);
  }),

  sendFromTemplate: catchAsync(async (req: any, res: Response) => {
    await notificationService.sendFromTemplate(req.body.templateId, req.body.target, req.body.variables);
    sendSuccess(res, null, { message: 'Template notification sent' });
  }),

  listAdmin: catchAsync(async (req: any, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await notificationService.listAdminNotifications(page, limit);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),
};
