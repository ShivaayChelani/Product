import { z } from 'zod';

export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).optional(),
  appVersion: z.string().max(32).optional(),
  buildNumber: z.string().max(32).optional(),
});

export const unregisterDeviceTokenSchema = z.object({
  token: z.string().min(1),
});

export const sendNotificationSchema = z.object({
  userId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  type: z.string().default('admin'),
});

export const listNotificationsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  category: z.string().max(32).optional(),
  unread: z.enum(['true', 'false']).optional(),
  q: z.string().max(120).optional(),
});

export const adminListNotificationsSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const deleteNotificationsSchema = z.object({
  notificationIds: z.array(z.string().min(1)).min(1).max(100),
});

export const markReadSchema = z.object({
  notificationIds: z.array(z.string().min(1)).min(1).max(100),
});

export const sendToRoleSchema = z.object({
  role: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  type: z.string().optional(),
});

export const sendToCitySchema = z.object({
  city: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  type: z.string().optional(),
});

export const sendToCategorySchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  type: z.string().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const sendFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  target: z.object({
    type: z.enum(['all', 'role', 'city', 'category', 'user']),
    value: z.string().optional(),
  }),
  variables: z.record(z.string(), z.string()).optional(),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type UnregisterDeviceTokenInput = z.infer<typeof unregisterDeviceTokenSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type SendToRoleInput = z.infer<typeof sendToRoleSchema>;
export type SendToCityInput = z.infer<typeof sendToCitySchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type SendFromTemplateInput = z.infer<typeof sendFromTemplateSchema>;
