/**
 * Bulk import India tourist places with:
 * - Tourist-only filter (no neighbourhood parks / shops)
 * - India coordinate validation
 * - Normalized tags
 * - Aliases from OSM/Wikidata alt names
 *
 * Usage:
 *   ts-node scripts/bulk-tourist-import.ts
 *   ts-node scripts/bulk-tourist-import.ts --dry-run --limit=500
 *   ts-node scripts/bulk-tourist-import.ts --geocode=2000
 */
import {
  PrismaClient,
  PlaceSource,
  PlaceStatus,
  PlaceDataQuality,
  PlaceAliasType,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { isCoordinateInIndia } from '../src/shared/utils/indiaGeo';
import { isTouristWorthyPlace } from '../src/shared/utils/touristPlaceFilter';
import { isJunkPlaceName } from '../src/shared/utils/placeNameQuality';
import { buildPlaceTags, extractOsmAliases, normalizeCategory } from '../src/shared/utils/placeTags';
import { normalizeForMatch } from '../src/shared/utils/canonicalText';
import { reverseGeocodeNominatim } from './lib/osm-nominatim-client';
import { geohashPrefix } from '../src/shared/utils/geohash';
import { coordNameDedupKey, extractWikidataQId } from '../src/modules/places/services/place-geo.helpers';

const prisma = new PrismaClient();
const SEED_DIR = path.join(__dirname, '..', 'prisma', 'seed-data');
const BATCH_SIZE = 300;

type SourceKey = 'curated' | 'supplement' | 'wikidata' | 'osm' | 'osm-missing' | 'wikidata-coverage';

const SOURCE_FILES: Record<SourceKey, { file: string; placeSource: PlaceSource }> = {
  curated: { file: 'places-curated.json', placeSource: PlaceSource.CURATED },
  supplement: { file: 'places-supplement.json', placeSource: PlaceSource.CURATED },
  wikidata: { file: 'places-wikidata.json', placeSource: PlaceSource.WIKIMEDIA },
  osm: { file: 'osm-places.json', placeSource: PlaceSource.OSM },
  'osm-missing': { file: 'osm-places-missing.json', placeSource: PlaceSource.OSM },
  'wikidata-coverage': { file: 'wikidata-coverage-pending.json', placeSource: PlaceSource.WIKIMEDIA },
};

const DEFAULT_SOURCES: SourceKey[] = [
  'curated', 'supplement', 'wikidata', 'wikidata-coverage', 'osm', 'osm-missing',
];

type CanonicalRow = {
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
  source: PlaceSource;
  aliases: { alias: string; locale?: string; aliasType: PlaceAliasType; source: string }[];
  editorialPriority: number;
  wikidataId?: string;
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
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1] || '0', 10)) : undefined;
  const sourcesArg = process.argv.find((a) => a.startsWith('--sources='));
  const sources = sourcesArg
    ? (sourcesArg.split('=')[1]?.split(',').filter(Boolean) as SourceKey[])
    : DEFAULT_SOURCES;
  const geocodeArg = process.argv.find((a) => a.startsWith('--geocode='));
  const geocodeLimit = geocodeArg ? parseInt(geocodeArg.split('=')[1] || '0', 10) : 0;
  return { dryRun, limit, sources, geocodeLimit };
}

