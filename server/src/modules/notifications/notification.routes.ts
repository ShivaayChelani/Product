import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { requireMarketingOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import {
  registerDeviceTokenSchema,
  unregisterDeviceTokenSchema,
  sendNotificationSchema,
  listNotificationsSchema,
  markReadSchema,
  deleteNotificationsSchema,
  sendToRoleSchema,
  sendToCitySchema,
  sendToCategorySchema,
  createTemplateSchema,
  updateTemplateSchema,
  sendFromTemplateSchema,
  adminListNotificationsSchema,
} from './notification.validation';

const router = Router();

router.use(authenticate);

router.post('/register-token', validate(registerDeviceTokenSchema), notificationController.registerToken);
router.delete('/unregister-token', validate(unregisterDeviceTokenSchema), notificationController.unregisterToken);
router.get('/', validate(listNotificationsSchema, 'query'), notificationController.getNotifications);
router.patch('/mark-read', validate(markReadSchema), notificationController.markRead);
router.post('/mark-all-read', notificationController.markAllRead);
router.delete('/', validate(deleteNotificationsSchema), notificationController.deleteNotifications);
router.delete('/:id', notificationController.deleteNotification);

const adminRouter = Router({ mergeParams: true });
adminRouter.use(authenticate, requireAdmin);

adminRouter.post('/send', requireMarketingOps, validate(sendNotificationSchema), notificationController.sendNotification);
adminRouter.post('/send-to-role', requireMarketingOps, validate(sendToRoleSchema), notificationController.sendToRole);
adminRouter.post('/send-to-city', requireMarketingOps, validate(sendToCitySchema), notificationController.sendToCity);
adminRouter.post('/send-to-category', requireMarketingOps, validate(sendToCategorySchema), notificationController.sendToCategory);
adminRouter.post('/send-from-template', requireMarketingOps, validate(sendFromTemplateSchema), notificationController.sendFromTemplate);

adminRouter.get('/admin-list', validate(adminListNotificationsSchema, 'query'), notificationController.listAdmin);

adminRouter.get('/templates', notificationController.listTemplates);
adminRouter.post('/templates', requireMarketingOps, validate(createTemplateSchema), notificationController.createTemplate);
adminRouter.patch('/templates/:id', requireMarketingOps, validate(updateTemplateSchema), notificationController.updateTemplate);
adminRouter.delete('/templates/:id', requireMarketingOps, notificationController.deleteTemplate);

export default router;
export { adminRouter };
