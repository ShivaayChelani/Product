import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { snapshotMemory, type MemorySnapshot } from './memory-monitor';

export type MemoryTimelineEntry = MemorySnapshot & {
  ts: string;
  label: string;
  placeId?: string;
  arrayBuffersMb?: number;
};

export class MemoryTracker {
  private peakRssMb = 0;
  private peakHeapMb = 0;
  private timeline: MemoryTimelineEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
  }

  sample(label: string, placeId?: string): MemorySnapshot {
    const mem = process.memoryUsage();
    const snap: MemoryTimelineEntry = {
      ...snapshotMemory(),
      ts: new Date().toISOString(),
      label,
      placeId,
      arrayBuffersMb: Math.round((mem.arrayBuffers ?? 0) / (1024 * 1024)),
    };
    this.peakRssMb = Math.max(this.peakRssMb, snap.rssMb);
    this.peakHeapMb = Math.max(this.peakHeapMb, snap.heapUsedMb);
    this.timeline.push(snap);
    if (this.timeline.length > this.maxEntries) {
      this.timeline.shift();
    }
    return snap;
  }

  exceedsThreshold(rssMb: number, heapMb: number): boolean {
    const s = snapshotMemory();
    return s.rssMb >= rssMb || s.heapUsedMb >= heapMb;
  }

  peaks() {
    return { peakRssMb: this.peakRssMb, peakHeapMb: this.peakHeapMb };
  }

  writeTimeline(outDir: string, workerId: string) {
    fs.mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, `memory-timeline-${workerId}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          workerId,
          peaks: this.peaks(),
          entries: this.timeline,
        },
        null,
        2,
      ),
    );
    return filePath;
  }
}

export class EventLoopLagMonitor {
  private last = performance.now();
  private maxLagMs = 0;

  tick() {
    const now = performance.now();
    const lag = Math.max(0, now - this.last - 100);
    this.maxLagMs = Math.max(this.maxLagMs, Math.round(lag));
    this.last = now;
  }

  maxLag(): number {
    return this.maxLagMs;
  }
}
