/**
 * Lightweight performance benchmarks for canonical subsystems (stdout JSON).
 * Usage: npx ts-node scripts/benchmarks/canonical-bench.ts
 */
import { performance } from 'perf_hooks';
import { scoreDuplicatePair } from '../../src/modules/canonical/services/duplicate-scoring.service';
import { comparePlacesInBlock } from '../../src/modules/canonical/services/duplicate-scan.service';
import { boundaryDatasetProvider } from '../../src/modules/canonical/services/boundary-dataset.provider';
import { hybridSearchService } from '../../src/modules/canonical/services/hybrid-search.service';

async function bench(name: string, fn: () => Promise<void> | void) {
  const start = performance.now();
  await fn();
  return { name, ms: Math.round((performance.now() - start) * 100) / 100 };
}

async function main() {
  const samplePlaces = Array.from({ length: 24 }).map((_, i) => ({
    id: `p${i}`,
    name: i % 3 === 0 ? 'Bhedaghat' : `Place ${i}`,
    latitude: 23.1324 + i * 0.0001,
    longitude: 79.8043 + i * 0.0001,
    state: 'Madhya Pradesh',
    district: 'Jabalpur',
    category: 'ghat',
    aliases: [{ alias: 'Marble Rocks' }],
  }));

  const results = await Promise.all([
    bench('duplicate_scoring_pair', () => {
      scoreDuplicatePair({
        nameA: 'Bhedaghat',
        nameB: 'Bheda Ghat',
        latA: 23.1324,
        lngA: 79.8043,
        latB: 23.1325,
        lngB: 79.8044,
        stateA: 'Madhya Pradesh',
        stateB: 'Madhya Pradesh',
      });
    }),
    bench('duplicate_block_compare_24', async () => {
      await comparePlacesInBlock(samplePlaces);
    }),
    bench('boundary_resolve_bbox_only', () => {
      boundaryDatasetProvider.resolveAdministrative(77.2, 28.6, 'Delhi', 'New Delhi');
    }),
    bench('hybrid_search_lexical', async () => {
      try {
        await hybridSearchService.search('bhedaghat', 10);
      } catch {
        // DB may be unavailable in bench-only contexts
      }
    }),
  ]);

  console.log(JSON.stringify({ benchmark: 'canonical', results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
