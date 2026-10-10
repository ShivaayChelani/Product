import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { ensureBaseUserRole } from '../../shared/utils/specialtyRoles';
import { APPLE_PROVIDER, type VerifiedAppleIdentity } from './appleIdentity';

export type AppleAccountResolution = {
  userId: string;
  created: boolean;
  /** True when the Apple link was established during this request. */
  linkedNow: boolean;
};

type Tx = Prisma.TransactionClient;

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function isRetryableRace(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // P2002 unique conflict, P2034 deadlock, P40001 serialization failure, P2028 retryable
  // transaction timeout, 25P02 aborted transaction (a constraint fired earlier in this
  // interactive tx), P2025 record not found ? the winning racer rolled the shell back.
  return (
    code === 'P2002' ||
    code === 'P2034' ||
    code === 'P40001' ||
    code === 'P2028' ||
    code === '25P02' ||
    code === 'P2025'
  );
}

function jitteredBackoff(attempt: number): Promise<void> {
  const base = 15 * Math.pow(2, attempt);
  const ms = base + Math.floor(Math.random() * 25);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function displayName(identity: VerifiedAppleIdentity): string {
  if (identity.fullName) return identity.fullName;
  const local = identity.email?.split('@')[0]?.trim();
  return local || 'Apple User';
}

function appleIdentityConflict(message: string): ApiError {
  return new ApiError(409, message, true, ErrorCodes.APPLE_IDENTITY_CONFLICT);
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

async function findAppleAccountBySub(tx: Tx, sub: string) {
  return tx.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: APPLE_PROVIDER,
        providerAccountId: sub,
      },
    },
  });
}

/**
 * Backfill only ABSENT values. Apple returns the name at most once per app, and may
 * omit the email on later authorizations, so a null must never clobber stored data.
 */
async function fillMissingProfile(
  tx: Tx,
  userId: string,
  identity: VerifiedAppleIdentity,
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, emailVerified: true },
  });
  if (!user) {
    throw new ApiError(401, 'Invalid Apple token.');
  }

  const data: Prisma.UserUpdateInput = {};
  if (!user.emailVerified && identity.emailVerified) data.emailVerified = true;
  if (!user.name?.trim() && identity.fullName) data.name = identity.fullName;
  if (Object.keys(data).length > 0) {
    await tx.user.update({ where: { id: userId }, data });
  }
}

async function updateAppleAccountMetadata(
  tx: Tx,
  accountId: string,
  identity: VerifiedAppleIdentity,
): Promise<void> {
  // Only overwrite with non-null Apple values so a later authorization that omits the
  // email cannot erase the address captured at first sign-in.
  await tx.authAccount.update({
    where: { id: accountId },
    data: {
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.emailVerified ? { emailVerified: true } : {}),
      ...(identity.fullName ? { displayName: identity.fullName } : {}),
    },
  });
}

async function createAppleAccount(tx: Tx, userId: string, identity: VerifiedAppleIdentity) {
  return tx.authAccount.create({
    data: {
      userId,
      provider: APPLE_PROVIDER,
      providerAccountId: identity.sub,
      email: identity.email,
      emailVerified: identity.emailVerified,
      displayName: identity.fullName,
    },
  });
}

async function resolveInsideTransaction(
  tx: Tx,
  identity: VerifiedAppleIdentity,
): Promise<AppleAccountResolution> {
  // 1. Apple's stable identifier (`sub`) is the only authoritative identity link.
  const linked = await findAppleAccountBySub(tx, identity.sub);
  if (linked) {
    await fillMissingProfile(tx, linked.userId, identity);
    await updateAppleAccountMetadata(tx, linked.id, identity);
    return { userId: linked.userId, created: false, linkedNow: false };
  }

  // 2. Email fallback for first-time Apple sign-in by an existing PalSafar user.
  //    Reached only when the address was verified by Apple's token, or by a one-time
  //    code the server sent to that mailbox. A client-typed address is never verified
  //    on its own, so it cannot hijack an account. Private relay addresses are accepted
  //    as-is: Apple mints them per (Apple ID, app).
  if (identity.email && identity.emailVerified) {
    const existingUserId = await findUserIdByEmail(tx, identity.email);
    if (existingUserId) {
      const otherApple = await tx.authAccount.findFirst({
        where: { userId: existingUserId, provider: APPLE_PROVIDER },
      });
      if (otherApple && otherApple.providerAccountId !== identity.sub) {
        throw appleIdentityConflict(
          'This PalSafar account is already linked to a different Apple ID.',
        );
      }

      try {
        await createAppleAccount(tx, existingUserId, identity);
      } catch (error) {
        // A constraint violation aborts the interactive transaction ? any further query
        // here would raise Postgres 25P02. Re-throw so the retry loop re-resolves against
        // the committed state, where the `sub` lookup finds the winning account.
        if (!isUniqueConflict(error)) throw error;
        throw error;
      }

      await fillMissingProfile(tx, existingUserId, identity);
      return { userId: existingUserId, created: false, linkedNow: true };
    }
  }

  // 3. Brand-new account. `User.email` is required. When the verified token has no
  //    address and no stored Apple account, signal the caller to collect and prove an
  //    email. Do not invent a user here.
  if (!identity.email) {
    throw new ApiError(
      400,
      'Apple did not share an email address for this sign-in.',
      true,
      ErrorCodes.APPLE_EMAIL_REQUIRED,
    );
  }
  if (!identity.emailVerified) {
    throw new ApiError(
      401,
      'Apple did not verify the email address for this sign-in. Please try again.',
    );
  }

  const created = await tx.user.create({
    data: {
      email: identity.email,
      password: null,
      name: displayName(identity),
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    },
    select: { id: true },
  });

  await createAppleAccount(tx, created.id, identity);
  await ensureBaseUserRole(created.id, tx);
  return { userId: created.id, created: true, linkedNow: true };
}

export async function resolveAppleAccount(
  identity: VerifiedAppleIdentity,
  db: { $transaction: typeof prisma.$transaction } = prisma,
): Promise<AppleAccountResolution> {
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
      throw new ApiError(409, 'Could not complete Apple sign-in. Please try again.');
    }
    throw error;
  }
}
