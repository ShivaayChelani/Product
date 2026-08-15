/**
 * LEGACY bulk loader — imports raw OSM/Wikidata JSON as DRAFT rows (no synthetic ratings).
 * For production canonical records use: npm run db:canonical:ingest -- prisma/seed-data/canonical/<file>.json
 *
 * Usage (from server/):
 *   npm run db:import:india
 *   npm run db:import:india -- --dry-run --limit=500
 */
import { PrismaClient, PlaceSource, PlaceStatus, PlaceDataQuality } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SEED_DIR = path.join(__dirname, '..', 'prisma', 'seed-data');
const BATCH_SIZE = 400;

type SourceKey = 'curated' | 'supplement' | 'wikidata' | 'osm' | 'osm-missing';

const SOURCE_FILES: Record<SourceKey, { file: string; placeSource: PlaceSource }> = {
  curated: { file: 'places-curated.json', placeSource: PlaceSource.CURATED },
  supplement: { file: 'places-supplement.json', placeSource: PlaceSource.CURATED },
  wikidata: { file: 'places-wikidata.json', placeSource: PlaceSource.WIKIMEDIA },
  osm: { file: 'osm-places.json', placeSource: PlaceSource.OSM },
  'osm-missing': { file: 'osm-places-missing.json', placeSource: PlaceSource.OSM },
};

const DEFAULT_SOURCES: SourceKey[] = ['curated', 'supplement', 'wikidata', 'osm', 'osm-missing'];

const CATEGORY_RATING_BASE: Record<string, number> = {
  monument: 4.2,
  fort: 4.2,
  palace: 4.3,
  temple: 4.1,
  mosque: 4.1,
  church: 4.0,
  gurudwara: 4.1,
  waterfall: 4.3,
  beach: 4.2,
  lake: 4.0,
  park: 3.9,
  museum: 4.1,
  trek: 4.2,
  ghat: 4.1,
  market: 3.8,
  adventure: 4.0,
  heritage: 4.1,
  other: 3.8,
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100) || 'place';
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const backfillRatings = process.argv.includes('--backfill-ratings');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1] || '0', 10)) : undefined;
  const sourcesArg = process.argv.find((a) => a.startsWith('--sources='));
  const sources = sourcesArg
    ? (sourcesArg.split('=')[1]?.split(',').filter(Boolean) as SourceKey[])
    : DEFAULT_SOURCES;
  return { dryRun, limit, sources, backfillRatings };
}

function stableJitter(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ((h % 40) / 100); // 0.00 – 0.39
}

function roundRating(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
}

function deriveRatingFromCategory(name: string, category?: string | null): number {
  const cat = (category || 'other').toLowerCase();
  const base = CATEGORY_RATING_BASE[cat] ?? CATEGORY_RATING_BASE.other;
  return roundRating(base + stableJitter(name));
}

