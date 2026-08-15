import { z } from 'zod';
import { Role } from '@prisma/client';

const roleFilterValues = [
  Role.USER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.OPS_ADMIN,
  Role.VENDOR,
  Role.CONTENT_CREATOR,
  Role.VENDOR_MANAGER,
  Role.CONTENT_MODERATOR,
  Role.FINANCE_MANAGER,
  Role.SUPPORT_AGENT,
  Role.MARKETING_ADMIN,
  Role.ANALYTICS_VIEWER,
] as const;

export const listUsersSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().max(200).optional(),
  permission: z.enum(roleFilterValues).optional(),
  role: z.enum(roleFilterValues).optional(),
  /** When true, only users with pending / changes-requested vendor or creator apps. */
  pendingApproval: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const updateRoleSchema = z.object({
  permission: z.enum(['USER', 'ADMIN', 'VENDOR', 'CONTENT_CREATOR'], {
    message: 'Permission must be USER, ADMIN, VENDOR, or CONTENT_CREATOR',
  }),
  // Set when the admin has already been warned that this grant will retire the user's other professional role.
  confirmSwitch: z.boolean().optional(),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
