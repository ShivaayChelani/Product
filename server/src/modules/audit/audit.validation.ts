import { z } from 'zod';
import { AuditAction } from '@prisma/client';

const ACTION_VALUES = Object.values(AuditAction) as [string, ...string[]];

export const auditListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(200).optional(),
  action: z.enum(ACTION_VALUES).optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const auditExportQuerySchema = z.object({
  entityType: z.string().trim().max(80).optional(),
  action: z.enum(ACTION_VALUES).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});