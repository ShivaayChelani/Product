import { z } from 'zod';

const isoDateTime = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}, z.string().datetime().nullable());

const optionalUrl = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.string().url().nullish());

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.string().max(80).nullish());

export const SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const;
export const AUDIENCES = ['ALL', 'USER', 'VENDOR', 'CONTENT_CREATOR'] as const;

export const createAnnouncementSchema = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(1).max(2000),
  severity: z.enum(SEVERITIES).default('INFO'),
  audience: z.enum(AUDIENCES).default('ALL'),
  isActive: z.boolean().default(true),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  linkUrl: optionalUrl,
  linkLabel: optionalText,
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const activeAnnouncementsQuerySchema = z.object({
  audience: z.enum(AUDIENCES).optional(),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