async function backfillMissingRatings(dryRun: boolean) {
  if (process.env.ALLOW_SYNTHETIC_RATINGS !== 'true') {
    console.error(
      'Refusing synthetic ratings. Ratings must come from verified reviews. ' +
        'Set ALLOW_SYNTHETIC_RATINGS=true only for non-production experiments.',
    );
    process.exit(1);
  }
  const batchSize = 500;
  const parallel = 40;
  let cursor: string | undefined;
  let updated = 0;

  for (;;) {
    const rows = await prisma.place.findMany({
      where: { rating: null },
      select: { id: true, name: true, category: true },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;

    if (!dryRun) {
      for (let i = 0; i < rows.length; i += parallel) {
        const chunk = rows.slice(i, i + parallel);
        await Promise.all(
          chunk.map((r) => {
            const rating = deriveRatingFromCategory(r.name, r.category);
            return prisma.place.update({
              where: { id: r.id },
              data: { rating, popularityScore: Math.round(rating * 10) },
            });
          }),
        );
      }
    }
    updated += rows.length;
    cursor = rows[rows.length - 1].id;
    console.log(`Backfill progress: ${updated} places${dryRun ? ' (dry-run)' : ''}`);
    if (rows.length < batchSize) break;
  }

  console.log(`Backfill complete: ${updated} places${dryRun ? ' would be updated' : ' updated'}.`);
}

function deriveOsmRating(p: {
  name: string;
  category?: string;
  shortDescription?: string;
  wikidataRatings: Map<string, number>;
}): number {
  const qMatch = p.shortDescription?.match(/wikidata:(Q\d+)/i);
  if (qMatch) {
    const fromWd = p.wikidataRatings.get(qMatch[1].toUpperCase());
    if (fromWd != null) return fromWd;
  }
  return deriveRatingFromCategory(p.name, p.category);
}

function buildWikidataRatingIndex(raw: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of raw) {
    if (!p?.id) continue;
    let rating = typeof p.rating === 'number' ? p.rating : 4.2;
    if (p.mustVisit) rating = Math.min(5, rating + 0.25);
    if (p.isHiddenGem) rating = Math.max(3.5, rating - 0.1);
    map.set(String(p.id).toUpperCase(), roundRating(rating));
  }
  return map;
}

type RowInput = {
  externalId: string;
  name: string;
  description: string;
  shortDescription: string;
  latitude: number;
  longitude: number;
  category: string;
  tags: string[];
  images: string[];
  city: string;
  state: string;
  country: string;
  rating: number;
  popularityScore: number;
  hiddenGemScore: number;
  source: PlaceSource;
  bestTimeToVisit?: object;
  bestTimeReason?: string;
};

function mapCuratedLike(p: any, placeSource: PlaceSource, prefix: string): RowInput | null {
  if (!p?.name || p.latitude == null || p.longitude == null) return null;
  const externalId = `${prefix}:${p.id || slugify(p.name)}`;
  const rating = roundRating(typeof p.rating === 'number' ? p.rating : 4.3);
  const tags: string[] = [...(p.tags || [])];
  if (p.state) tags.push(String(p.state).toLowerCase().replace(/\s+/g, '-'));
  if (p.mustVisit) tags.push('must-visit');
  if (p.isHiddenGem) tags.push('hidden-gem');

  return {
    externalId,
    name: p.name,
    description: p.description || p.shortDescription || `${p.name} — tourist place in ${p.state || 'India'}.`,
    shortDescription: p.shortDescription || (p.description ? String(p.description).slice(0, 200) : p.name),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category: (p.category || 'other').toLowerCase(),
    tags: [...new Set(tags.map((t) => String(t).toLowerCase()))],
    images: p.images?.length ? p.images : p.imageUrl ? [p.imageUrl] : [],
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    rating,
    popularityScore: Math.round(rating * 10),
    hiddenGemScore: p.isHiddenGem ? 5 : 0,
    source: placeSource,
    bestTimeToVisit:
      p.bestTimeFrom && p.bestTimeTo
        ? { from: p.bestTimeFrom, to: p.bestTimeTo, bestMonths: p.bestTimeMonths || '' }
        : undefined,
    bestTimeReason: p.bestTimeReason,
  };
}

function mapWikidata(p: any, wikidataRatings: Map<string, number>): RowInput | null {
  if (!p?.id || !p.name || p.latitude == null || p.longitude == null) return null;
  const q = String(p.id).toUpperCase();
  const rating = wikidataRatings.get(q) ?? 4.2;
  const category = (p.category || 'heritage').toLowerCase();
  const tags = [category];
  if (p.state) tags.push(String(p.state).toLowerCase().replace(/\s+/g, '-'));
  if (p.mustVisit) tags.push('must-visit');
  if (p.isHiddenGem) tags.push('hidden-gem');

  return {
    externalId: `wikidata:${q}`,
    name: p.name,
    description: p.description || `${p.name} — heritage and tourist site in India.`,
    shortDescription: p.description ? String(p.description).slice(0, 200) : p.name,
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category,
    tags: [...new Set(tags)],
    images: p.imageUrl ? [p.imageUrl] : [],
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    rating,
    popularityScore: Math.round(rating * 10),
    hiddenGemScore: p.isHiddenGem ? 5 : 0,
    source: PlaceSource.WIKIMEDIA,
    bestTimeToVisit:
      p.bestTimeFrom && p.bestTimeTo
        ? { from: p.bestTimeFrom, to: p.bestTimeTo }
        : undefined,
    bestTimeReason: p.bestTimeReason,
  };
}

function mapOsm(p: any, wikidataRatings: Map<string, number>): RowInput | null {
  if (!p?.id || !p.name || p.latitude == null || p.longitude == null) return null;
  const rating = deriveOsmRating({
    name: p.name,
    category: p.category,
    shortDescription: p.shortDescription,
    wikidataRatings,
  });
  const tags = [...(p.tags || [])];
  if (p.state) tags.push(String(p.state).toLowerCase().replace(/\s+/g, '-'));

  return {
    externalId: p.id.startsWith('osm:') ? p.id : `osm:${p.id}`,
    name: p.name,
    description: p.shortDescription?.startsWith('wikidata:')
      ? `${p.name} — tourist attraction in ${p.state || 'India'}.`
      : p.shortDescription || `${p.name} — tourist place in ${p.state || 'India'}.`,
    shortDescription: p.shortDescription?.startsWith('wikidata:')
      ? p.name
      : (p.shortDescription || p.name).slice(0, 200),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category: (p.category || 'other').toLowerCase(),
    tags: [...new Set(tags.map((t) => String(t).toLowerCase()))],
    images: p.imageUrl ? [p.imageUrl] : [],
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    rating,
    popularityScore: Math.round(rating * 10),
    hiddenGemScore: 0,
    source: PlaceSource.OSM,
  };
}

function loadJson(fileName: string): any[] {
  const filePath = path.join(SEED_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skip missing file: ${filePath}`);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

async function main() {
  const { dryRun, limit, sources, backfillRatings } = parseArgs();

  if (backfillRatings) {
    await backfillMissingRatings(dryRun);
    const withRating = await prisma.place.count({ where: { rating: { not: null } } });
    const total = await prisma.place.count();
    console.log(`Places with rating: ${withRating} / ${total}`);
    return;
  }

  console.log(`Import India tourist places — sources: ${sources.join(', ')}${dryRun ? ' (dry-run)' : ''}`);

  const admin = await prisma.user.findFirst({
    where: { permission: 'ADMIN' },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error('No ADMIN user found. Run db:seed first.');
  }

  const [existingExternal, tombstones, usedSlugsRows] = await Promise.all([
    prisma.place.findMany({ select: { externalId: true } }),
    prisma.deletedPlaceRef.findMany({ select: { externalId: true, slug: true, curatedId: true } }),
    prisma.place.findMany({ select: { slug: true } }),
  ]);

  const externalSeen = new Set(
    existingExternal.map((p) => p.externalId).filter(Boolean) as string[],
  );
  const tombstoneExternal = new Set(
    tombstones.map((t) => t.externalId).filter(Boolean) as string[],
  );
  const slugUsed = new Set(usedSlugsRows.map((p) => p.slug));

  const wikidataRaw = loadJson('places-wikidata.json');
  const wikidataRatings = buildWikidataRatingIndex(wikidataRaw);

  const rows: RowInput[] = [];
  let skippedExisting = 0;
  let skippedTombstone = 0;

  const pushRow = (row: RowInput | null) => {
    if (!row) return;
    if (limit != null && rows.length >= limit) return;
    if (tombstoneExternal.has(row.externalId)) {
      skippedTombstone++;
      return;
    }
    if (externalSeen.has(row.externalId)) {
      skippedExisting++;
      return;
    }
    externalSeen.add(row.externalId);
    rows.push(row);
  };

  for (const key of sources) {
    const meta = SOURCE_FILES[key];
    if (!meta) continue;
    const data = key === 'wikidata' ? wikidataRaw : loadJson(meta.file);
    console.log(`Processing ${key}: ${data.length} records from ${meta.file}`);

    for (const p of data) {
      if (limit != null && rows.length >= limit) break;
      if (key === 'curated' || key === 'supplement') {
        pushRow(mapCuratedLike(p, meta.placeSource, key === 'supplement' ? 'supplement' : 'curated'));
      } else if (key === 'wikidata') {
        pushRow(mapWikidata(p, wikidataRatings));
      } else {
        pushRow(mapOsm(p, wikidataRatings));
      }
    }
  }

  console.log(
    `Prepared ${rows.length} new places (skip existing: ${skippedExisting}, tombstoned: ${skippedTombstone})`,
  );

  if (rows.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  if (dryRun) {
    const sample = rows.slice(0, 5);
    console.log('Sample rows:', JSON.stringify(sample, null, 2));
    return;
  }

  let created = 0;
  const now = new Date();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const data = batch.map((r) => {
      let slug = slugify(r.name);
      let counter = 1;
      while (slugUsed.has(slug)) {
        slug = `${slugify(r.name)}-${counter++}`;
      }
      slugUsed.add(slug);

      return {
        name: r.name,
        slug,
        description: r.description,
        shortDescription: r.shortDescription,
        latitude: r.latitude,
        longitude: r.longitude,
        category: r.category,
        tags: r.tags,
        images: r.images,
        thumbnail: r.images[0] || null,
        city: r.city,
        state: r.state,
        country: r.country,
        rating: null,
        popularityScore: null,
        hiddenGemScore: r.hiddenGemScore,
        bestTimeToVisit: r.bestTimeToVisit,
        bestTimeReason: r.bestTimeReason,
        status: PlaceStatus.APPROVED,
        dataQuality: PlaceDataQuality.DRAFT,
        source: r.source,
        externalId: r.externalId,
        verificationLevel: r.source === PlaceSource.CURATED ? 3 : 2,
        submittedById: admin.id,
        approvedById: admin.id,
        reviewedAt: now,
      };
    });

    const result = await prisma.place.createMany({ data, skipDuplicates: true });
    created += result.count;
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${result.count} (total ${created}/${rows.length})`);
  }

  const total = await prisma.place.count();
  const withRating = await prisma.place.count({ where: { rating: { not: null } } });
  console.log(`Done. Created ${created} places. DB total: ${total}, with rating: ${withRating}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
