/**
 * Places corpus backfill — factual metadata only (no invented ratings/images).
 *
 * Phases:
 *   geocode  — Nominatim reverse-geocode for missing city/state
 *   names    — Replace generic Wikidata/OSM labels with specific names when available
 *   report   — Snapshot metrics
 *
 * Usage:
 *   npx ts-node scripts/jobs/places-corpus-backfill.ts --phase=report
 *   npx ts-node scripts/jobs/places-corpus-backfill.ts --phase=geocode --limit=500
 *   npx ts-node scripts/jobs/places-corpus-backfill.ts --phase=names --limit=200
 *   npx ts-node scripts/jobs/places-corpus-backfill.ts --phase=geocode --limit=5000 --resume
 */
import fs from 'fs';
import path from 'path';
import { PlaceAliasType } from '@prisma/client';
import { prisma } from '../../src/config/database';
import { normalizeForMatch } from '../../src/shared/utils/canonicalText';
import { reverseGeocodeNominatim } from '../lib/osm-nominatim-client';
import { resolveEntityLabels } from '../lib/wikidata-client';

const CHECKPOINT_PATH = path.resolve('reports/ops/places-backfill-checkpoint.json');
const REPORT_DIR = path.resolve('reports/ops');

type Checkpoint = {
  geocodeLastId?: string;
  namesLastId?: string;
  geocodeUpdated?: number;
  namesUpdated?: number;
};

const GENERIC_NAME_LIST = [
  'ancient mound',
  'ancient caves',
  'ancient cave',
  'ancient temple',
  'ancient fort',
  'ancient ruins',
  'historical place',
  'archaeological site',
  'heritage site',
  'ruins',
  'cave temple',
  'rock cut temple',
  'old fort',
  'old temple',
  'temple',
  'fort',
  'monument',
  'mosque',
  'church',
  'mound',
  'mandir',
  'masjid',
];

const GENERIC_NAME_PATTERNS = GENERIC_NAME_LIST.map(
  (n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
);

function parseArgs() {
  const phase = (process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || 'report') as
    | 'geocode'
    | 'names'
    | 'report';
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1] || '100', 10)) : 100;
  const dryRun = process.argv.includes('--dry-run');
  const resume = process.argv.includes('--resume');
  return { phase, limit, dryRun, resume };
}

