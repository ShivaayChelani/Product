import { Prisma } from '@prisma/client';
import { env } from '../../../config/env';

/** When enabled, tourist-facing APIs only expose canonical VERIFIED places (not merged). */
export function isPublicVerifiedOnly(): boolean {
  return env.placesPublicVerifiedOnly;
}

export function applyPublicPlacePrismaFilter<T extends { mergedIntoId?: null | string; dataQuality?: string }>(
  where: T,
  isAdmin: boolean,
): T {
  if (isAdmin || !isPublicVerifiedOnly()) {
    return { ...where, mergedIntoId: null } as T;
  }
  return {
    ...where,
    mergedIntoId: null,
    dataQuality: 'VERIFIED',
  } as T;
}

/** SQL fragment for raw queries (places alias `p`). */
export function publicPlaceSql(isAdmin: boolean): Prisma.Sql {
  if (isAdmin || !isPublicVerifiedOnly()) {
    return Prisma.sql`p.merged_into_id IS NULL`;
  }
  return Prisma.sql`p.merged_into_id IS NULL AND p.data_quality = 'VERIFIED'`;
}

/** Append to Prisma.Sql condition arrays (alias `p`). */
export function appendPublicPlaceSqlConditions(conditions: Prisma.Sql[], isAdmin = false): void {
  if (isAdmin || !isPublicVerifiedOnly()) return;
  conditions.push(Prisma.sql`p.data_quality = 'VERIFIED'`);
}

/** Raw SQL suffix for unsafe queries on `places` table (no alias). */
export function publicVerifiedRawSqlSuffix(options?: { includeApprovedHiddenGems?: boolean }): string {
  if (!isPublicVerifiedOnly()) return '';
  if (options?.includeApprovedHiddenGems) {
    return ` AND (data_quality = 'VERIFIED' OR (source = 'HIDDEN_GEM' AND verification_level >= 2))`;
  }
  return ` AND data_quality = 'VERIFIED'`;
}

/** For Prisma tagged templates using alias `p`. */
export function verifiedPlaceSqlP(options?: { includeApprovedHiddenGems?: boolean }): Prisma.Sql {
  if (!isPublicVerifiedOnly()) return Prisma.sql``;
  if (options?.includeApprovedHiddenGems) {
    return Prisma.sql`AND (p.data_quality = 'VERIFIED' OR (p.source = 'HIDDEN_GEM' AND p.verification_level >= 2))`;
  }
  return Prisma.sql`AND p.data_quality = 'VERIFIED'`;
}

export function canPublicViewPlace(
  place: {
    mergedIntoId?: string | null;
    dataQuality?: string | null;
    status?: string;
    source?: string | null;
    verificationLevel?: number | null;
  },
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (place.mergedIntoId) return false;
  if (isPublicVerifiedOnly() && place.dataQuality !== 'VERIFIED') {
    const adminApprovedHiddenGem =
      place.source === 'HIDDEN_GEM' &&
      place.status === 'APPROVED' &&
      (place.verificationLevel ?? 0) >= 2;
    if (!adminApprovedHiddenGem) return false;
  }
  if (place.status !== 'APPROVED') return false;
  return true;
}
