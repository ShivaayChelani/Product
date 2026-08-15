import { sleep } from './retry-policy';

export class AdaptiveRateLimiter {
  private delayMs: number;
  private readonly minMs: number;
  private readonly maxMs: number;

  constructor(initialMs = 0, minMs = 0, maxMs = 5000) {
    this.delayMs = initialMs;
    this.minMs = minMs;
    this.maxMs = maxMs;
  }

  async wait() {
    if (this.delayMs > 0) await sleep(this.delayMs);
  }

  onSuccess() {
    if (this.delayMs > this.minMs) {
      this.delayMs = Math.max(this.minMs, Math.floor(this.delayMs * 0.9));
    }
  }

  onRateLimit(retryAfterSec?: number) {
    if (retryAfterSec && retryAfterSec > 0) {
      this.delayMs = Math.min(this.maxMs, retryAfterSec * 1000);
      return;
    }
    this.delayMs = Math.min(this.maxMs, Math.max(500, this.delayMs * 2 || 1000));
  }

  onConnectionRefused() {
    this.delayMs = Math.min(this.maxMs, Math.max(1000, this.delayMs * 2 || 2000));
  }

  currentDelayMs(): number {
    return this.delayMs;
  }
}

export function parseRetryAfterMs(errMsg: string): number | undefined {
  const m = errMsg.match(/retry[- ]after[:\s]+(\d+)/i);
  if (m) return parseInt(m[1], 10) * 1000;
  if (/429|too many requests/i.test(errMsg)) return 2000;
  return undefined;
}
