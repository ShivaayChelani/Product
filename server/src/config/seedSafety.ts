const KNOWN_PRODUCTION_DB_HOSTS = new Set([
  'ep-sweet-morning-az9jhg9t-pooler.c-3.ap-southeast-1.aws.neon.tech',
  'ep-sweet-morning-az9jhg9t.c-3.ap-southeast-1.aws.neon.tech',
  'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com',
]);

function databaseHostname(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isProductionDatabaseTarget(env: NodeJS.ProcessEnv = process.env): boolean {
  const hostname = databaseHostname(env);
  if (!hostname) return false;
  if (KNOWN_PRODUCTION_DB_HOSTS.has(hostname)) return true;
  return hostname.endsWith('.neon.tech');
}

/** Synthetic credential sync / demo seeds must not run against production from a local/dev process. */
export function assertSyntheticSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') return;
  if (isProductionDatabaseTarget(env)) {
    throw new Error(
      'Refusing synthetic seed/credential sync: DATABASE_URL points at a production host.',
    );
  }
}

/**
 * Startup seed / cleanup must never wipe production without a second confirm.
 * PRUNE_EXTRA_USERS alone is not enough — that flag has existed on disposable DBs.
 */
export function assertDestructivePruneAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (isProductionDatabaseTarget(env) && env.NODE_ENV !== 'production') {
    throw new Error(
      'Refusing PRUNE_EXTRA_USERS: DATABASE_URL points at a production host from a non-production process.',
    );
  }
  if (env.NODE_ENV === 'production' && env.CONFIRM_PRODUCTION_PRUNE !== '1') {
    throw new Error(
      'Refusing PRUNE_EXTRA_USERS in production without CONFIRM_PRODUCTION_PRUNE=1.',
    );
  }
}

export function assertNullIslandCleanupAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && env.CONFIRM_PRODUCTION_CLEANUP !== '1') {
    throw new Error(
      'Refusing CLEANUP_NULL_ISLAND_PLACES in production without CONFIRM_PRODUCTION_CLEANUP=1.',
    );
  }
}
