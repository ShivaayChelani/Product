import { z } from 'zod';

/**
 * Prisma cuid ids look like `c` + 24 lowercase base36 characters.
 * Some legacy rows pre-date honoring this format, so the pattern is case-insensitive.
 */
const CUID_PATTERN = /^c[a-z0-9]{24}$/i;

export const cuidSchema = z
  .string()
  .min(1)
  .regex(CUID_PATTERN, 'Invalid id format — expected a cuid');

export const isCuid = (value: unknown): boolean =>
  typeof value === 'string' && CUID_PATTERN.test(value);