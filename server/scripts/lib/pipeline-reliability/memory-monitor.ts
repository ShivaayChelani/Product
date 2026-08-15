import { performance } from 'perf_hooks';

export type MemorySnapshot = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  eventLoopDelayMs: number;
};

const MB = 1024 * 1024;

export function snapshotMemory(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round(mem.rss / MB),
    heapUsedMb: Math.round(mem.heapUsed / MB),
    heapTotalMb: Math.round(mem.heapTotal / MB),
    externalMb: Math.round(mem.external / MB),
    eventLoopDelayMs: 0,
  };
}

export class EventLoopMonitor {
  private last = performance.now();
  private delayMs = 0;

  tick() {
    const now = performance.now();
    const drift = now - this.last - 100;
    this.delayMs = Math.max(0, Math.round(drift));
    this.last = now;
  }

  delay(): number {
    return this.delayMs;
  }
}

export function maybeGc(thresholdMb = 768): boolean {
  const snap = snapshotMemory();
  if (snap.rssMb < thresholdMb) return false;
  if (typeof global.gc === 'function') {
    global.gc();
    return true;
  }
  return false;
}

export function suggestBatchSize(current: number, snap: MemorySnapshot): number {
  if (snap.rssMb > 1200 || snap.heapUsedMb > 900) return Math.max(1, Math.floor(current / 2));
  if (snap.rssMb < 400 && snap.heapUsedMb < 300 && current < 50) return Math.min(50, current + 5);
  return current;
}
