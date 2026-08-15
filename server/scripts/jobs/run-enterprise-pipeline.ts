/**
 * Enterprise canonical database pipeline — runs enrichment phases sequentially
 * with checkpoint resume. Never invents data.
 *
 * Usage:
 *   npx ts-node scripts/jobs/run-enterprise-pipeline.ts --phase=all
 *   npx ts-node scripts/jobs/run-enterprise-pipeline.ts --phase=wikidata
 *   npx ts-node scripts/jobs/run-enterprise-pipeline.ts --phase=osm
 *   npx ts-node scripts/jobs/run-enterprise-pipeline.ts --phase=scores
 *   npx ts-node scripts/jobs/run-enterprise-pipeline.ts --phase=report
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { prisma } from '../../src/config/database';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

type Phase = 'dedupe' | 'boundary' | 'external-ids' | 'wikidata' | 'osm' | 'scores' | 'report';

const CHECKPOINT_PATH = path.resolve('reports/ops/enrichment/pipeline-checkpoint.json');

function loadCheckpoint(): { completedPhases: Phase[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedPhases: [] };
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return { completedPhases: [] };
  }
}

function saveCheckpoint(completedPhases: Phase[]) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(
    CHECKPOINT_PATH,
    JSON.stringify({ completedPhases, updatedAt: new Date().toISOString() }, null, 2),
  );
}

function run(cmd: string) {
  console.log(`\n>>> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve('.') });
}

async function runPhase(phase: Phase) {
  switch (phase) {
    case 'dedupe':
      run('npx ts-node scripts/jobs/nightly-duplicate-scan.ts --backfill=5000');
      break;
    case 'boundary':
      run('npx ts-node scripts/jobs/boundary-validation-scan.ts --limit=2000');
      break;
    case 'external-ids':
      run('npx ts-node scripts/jobs/resolve-external-ids.ts --batch-size=50 --limit=2000');
      break;
    case 'wikidata':
      run('npx ts-node scripts/jobs/run-factual-enrichment-supervisor.ts --source=wikidata --nominatim --link-nearby --batch-size=5');
      break;
    case 'osm':
      run('npx ts-node scripts/jobs/run-factual-enrichment-all.ts --source=osm --nominatim --link-nearby --batch-size=50');
      break;
    case 'scores':
      run('npx ts-node scripts/jobs/recalculate-completeness-scores.ts --all --limit=3000');
      break;
    case 'report':
      run('npx ts-node scripts/jobs/enterprise-quality-report.ts');
      break;
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

async function main() {
  const phaseArg = arg('phase', 'all');
  const reset = process.argv.includes('--reset');
  const cp = reset ? { completedPhases: [] as Phase[] } : loadCheckpoint();

  const allPhases: Phase[] = ['dedupe', 'boundary', 'external-ids', 'wikidata', 'osm', 'scores', 'report'];
  const phases: Phase[] = phaseArg === 'all'
    ? allPhases.filter((p) => !cp.completedPhases.includes(p))
    : [phaseArg as Phase];

  console.log(JSON.stringify({ startingPhases: phases, alreadyCompleted: cp.completedPhases }, null, 2));

  for (const phase of phases) {
    console.log(`\n========== PHASE: ${phase} ==========`);
    await runPhase(phase);
    if (phaseArg === 'all') {
      cp.completedPhases.push(phase);
      saveCheckpoint(cp.completedPhases);
    }
  }

  console.log('\nPipeline phase(s) complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
