import fs from 'fs';
import path from 'path';
import type { FailedEnrichmentRecord } from './types';

export class FailedEnrichmentQueue {
  private readonly filePath: string;
  private readonly ids = new Set<string>();

  constructor(baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
    this.filePath = path.join(baseDir, 'failed-enrichment-queue.jsonl');
    this.loadExisting();
  }

  private loadExisting() {
    if (!fs.existsSync(this.filePath)) return;
    const lines = fs.readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as FailedEnrichmentRecord;
        if (rec.placeId) this.ids.add(rec.placeId);
      } catch { /* skip bad line */ }
    }
  }

  has(placeId: string): boolean {
    return this.ids.has(placeId);
  }

  size(): number {
    return this.ids.size;
  }

  enqueue(record: FailedEnrichmentRecord) {
    if (this.ids.has(record.placeId)) return;
    this.ids.add(record.placeId);
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  path(): string {
    return this.filePath;
  }
}
