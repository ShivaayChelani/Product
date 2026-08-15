import { spawn } from 'child_process';
import path from 'path';
import type { PlaceWorkerResult } from './types';
import { isNativeCrashExit } from './retry-policy';

const WORKER_SCRIPT = path.resolve(__dirname, '../../jobs/factual-enrichment-place-worker.ts');

export type WorkerOptions = {
  placeId: string;
  dryRun: boolean;
  linkNearby: boolean;
  nominatim: boolean;
  recalcScores: boolean;
  timeoutMs?: number;
  cwd: string;
};

export function runPlaceWorker(opts: WorkerOptions): Promise<PlaceWorkerResult> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const workerArgs = [
    `--place-id=${opts.placeId}`,
    ...(opts.dryRun ? ['--dry-run'] : []),
    ...(opts.linkNearby ? ['--link-nearby'] : []),
    ...(opts.nominatim ? ['--nominatim'] : []),
    ...(opts.recalcScores ? ['--recalc-scores'] : []),
  ];

  // Direct node + ts-node/register avoids npx shell overhead and reduces OOM crashes
  const nodeArgs = [
    '--max-old-space-size=768',
    '-r',
    'ts-node/register/transpile-only',
    WORKER_SCRIPT,
    ...workerArgs,
  ];

  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(process.execPath, nodeArgs, {
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
      resolve({
        ok: false,
        placeId: opts.placeId,
        name: '',
        externalId: null,
        source: '',
        enriched: false,
        errorCount: 1,
        errors: [`Worker timeout after ${timeoutMs}ms`],
        manualReviewReasons: [],
        durationMs: Date.now() - started,
        filledFields: [],
        crashed: false,
      });
    }, timeoutMs);

    child.stdout?.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr?.on('data', (buf) => { stderr += buf.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - started;

      const resultLine = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .reverse()
        .find((l) => l.startsWith('{') && l.includes('"ok"'));

      if (resultLine) {
        try {
          const parsed = JSON.parse(resultLine) as PlaceWorkerResult;
          resolve({ ...parsed, durationMs, exitCode: code ?? undefined });
          return;
        } catch { /* fall through */ }
      }

      const crashed = isNativeCrashExit(code ?? undefined);
      resolve({
        ok: false,
        placeId: opts.placeId,
        name: '',
        externalId: null,
        source: '',
        enriched: false,
        errorCount: 1,
        errors: [
          crashed
            ? `Native worker crash (exit ${code})`
            : stderr.trim() || stdout.trim() || `Worker exited with code ${code}`,
        ],
        manualReviewReasons: [],
        durationMs,
        filledFields: [],
        exitCode: code ?? undefined,
        crashed,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        placeId: opts.placeId,
        name: '',
        externalId: null,
        source: '',
        enriched: false,
        errorCount: 1,
        errors: [err.message],
        manualReviewReasons: [],
        durationMs: Date.now() - started,
        filledFields: [],
      });
    });
  });
}
