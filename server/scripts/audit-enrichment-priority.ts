/**
 * P2: Build the itinerary-relevant enrichment priority list.
 * Ranks places by how often the real engine selected them across all audit
 * artifacts (before + after), then attaches their current metadata gaps so the
 * EXISTING factual-enrichment jobs can be pointed at the highest-impact rows.
 * READ-ONLY against the database.
 * Usage: npx ts-node scripts/audit-enrichment-priority.ts [topN=200]
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';

const OUT_DIR = path.resolve('reports/audit');
const BEFORE_DIR = path.resolve('reports/audit-before');

async function main() {
  const topN = parseInt(process.argv[3] || process.argv[2] || '200', 10) || 200;
  const frequency = new Map<string, { name: string; count: number; scenarios: Set<string> }>();

  const dirs = [BEFORE_DIR, OUT_DIR].filter((d) => fs.existsSync(d));
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      let art: any;
      try { art = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
      const days = Array.isArray(art?.days) ? art.days : Array.isArray(art?.[0]?.names) ? [] : [];
      if (!days.length && art?.scenario === undefined) continue;
      const scenario = String(art.scenario ?? f);
      for (const day of days) {
        for (const s of day.stops || []) {
          if (!s.placeId) continue;
          const cur = frequency.get(s.placeId) || { name: s.place, count: 0, scenarios: new Set<string>() };
          cur.count++;
          cur.scenarios.add(scenario);
          frequency.set(s.placeId, cur);
        }
      }
    }
  }

  const ranked = [...frequency.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`places observed across audit runs: ${ranked.length}`);

  const ids = ranked.slice(0, topN).map(([id]) => id);
  const dbRows = await prisma.place.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, city: true, category: true,
      rating: true, reviewCount: true, estimatedDurationMinutes: true,
      recommendedDuration: true, popularityScore: true, openingHours: true, ticketPrice: true,
    },
  });
  const byId = new Map(dbRows.map((r) => [r.id, r]));

  const list = ranked.slice(0, topN).map(([id, f], idx) => {
    const row = byId.get(id);
    const hoursRaw = row?.openingHours as Record<string, unknown> | null | undefined;
    const windows = hoursRaw ? (Object.values(hoursRaw).flat() as Array<any>) : [];
    const hoursMalformed = !windows.length
      || windows.some((w) => typeof w !== 'object' || !w || typeof w.open !== 'string' || w.open === w.close);
    return {
      priorityRank: idx + 1,
      placeId: id,
      name: f.name || row?.name,
      city: row?.city,
      category: row?.category,
      selectedCount: f.count,
      distinctScenarios: f.scenarios.size,
      missing: {
        rating: row ? row.rating == null : 'NOT_IN_DB',
        reviews: row ? row.reviewCount === 0 : 'NOT_IN_DB',
        visitDuration: row ? row.estimatedDurationMinutes == null && !row.recommendedDuration : 'NOT_IN_DB',
        popularityScore: row ? row.popularityScore == null : 'NOT_IN_DB',
        openingHoursReliable: row ? !hoursMalformed : 'NOT_IN_DB',
      },
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'enrichment-priority-list.json');
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    method: 'selection frequency across real aiGenerate audit artifacts (before+after fixes)',
    totalRanked: ranked.length,
    items: list,
  }, null, 2));

  console.log(`wrote ${list.length} priority rows -> ${outPath}`);
  console.log('top 10:');
  for (const it of list.slice(0, 10)) {
    console.log(`  #${it.priorityRank} ${String(it.name).padEnd(42)} selected=${it.selectedCount} scenarios=${it.distinctScenarios}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
