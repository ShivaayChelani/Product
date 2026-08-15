/**
 * Auto-restarting supervisor for resilient factual enrichment.
 * Restarts the pipeline after crashes until completion or max restarts.
 *
 * Usage:
 *   npx ts-node scripts/jobs/run-factual-enrichment-supervisor.ts --source=wikidata --nominatim --link-nearby
 */
import { spawn } from 'child_process';
import path from 'path';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

const MAX_RESTARTS = parseInt(arg('max-restarts', '1000'), 10);
const RESTART_DELAY_MS = parseInt(arg('restart-delay-ms', '5000'), 10);
const passthroughArgs = process.argv.slice(2).filter((a) => !a.startsWith('--max-restarts=') && !a.startsWith('--restart-delay-ms='));

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cwd = path.resolve('.');
  const runnerScript = path.join(cwd, 'scripts/jobs/run-factual-enrichment-all.ts');
  let restarts = 0;

  while (restarts <= MAX_RESTARTS) {
    console.log(JSON.stringify({
      event: 'supervisor_start',
      restart: restarts,
      ts: new Date().toISOString(),
    }));

    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', runnerScript, ...passthroughArgs],
        {
          cwd,
          stdio: 'inherit',
          env: {
            ...process.env,
            TS_NODE_TRANSPILE_ONLY: 'true',
            NODE_NO_WARNINGS: '1',
          },
        },
      );
      child.on('close', (c) => resolve(c));
      child.on('error', () => resolve(1));
    });

    if (code === 0) {
      console.log(JSON.stringify({ event: 'supervisor_complete', restarts }));
      process.exit(0);
    }

    restarts += 1;
    console.error(JSON.stringify({
      event: 'supervisor_restart',
      exitCode: code,
      restart: restarts,
      delayMs: RESTART_DELAY_MS,
    }));
    await sleep(RESTART_DELAY_MS);
  }

  console.error(JSON.stringify({ event: 'supervisor_max_restarts', restarts: MAX_RESTARTS }));
  process.exit(1);
}

main();
