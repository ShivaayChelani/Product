import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
} from '@prisma/client/runtime/library';

/** Prisma + Node infra errors that may succeed on retry — never assertion failures. */
const RETRYABLE_ERROR_CODES = new Set(['P1017', 'P1001', 'P1008', 'P1011']);

const RETRYABLE_ERROR_MESSAGES = [
  'Response from the Engine was empty',
  'Connection pool timeout',
  "Can't reach database",
  'Server has closed the connection',
  'ECONNRESET',
  'socket hang up',
  'connection reset',
  'Connection reset by peer',
  'Connection terminated unexpectedly',
];

function messageIndicatesTransient(err: unknown): boolean {
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
    const code = (err as NodeJS.ErrnoException).code;
    if (code) parts.push(code);
  }
  if (err instanceof PrismaClientKnownRequestError) {
    parts.push(err.code);
    parts.push(err.message);
  }
  const haystack = parts.join(' ').toLowerCase();
  return RETRYABLE_ERROR_MESSAGES.some((msg) => haystack.includes(msg.toLowerCase()));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof PrismaClientKnownRequestError && RETRYABLE_ERROR_CODES.has(err.code)) {
    return true;
  }
  if (messageIndicatesTransient(err)) {
    return true;
  }
  if (err instanceof PrismaClientUnknownRequestError || err instanceof PrismaClientRustPanicError) {
    return messageIndicatesTransient(err);
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries || !isRetryableError(err)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
