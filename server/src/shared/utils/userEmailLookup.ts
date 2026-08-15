import { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

/** Normalize login / reset email input once at the edge. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Case-safe user lookup — prefers exact lowercase match, then SQL fallback for legacy rows. */
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const exact = await prisma.user.findUnique({ where: { email: normalized } });
  if (exact) return exact;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE LOWER(email) = ${normalized} LIMIT 1
    `;
    const id = rows[0]?.id;
    if (!id) return null;
    return prisma.user.findUnique({ where: { id } });
  } catch (err) {
    logger.error({ err, email: normalized }, 'Case-insensitive email lookup failed');
    return null;
  }
}
