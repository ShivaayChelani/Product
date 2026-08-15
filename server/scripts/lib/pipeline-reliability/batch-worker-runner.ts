import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { BatchWorkerResult, PlaceWorkerResult } from './types';
import { isNativeCrashExit } from './retry-policy';

const BATCH_WORKER_SCRIPT = path.resolve(__dirname, '../../jobs/factual-enrichment-batch-worker.ts');

export type BatchWorkerOptions = {
  placeIds: string[];
  dryRun: boolean;
  linkNearby: boolean;
  nominatim: boolean;
  recalcScores: boolean;
  cwd: string;
  workerId: string;
  rssLimitMb?: number;
  heapLimitMb?: number;
  timeoutMs?: number;
};

function parseBatchOutput(stdout: string): BatchWorkerResult | null {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.startsWith('BATCH_RESULT:'));

  if (!line) return null;
  try {
    return JSON.parse(line.slice('BATCH_RESULT:'.length)) as BatchWorkerResult;
  } catch {
    return null;
  }
}

function loadPartialResults(outputPath: string): PlaceWorkerResult[] {
  if (!fs.existsSync(outputPath)) return [];
  try {
    const raw = fs.readFileSync(outputPath, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as PlaceWorkerResult);
  } catch {
    return [];
  }
}

export function runBatchWorker(opts: BatchWorkerOptions): Promise<BatchWorkerResult> {
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const outputPath = path.join(
    opts.cwd,
    'reports/ops/enrichment/worker-output',
    `${opts.workerId}.jsonl`,
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const workerArgs = [
    '--expose-gc',
    '--max-old-space-size=768',
    '-r',
    'ts-node/register/transpile-only',
    BATCH_WORKER_SCRIPT,
    `--place-ids=${opts.placeIds.join(',')}`,
    `--worker-id=${opts.workerId}`,
    `--output-file=${outputPath}`,
    ...(opts.dryRun ? ['--dry-run'] : []),
    ...(opts.linkNearby ? ['--link-nearby'] : []),
    ...(opts.nominatim ? ['--nominatim'] : []),
    ...(opts.recalcScores ? ['--recalc-scores'] : []),
    ...(opts.rssLimitMb ? [`--rss-limit-mb=${opts.rssLimitMb}`] : []),
    ...(opts.heapLimitMb ? [`--heap-limit-mb=${opts.heapLimitMb}`] : []),
  ];

  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(process.execPath, workerArgs, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PALSAFAR_PIPELINE_WORKER: '1',
        TS_NODE_TRANSPILE_ONLY: 'true',
        NODE_NO_WARNINGS: '1',
      },
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      const partial = loadPartialResults(outputPath);
      resolve({
        ok: false,
        workerId: opts.workerId,
        crashed: false,
        exitCode: null,
        durationMs: Date.now() - started,
        results: partial,
        placesProcessed: partial.length,
        placesRequested: opts.placeIds.length,
        stoppedEarly: partial.length > 0,
        stopReason: `Worker timeout after ${timeoutMs}ms`,
        memory: {},
      });
    }, timeoutMs);

    child.stdout?.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr?.on('data', (buf) => { stderr += buf.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const parsed = parseBatchOutput(stdout);
      const partial = parsed?.results?.length
        ? parsed.results
        : loadPartialResults(outputPath);

      if (parsed) {
        resolve({ ...parsed, durationMs, exitCode: code ?? undefined });
        return;
      }

      const crashed = isNativeCrashExit(code ?? undefined);
      resolve({
        ok: !crashed && partial.every((r) => r.ok),
        workerId: opts.workerId,
        crashed,
        exitCode: code ?? undefined,
        durationMs,
        results: partial,
        placesProcessed: partial.length,
        placesRequested: opts.placeIds.length,
        stoppedEarly: partial.length < opts.placeIds.length,
        stopReason: crashed
          ? `Native worker crash (exit ${code})`
          : stderr.trim() || stdout.trim() || `Worker exited with code ${code}`,
        memory: {},
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        workerId: opts.workerId,
        crashed: false,
        exitCode: null,
        durationMs: Date.now() - started,
        results: loadPartialResults(outputPath),
        placesProcessed: 0,
        placesRequested: opts.placeIds.length,
        stoppedEarly: false,
        stopReason: err.message,
        memory: {},
      });
    });
  });
}
