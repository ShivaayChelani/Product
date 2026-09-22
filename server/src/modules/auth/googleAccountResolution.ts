import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { ensureBaseUserRole } from '../../shared/utils/specialtyRoles';
import { GOOGLE_PROVIDER, type VerifiedGoogleIdentity } from './googleIdentity';

export type GoogleAccountResolution = {
  userId: string;
  created: boolean;
  /** True when the Google link was established during this request (new user OR new link on an email-matched account). */
  linkedNow: boolean;
};

type Tx = Prisma.TransactionClient;

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function isRetryableRace(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // P2002 unique conflict, P2034 deadlock, P40001 serialization failure, P2028 retryable transaction timeout,
  // 25P02 aborted transaction (constraint/violation happened earlier in the same interactive tx).
  return code === 'P2002' || code === 'P2034' || code === 'P40001' || code === 'P2028' || code === '25P02';
}

function jitteredBackoff(attempt: number): Promise<void> {
  const base = 15 * Math.pow(2, attempt);
  const ms = base + Math.floor(Math.random() * 25);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function displayName(identity: VerifiedGoogleIdentity): string {
  return identity.name || identity.email.split('@')[0] || 'Google User';
}

function googleIdentityConflict(message: string): ApiError {
  return new ApiError(409, message, true, ErrorCodes.GOOGLE_IDENTITY_CONFLICT);
}

async function findUserIdByEmail(tx: Tx, email: string): Promise<string | null> {
  const exact = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (exact) return exact.id;
  try {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1
    `;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function findGoogleAccountBySub(tx: Tx, sub: string) {
  return tx.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: GOOGLE_PROVIDER,
        providerAccountId: sub,
      },
    },
  });
}

async function fillMissingProfile(tx: Tx, userId: string, identity: VerifiedGoogleIdentity): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatar: true, emailVerified: true },
  });
  if (!user) {
    throw new ApiError(401, 'Invalid Google token.');
  }

  const data: Prisma.UserUpdateInput = {};
  if (!user.emailVerified) data.emailVerified = true;
  if (!user.name?.trim() && identity.name) data.name = identity.name;
  if (!user.avatar && identity.picture) data.avatar = identity.picture;
  if (Object.keys(data).length > 0) {
    await tx.user.update({ where: { id: userId }, data });
  }
}

async function updateGoogleAccountMetadata(
  tx: Tx,
  accountId: string,
  identity: VerifiedGoogleIdentity,
): Promise<void> {
  await tx.authAccount.update({
    where: { id: accountId },
    data: {
      email: identity.email,
      emailVerified: true,
      displayName: identity.name,
      avatar: identity.picture,
    },
  });
}

async function createGoogleAccount(
  tx: Tx,
  userId: string,
  identity: VerifiedGoogleIdentity,
) {
  return tx.authAccount.create({
    data: {
      userId,
      provider: GOOGLE_PROVIDER,
      providerAccountId: identity.sub,
      email: identity.email,
      emailVerified: true,
      displayName: identity.name,
      avatar: identity.picture,
    },
  });
}

async function resolveInsideTransaction(
  tx: Tx,
  identity: VerifiedGoogleIdentity,
): Promise<GoogleAccountResolution> {
  const linked = await findGoogleAccountBySub(tx, identity.sub);
  if (linked) {
    await fillMissingProfile(tx, linked.userId, identity);
    await updateGoogleAccountMetadata(tx, linked.id, identity);
    return { userId: linked.userId, created: false, linkedNow: false };
  }

  const existingUserId = await findUserIdByEmail(tx, identity.email);
  if (existingUserId) {
    const otherGoogle = await tx.authAccount.findFirst({
      where: { userId: existingUserId, provider: GOOGLE_PROVIDER },
    });
    if (otherGoogle && otherGoogle.providerAccountId !== identity.sub) {
      throw googleIdentityConflict(
        'This PalSafar account is already linked to a different Google identity.',
      );
    }

    try {
      await createGoogleAccount(tx, existingUserId, identity);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      // A constraint violation aborts the interactive transaction — any further query
      // here would raise Postgres 25P02 ("current transaction is aborted"). Re-throw
      // the retryable P2002; the outer retry loop re-runs resolution against the now
      // committed state, where the top-level sub lookup finds the winning account.
      throw error;
    }

    await fillMissingProfile(tx, existingUserId, identity);
    return { userId: existingUserId, created: false, linkedNow: true };
  }

  const created = await tx.user.create({
    data: {
      email: identity.email,
      password: null,
      name: displayName(identity),
      avatar: identity.picture,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    },
    select: { id: true },
  });

  await createGoogleAccount(tx, created.id, identity);
  await ensureBaseUserRole(created.id, tx);
  return { userId: created.id, created: true, linkedNow: true };
}

export async function resolveGoogleAccount(
  identity: VerifiedGoogleIdentity,
  db: { $transaction: typeof prisma.$transaction } = prisma,
): Promise<GoogleAccountResolution> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction((tx) => resolveInsideTransaction(tx, identity));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (!isRetryableRace(error)) throw error;
      lastError = error;
      await jitteredBackoff(attempt);
    }
  }

  try {
    return await db.$transaction((tx) => resolveInsideTransaction(tx, identity));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isRetryableRace(error) || lastError) {
      throw new ApiError(409, 'Could not complete Google sign-in. Please try again.');
    }
    throw error;
  }
}
