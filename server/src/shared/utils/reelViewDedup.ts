/**
 * Durable, race-safe "has this viewer already been counted for this reel?"
 * decision.
 *
 * Kept in its own module so the rule can be unit tested without a database and
 * so the transactional write in socialService stays readable.
 */

export const UNIQUE_VIOLATION_PRISMA_CODE = 'P2002';
export const UNIQUE_VIOLATION_PG_CODE = '23505';

/** Prisma surfaces a raw Postgres 23505 as P2002; guard both shapes. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === UNIQUE_VIOLATION_PRISMA_CODE || code === UNIQUE_VIOLATION_PG_CODE) return true;
  const meta = (err as { meta?: { code?: unknown } } | null)?.meta;
  if (meta?.code != null && String(meta.code) === UNIQUE_VIOLATION_PG_CODE) return true;
  // Wrapped errors surface the SQLSTATE on the cause chain.
  let cause = (err as { cause?: unknown } | null)?.cause;
  const seen = new Set<unknown>();
  while (cause && !seen.has(cause)) {
    seen.add(cause);
    if ((cause as { code?: unknown }).code === UNIQUE_VIOLATION_PG_CODE) return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

export type UniqueViewOutcome = 'counted' | 'duplicate' | 'owner';

export type UniqueViewDecision<T> = {
  /** True only when the public counter was actually incremented. */
  counted: boolean;
  outcome: UniqueViewOutcome;
  result: T;
};

/**
 * Decide what should happen to a view signal, and apply it.
 *
 * - `claimUniqueViewer` performs the whole durable write in one transaction:
 *   insert the (reelId, userId) row and bump the public counter. It must
 *   propagate a unique violation when this viewer has already been counted —
 *   Postgres then blocks the losing transaction until the winner commits, so
 *   exactly one increment ever happens no matter how many requests race.
 * - `readCurrent` returns the reel's current counter, used when nothing is
 *   counted so every response has the same shape.
 */
export async function recordUniqueView<T>(params: {
  isOwner: boolean;
  claimUniqueViewer: () => Promise<T>;
  readCurrent: () => Promise<T>;
}): Promise<UniqueViewDecision<T>> {
  if (params.isOwner) {
    // Owner views must never inflate the public count.
    return { counted: false, outcome: 'owner', result: await params.readCurrent() };
  }

  try {
    return { counted: true, outcome: 'counted', result: await params.claimUniqueViewer() };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { counted: false, outcome: 'duplicate', result: await params.readCurrent() };
    }
    throw err;
  }
}