function loadJson(fileName: string): any[] {
  const filePath = path.join(SEED_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skip missing: ${filePath}`);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw?.rows && Array.isArray(raw.rows)) return raw.rows;
  return [];
}

function realDescription(raw: unknown, minLen = 20): string {
  const s = String(raw || '').trim();
  if (s.length >= minLen && !s.startsWith('wikidata:')) return s;
  return '';
}

function realShortDescription(raw: unknown, name: string): string {
  const s = realDescription(raw, 10);
  return s ? s.slice(0, 200) : name.slice(0, 200);
}

function coordOk(lat: unknown, lng: unknown): lat is number {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && isCoordinateInIndia(la, ln);
}

function mapCuratedLike(p: any, placeSource: PlaceSource, prefix: string): CanonicalRow | null {
  if (!p?.name || !coordOk(p.latitude, p.longitude)) return null;
  const name = String(p.name).trim();
  if (isJunkPlaceName(name)) return null;
  const category = normalizeCategory(p.category || 'monument');
  const tags = buildPlaceTags({
    category,
    state: p.state,
    city: p.city,
    extraTags: p.tags,
    mustVisit: p.mustVisit,
    isHiddenGem: p.isHiddenGem,
    wikidataId: p.wikidataId || p.id,
  });

  const row: CanonicalRow = {
    externalId: `${prefix}:${p.id || slugify(p.name)}`,
    name: name,
    description: realDescription(p.description) || realDescription(p.shortDescription),
    shortDescription: realShortDescription(p.shortDescription || p.description, name),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category,
    tags,
    images: p.images?.length ? p.images : p.imageUrl ? [p.imageUrl] : [],
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    source: placeSource,
    aliases: [],
    editorialPriority: p.mustVisit ? 5 : placeSource === PlaceSource.CURATED ? 4 : 3,
  };

  if (!isTouristWorthyPlace(row)) return null;
  return row;
}

function mapWikidata(p: any): CanonicalRow | null {
  if (!p?.id || !p?.name || !coordOk(p.latitude, p.longitude)) return null;
  const name = String(p.name).trim();
  if (isJunkPlaceName(name)) return null;
  const q = String(p.id).replace(/^Q/i, 'Q');
  const category = normalizeCategory(p.category || 'heritage');
  const tags = buildPlaceTags({
    category,
    state: p.state,
    city: p.city,
    extraTags: p.tags,
    wikidataId: q,
    mustVisit: p.mustVisit,
    isHiddenGem: p.isHiddenGem,
  });

  const row: CanonicalRow = {
    externalId: `wikidata:${q.toUpperCase()}`,
    name: name,
    description: realDescription(p.description),
    shortDescription: realShortDescription(p.description, name),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category,
    tags,
    images: p.imageUrl ? [p.imageUrl] : [],
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    source: PlaceSource.WIKIMEDIA,
    aliases: [{ alias: q, aliasType: PlaceAliasType.SEARCH_KEYWORD, source: 'wikidata' }],
    editorialPriority: p.mustVisit ? 5 : 4,
    wikidataId: q,
  };

  if (!isTouristWorthyPlace(row)) return null;
  return row;
}

function mapWikidataCoverage(p: any): CanonicalRow | null {
  const qid = p.wikidataId || String(p.id || '').replace(/^wikidata:/i, '');
  if (!qid || !p?.name || !coordOk(p.latitude, p.longitude)) return null;
  const name = String(p.name).trim();
  if (isJunkPlaceName(name)) return null;
  const category = normalizeCategory(p.category || 'heritage');
  const tags = buildPlaceTags({
    category,
    extraTags: p.tags,
    wikidataId: qid,
  });

  const row: CanonicalRow = {
    externalId: `wikidata:${qid.toUpperCase()}`,
    name: name,
    description: realDescription(p.description),
    shortDescription: realShortDescription(p.description, name),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category,
    tags,
    images: [],
    city: p.city || '',
    state: p.state || '',
    country: 'India',
    source: PlaceSource.WIKIMEDIA,
    aliases: [{ alias: qid, aliasType: PlaceAliasType.SEARCH_KEYWORD, source: 'wikidata' }],
    editorialPriority: 4,
    wikidataId: qid,
  };

  if (!isTouristWorthyPlace(row)) return null;
  return row;
}

function mapOsm(p: any): CanonicalRow | null {
  if (!p?.id || !p?.name || !coordOk(p.latitude, p.longitude)) return null;
  const name = String(p.name).trim();
  if (isJunkPlaceName(name)) return null;
  const category = normalizeCategory(p.category || 'monument');
  const osmTags = p.osmTags || {};
  const tags = buildPlaceTags({
    category,
    state: p.state,
    city: p.city,
    extraTags: p.tags,
    osmTags,
  });

  const aliases: CanonicalRow['aliases'] = [];
  for (const a of p.aliases || []) {
    if (a && String(a).trim().length >= 2) {
      aliases.push({ alias: String(a).trim(), aliasType: PlaceAliasType.LOCAL_NAME, source: 'osm' });
    }
  }
  for (const a of extractOsmAliases(osmTags, p.name)) {
    aliases.push({ alias: a, aliasType: PlaceAliasType.LOCAL_NAME, source: 'osm' });
  }

  const wdMatch = String(p.shortDescription || '').match(/wikidata:(Q\d+)/i);
  if (wdMatch) {
    aliases.push({ alias: wdMatch[1], aliasType: PlaceAliasType.SEARCH_KEYWORD, source: 'wikidata' });
  }

  const wdFromOsm = extractWikidataQId(osmTags, p.shortDescription);

  const row: CanonicalRow = {
    externalId: p.id.startsWith('osm:') ? p.id : `osm:${p.id}`,
    name: name,
    description: realDescription(p.description) || realDescription(p.shortDescription),
    shortDescription: realShortDescription(
      p.shortDescription?.startsWith('wikidata:') ? '' : p.shortDescription,
      name,
    ),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    category,
    tags,
    images: p.imageUrl ? [p.imageUrl] : [],
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    source: PlaceSource.OSM,
    aliases,
    editorialPriority: category === 'park' ? 2 : 3,
    wikidataId: wdFromOsm ?? undefined,
  };

  if (!isTouristWorthyPlace(row)) return null;
  return row;
}

async function geocodeMissingRows(limit: number, dryRun: boolean) {
  if (limit <= 0) return;
  const rows = await prisma.place.findMany({
    where: {
      OR: [{ city: '' }, { state: '' }],
      latitude: { not: null },
      longitude: { not: null },
      mergedIntoId: null,
    },
    select: { id: true, latitude: true, longitude: true, city: true, state: true, tags: true },
    take: limit,
    orderBy: { editorialPriority: 'desc' },
  });

  console.log(`Geocoding ${rows.length} places (limit ${limit})...`);
  let updated = 0;
  for (const r of rows) {
    if (r.latitude == null || r.longitude == null) continue;
    const geo = await reverseGeocodeNominatim(r.latitude, r.longitude);
    if (!geo) continue;

    const city = r.city || geo.city || geo.village || '';
    const state = r.state || geo.state || '';
    if (!city && !state) continue;

    const newTags = [...new Set([...(r.tags || []), ...(city ? [city.toLowerCase().replace(/\s+/g, '-')] : []), ...(state ? [state.toLowerCase().replace(/\s+/g, '-')] : [])])];

    if (!dryRun) {
      await prisma.place.update({
        where: { id: r.id },
        data: { city: city || r.city, state: state || r.state, tags: newTags },
      });
    }
    updated++;
    if (updated % 50 === 0) console.log(`  geocoded ${updated}/${rows.length}`);
  }
  console.log(`Geocode done: ${updated} updated${dryRun ? ' (dry-run)' : ''}.`);
}

async function main() {
  const { dryRun, limit, sources, geocodeLimit } = parseArgs();

  if (geocodeLimit > 0 && !limit) {
    await geocodeMissingRows(geocodeLimit, dryRun);
    return;
  }

  console.log(`Bulk tourist import — sources: ${sources.join(', ')}${dryRun ? ' (dry-run)' : ''}`);

  const admin = await prisma.user.findFirst({ where: { permission: 'ADMIN' }, select: { id: true } });
  if (!admin) throw new Error('No ADMIN user. Run db:seed first.');

  const [existingExternal, tombstones, usedSlugsRows, existingPlaces] = await Promise.all([
    prisma.place.findMany({ where: { mergedIntoId: null }, select: { externalId: true } }),
    prisma.deletedPlaceRef.findMany({ select: { externalId: true } }),
    prisma.place.findMany({ select: { slug: true } }),
    prisma.place.findMany({
      where: { mergedIntoId: null, latitude: { not: null }, longitude: { not: null } },
      select: { name: true, latitude: true, longitude: true, externalId: true },
    }),
  ]);

  const externalSeen = new Set(existingExternal.map((p) => p.externalId).filter(Boolean) as string[]);
  const tombstoneExternal = new Set(tombstones.map((t) => t.externalId).filter(Boolean) as string[]);
  const slugUsed = new Set(usedSlugsRows.map((p) => p.slug));
  const coordNameSeen = new Set(
    existingPlaces.map((p) =>
      coordNameDedupKey(p.name, p.latitude!, p.longitude!, normalizeForMatch),
    ),
  );
  const wikidataSeen = new Set(
    existingPlaces
      .map((p) => p.externalId)
      .filter((id): id is string => Boolean(id?.startsWith('wikidata:')))
      .map((id) => id.toUpperCase()),
  );

  const rows: CanonicalRow[] = [];
  let skippedExisting = 0;
  let skippedTombstone = 0;
  let skippedNotTourist = 0;
  let skippedBadCoord = 0;
  let skippedDuplicate = 0;

  const pushRow = (row: CanonicalRow | null) => {
    if (!row) return;
    if (limit != null && rows.length >= limit) return;
    if (!coordOk(row.latitude, row.longitude)) { skippedBadCoord++; return; }
    if (tombstoneExternal.has(row.externalId)) { skippedTombstone++; return; }
    if (externalSeen.has(row.externalId)) { skippedExisting++; return; }

    const coordKey = coordNameDedupKey(row.name, row.latitude, row.longitude, normalizeForMatch);
    if (coordNameSeen.has(coordKey)) { skippedDuplicate++; return; }

    if (row.wikidataId) {
      const wdKey = `wikidata:${row.wikidataId.toUpperCase()}`;
      if (wikidataSeen.has(wdKey) || externalSeen.has(wdKey)) { skippedDuplicate++; return; }
      wikidataSeen.add(wdKey);
    }

    externalSeen.add(row.externalId);
    coordNameSeen.add(coordKey);
    rows.push(row);
  };

  for (const key of sources) {
    const meta = SOURCE_FILES[key];
    if (!meta) continue;
    const data = loadJson(meta.file);
    console.log(`Processing ${key}: ${data.length} from ${meta.file}`);

    const before = rows.length;
    for (const p of data) {
      if (limit != null && rows.length >= limit) break;
      if (key === 'curated' || key === 'supplement') {
        pushRow(mapCuratedLike(p, meta.placeSource, key === 'supplement' ? 'supplement' : 'curated'));
      } else if (key === 'wikidata') {
        pushRow(mapWikidata(p));
      } else if (key === 'wikidata-coverage') {
        pushRow(mapWikidataCoverage(p));
      } else {
        pushRow(mapOsm(p));
      }
    }
    skippedNotTourist += data.length - (rows.length - before);
    console.log(`  +${rows.length - before} new from ${key}`);
  }

  console.log(JSON.stringify({
    prepared: rows.length,
    skippedExisting,
    skippedTombstone,
    skippedBadCoord,
    skippedDuplicate,
  }, null, 2));

  if (rows.length === 0) {
    console.log('Nothing new to import.');
    if (geocodeLimit > 0) await geocodeMissingRows(geocodeLimit, dryRun);
    return;
  }

  if (dryRun) {
    console.log('Sample:', JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  let created = 0;
  let aliasesCreated = 0;
  const now = new Date();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const placeIds: { externalId: string; id: string }[] = [];

    for (const r of batch) {
      let slug = slugify(r.name);
      let counter = 1;
      while (slugUsed.has(slug)) slug = `${slugify(r.name)}-${counter++}`;
      slugUsed.add(slug);

      try {
        const place = await prisma.place.create({
          data: {
            name: r.name,
            slug,
            description: r.description,
            shortDescription: r.shortDescription,
            latitude: r.latitude,
            longitude: r.longitude,
            geohash: geohashPrefix(r.latitude, r.longitude, 12),
            category: r.category,
            tags: r.tags,
            images: r.images,
            thumbnail: r.images[0] || null,
            city: r.city,
            state: r.state,
            country: r.country,
            status: PlaceStatus.APPROVED,
            dataQuality: PlaceDataQuality.DRAFT,
            source: r.source,
            externalId: r.externalId,
            verificationLevel: r.source === PlaceSource.CURATED ? 3 : 2,
            editorialPriority: r.editorialPriority,
            submittedById: admin.id,
            approvedById: admin.id,
            reviewedAt: now,
          },
          select: { id: true, externalId: true },
        });
        placeIds.push({ externalId: place.externalId!, id: place.id });
        created++;
      } catch {
        // skip duplicate slug race
      }
    }

    const aliasRows: {
      placeId: string;
      alias: string;
      normalizedAlias: string;
      aliasType: PlaceAliasType;
      source: string;
    }[] = [];

    for (const r of batch) {
      const hit = placeIds.find((p) => p.externalId === r.externalId);
      if (!hit) continue;
      for (const a of r.aliases) {
        const normalizedAlias = normalizeForMatch(a.alias);
        if (!normalizedAlias) continue;
        aliasRows.push({
          placeId: hit.id,
          alias: a.alias,
          normalizedAlias,
          aliasType: a.aliasType,
          source: a.source,
        });
      }
    }

    if (aliasRows.length > 0) {
      const res = await prisma.placeAlias.createMany({ data: aliasRows, skipDuplicates: true });
      aliasesCreated += res.count;
    }

    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: created ${placeIds.length} places, ${aliasRows.length} aliases (total ${created})`);
  }

  const total = await prisma.place.count();
  console.log(`Import done. Created ${created} places, ${aliasesCreated} aliases. DB total: ${total}`);

  if (geocodeLimit > 0) await geocodeMissingRows(geocodeLimit, dryRun);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
