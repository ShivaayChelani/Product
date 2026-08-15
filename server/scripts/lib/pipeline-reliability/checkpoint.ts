import fs from 'fs';
import path from 'path';
import type { PipelineCheckpointV2, PipelineSource } from './types';

function atomicWrite(filePath: string, data: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function checkpointPath(source: PipelineSource, baseDir: string): string {
  return path.join(baseDir, `checkpoint-${source}.json`);
}

export function defaultCheckpoint(source: PipelineSource): PipelineCheckpointV2 {
  return {
    version: 2,
    source,
    offset: 0,
    lastPlaceId: null,
    lastExternalId: null,
    batchNumber: 0,
    retryCount: 0,
    processed: 0,
    enriched: 0,
    errors: 0,
    skipped: 0,
    failedQueueSize: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function loadCheckpoint(
  source: PipelineSource,
  baseDir: string,
): PipelineCheckpointV2 {
  const filePath = checkpointPath(source, baseDir);
  if (!fs.existsSync(filePath)) return defaultCheckpoint(source);

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PipelineCheckpointV2> & { offset?: number };
    if (raw.version === 2) {
      return { ...defaultCheckpoint(source), ...raw, version: 2, source };
    }
    // Migrate v1 { offset, source, updatedAt }
    return {
      ...defaultCheckpoint(source),
      offset: Number(raw.offset ?? 0),
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      source,
    };
  } catch (err) {
    const corruptPath = `${filePath}.corrupt-${Date.now()}.json`;
    try {
      fs.copyFileSync(filePath, corruptPath);
    } catch { /* ignore */ }
    console.error(JSON.stringify({
      level: 'error',
      event: 'checkpoint_corrupt',
      filePath,
      backup: corruptPath,
      error: (err as Error).message,
    }));
    return defaultCheckpoint(source);
  }
}

export function saveCheckpoint(cp: PipelineCheckpointV2, baseDir: string) {
  const filePath = checkpointPath(cp.source, baseDir);
  cp.updatedAt = new Date().toISOString();
  atomicWrite(filePath, JSON.stringify(cp, null, 2));
}