function loadCheckpoint(): Checkpoint {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

export function isGenericPlaceName(name: string): boolean {
  const n = String(name || '').trim();
  if (n.length < 3) return true;
  if (GENERIC_NAME_PATTERNS.some((re) => re.test(n))) return true;
  if (/^(temple|fort|monument|mosque|church|caves?|mound|palace|gate|tower|lake|hill)$/i.test(n)) return true;
  return false;
}

function parseWikidataQid(externalId: string | null): string | null {
  if (!externalId) return null;
  const m = externalId.match(/(?:wikidata:)?(Q\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

function pickBetterName(current: string, candidates: (string | undefined | null)[]): string | null {
  const cur = current.trim();
  for (const raw of candidates) {
    const t = String(raw || '').trim();
    if (t.length < 4) continue;
    if (t.toLowerCase() === cur.toLowerCase()) continue;
    if (isGenericPlaceName(t)) continue;
    // Prefer names that add specificity (longer, or contain a comma / " at ")
    if (t.length > cur.length || /[,]| at | near | in /i.test(t)) {
      return t.replace(/_/g, ' ');
    }
  }
  return null;
}

async function slugForName(name: string, placeId: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'place';
  let candidate = base;
  let n = 0;
  while (n < 50) {
    const existing = await prisma.place.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === placeId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${placeId.slice(-6)}`;
}

async function runReport(): Promise<void> {
  const active = { mergedIntoId: null, status: 'APPROVED' as const };
  const total = await prisma.place.count({ where: active });
  const noCity = await prisma.place.count({ where: { ...active, city: '' } });
  const noState = await prisma.place.count({ where: { ...active, state: '' } });
  const noRating = await prisma.place.count({ where: { ...active, rating: null } });
  const genericRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM places
    WHERE merged_into_id IS NULL AND status = 'APPROVED'
      AND (
        LOWER(TRIM(name)) IN (
          'ancient mound', 'ancient caves', 'ancient cave', 'ancient temple', 'ancient fort',
          'historical place', 'archaeological site', 'heritage site', 'ruins', 'cave temple',
          'temple', 'fort', 'monument', 'mosque', 'church', 'mound', 'mandir', 'masjid'
        )
      )
  `;

  const report = {
    timestamp: new Date().toISOString(),
    total,
    noCity,
    noState,
    noRating,
    pctMissingCity: total ? ((noCity / total) * 100).toFixed(1) : '0',
    pctMissingState: total ? ((noState / total) * 100).toFixed(1) : '0',
    genericNameCount: Number(genericRows[0]?.count ?? 0),
    checkpoint: loadCheckpoint(),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, `places-corpus-backfill-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written: ${outPath}`);
}

async function runGeocode(limit: number, dryRun: boolean, resume: boolean): Promise<void> {
  const cp = loadCheckpoint();
  const cursor = resume ? cp.geocodeLastId : undefined;

  const rows = await prisma.place.findMany({
    where: {
      mergedIntoId: null,
      status: 'APPROVED',
      latitude: { not: null },
      longitude: { not: null },
      OR: [{ city: '' }, { state: '' }],
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: { id: true, latitude: true, longitude: true, city: true, state: true, tags: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

  console.log(`Geocoding ${rows.length} places (limit ${limit}, dryRun=${dryRun})...`);
  let updated = 0;
  let skipped = 0;

  for (const r of rows) {
    if (r.latitude == null || r.longitude == null) continue;
    const geo = await reverseGeocodeNominatim(r.latitude, r.longitude);
    if (!geo) {
      skipped += 1;
      cp.geocodeLastId = r.id;
      continue;
    }

    const city = r.city || geo.city || geo.village || '';
    const state = r.state || geo.state || '';
    if (!city && !state) {
      skipped += 1;
      cp.geocodeLastId = r.id;
      continue;
    }

    const newTags = [
      ...new Set([
        ...(r.tags || []),
        ...(city ? [city.toLowerCase().replace(/\s+/g, '-')] : []),
        ...(state ? [state.toLowerCase().replace(/\s+/g, '-')] : []),
      ]),
    ];

    if (!dryRun) {
      await prisma.place.update({
        where: { id: r.id },
        data: { city: city || r.city, state: state || r.state, tags: newTags },
      });
    }
    updated += 1;
    cp.geocodeLastId = r.id;
    cp.geocodeUpdated = (cp.geocodeUpdated || 0) + (dryRun ? 0 : 1);

    if (updated % 25 === 0) {
      saveCheckpoint(cp);
      console.log(`  geocoded ${updated}/${rows.length} (skipped ${skipped})`);
    }
  }

  saveCheckpoint(cp);
  console.log(`Geocode phase done: updated=${updated}, skipped=${skipped}, dryRun=${dryRun}`);
}

async function runNames(limit: number, dryRun: boolean, resume: boolean): Promise<void> {
  const cp = loadCheckpoint();
  const cursor = resume ? cp.namesLastId : undefined;

  const rows = await prisma.place.findMany({
    where: {
      mergedIntoId: null,
      status: 'APPROVED',
      OR: GENERIC_NAME_LIST.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: { id: true, name: true, slug: true, externalId: true, source: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

  const targets = rows;
  console.log(`Name resolution: ${targets.length} generic names (limit ${limit}, dryRun=${dryRun})`);

  const qids = targets.map((t) => parseWikidataQid(t.externalId)).filter(Boolean) as string[];
  const labelMap = await resolveEntityLabels(qids);

  let updated = 0;
  for (const place of targets) {
    const qid = parseWikidataQid(place.externalId);
    const wdLabel = qid ? labelMap.get(qid) : undefined;

    let osmName: string | undefined;
    if (place.externalId?.startsWith('osm:')) {
      const parsed = place.externalId.match(/^osm:(node|way|relation)[/:](\d+)$/i);
      if (parsed) {
        try {
          const res = await fetch(`https://api.openstreetmap.org/api/0.6/${parsed[1]}/${parsed[2]}.json`, {
            headers: { 'User-Agent': 'PalSafar-PlacesBackfill/1.0' },
          });
          if (res.ok) {
            const json = (await res.json()) as { elements?: { tags?: { name?: string } }[] };
            osmName = json.elements?.[0]?.tags?.name;
          }
          await res.body?.cancel?.().catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
    }

    const better = pickBetterName(place.name, [osmName, wdLabel]);
    if (!better) {
      cp.namesLastId = place.id;
      continue;
    }

    if (!dryRun) {
      const newSlug = await slugForName(better, place.id);
      await prisma.$transaction(async (tx) => {
        await tx.place.update({
          where: { id: place.id },
          data: { name: better, slug: newSlug },
        });
        await tx.placeAlias.upsert({
          where: {
            placeId_normalizedAlias: {
              placeId: place.id,
              normalizedAlias: normalizeForMatch(place.name),
            },
          },
          create: {
            placeId: place.id,
            alias: place.name,
            normalizedAlias: normalizeForMatch(place.name),
            aliasType: PlaceAliasType.SEARCH_KEYWORD,
            source: 'backfill',
          },
          update: {},
        });
      });
    }

    updated += 1;
    cp.namesLastId = place.id;
    cp.namesUpdated = (cp.namesUpdated || 0) + (dryRun ? 0 : 1);
    console.log(`  ${place.name} → ${better}${dryRun ? ' (dry-run)' : ''}`);
  }

  saveCheckpoint(cp);
  console.log(`Names phase done: updated=${updated}, dryRun=${dryRun}`);
}

async function main() {
  const { phase, limit, dryRun, resume } = parseArgs();
  if (phase === 'report') {
    await runReport();
    return;
  }
  if (phase === 'geocode') {
    await runGeocode(limit, dryRun, resume);
    return;
  }
  if (phase === 'names') {
    await runNames(limit, dryRun, resume);
    return;
  }
  throw new Error(`Unknown phase: ${phase}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
