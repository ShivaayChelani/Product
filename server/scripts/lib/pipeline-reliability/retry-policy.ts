const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /network/i,
  /429/,
  /500/,
  /502/,
  /503/,
  /504/,
  /rate limit/i,
  /too many requests/i,
  /temporarily unavailable/i,
  /connection closed/i,
  /prisma.*connection/i,
  /can't reach database/i,
  /server has closed the connection/i,
];

const PERMANENT_PATTERNS = [
  /validation/i,
  /invalid input/i,
  /malformed/i,
  /parse error/i,
  /syntax error/i,
  /unique constraint/i,
  /foreign key constraint/i,
];

export function isTransientError(err: unknown): boolean {
  const msg = errorMessage(err);
  if (PERMANENT_PATTERNS.some((p) => p.test(msg))) return false;
  if (TRANSIENT_PATTERNS.some((p) => p.test(msg))) return true;
  return false;
}

export function isNativeCrashExit(code: number | null | undefined): boolean {
  if (code == null) return false;
  // Windows ACCESS_VIOLATION, heap corruption, etc.
  if (code === 3221226505 || code === 3221226356 || code === 3221225477) return true;
  // SIGABRT / heap OOM (Unix 134) and Windows equivalents
  if (code === 134 || code === 3221226525) return true;
  if (code === 139) return true; // SIGSEGV
  // Unix signals encoded as exit codes
  if (code > 128 && code < 160) return true;
  return false;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? 'unknown error');
}

export function errorStack(err: unknown): string {
  if (err instanceof Error && err.stack) return err.stack;
  return errorMessage(err);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function exponentialBackoffMs(attempt: number, baseMs = 1000, maxMs = 120_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(500, exp * 0.1));
  return exp + jitter;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; label?: string; onRetry?: (attempt: number, err: unknown) => void },
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientError(err)) throw err;
      opts.onRetry?.(attempt, err);
      await sleep(exponentialBackoffMs(attempt));
    }
  }
  throw lastErr;
}
