import { z } from 'zod';

export const LEGAL_DOCUMENT_TYPES = [
  'PRIVACY_POLICY',
  'TERMS_CONDITIONS',
  'REWARDS_POLICY',
  'COMMUNITY_GUIDELINES',
  'VENDOR_TERMS',
  'CREATOR_TERMS',
  'REFUND_POLICY',
  'ABOUT_US',
  'CONTACT_INFO',
  'FAQ',
] as const;

const isoDateTime = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}, z.string().datetime().nullable());

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.string().max(500).nullish());

export const legalTypeParamSchema = z.object({
  type: z.enum(LEGAL_DOCUMENT_TYPES),
});

export const localeQuerySchema = z.object({
  locale: z.string().min(2).max(10).optional(),
});

export const createDocumentSchema = z.object({
  type: z.enum(LEGAL_DOCUMENT_TYPES),
  locale: z.string().min(2).max(10).default('en'),
});

export const createVersionSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(1),
  format: z.enum(['MARKDOWN', 'HTML', 'PLAIN']).default('MARKDOWN'),
  effectiveDate: isoDateTime.optional(),
  changeSummary: optionalText,
});

export const updateVersionSchema = createVersionSchema.partial();

export const rollbackVersionSchema = z.object({
  publish: z.boolean().default(true),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type UpdateVersionInput = z.infer<typeof updateVersionSchema>;
export type RollbackVersionInput = z.infer<typeof rollbackVersionSchema>;
export type LegalDocumentTypeValue = (typeof LEGAL_DOCUMENT_TYPES)[number];
