import { prisma } from '../../../config/database';
import { geohashPrefix, geohashBlockingPrefixes, geohashPrefixCenter } from '../../../shared/utils/geohash';
import { scoreDuplicatePair } from './duplicate-scoring.service';

export type DuplicateScanOptions = {
  /** Geohash prefix length (~1.2km at 6, ~150m at 7). */
  precision?: number;
  /** Max distinct geohash prefixes per run. */
  prefixBatch?: number;
  /** Max places loaded per prefix block. */
  maxPlacesPerBlock?: number;
};

export type DuplicateScanStats = {
  prefixesScanned: number;
  pairsEvaluated: number;
  candidatesUpserted: number;
};

type PlaceRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  state: string;
  district: string;
  category: string;
  aliases: { alias: string }[];
};

async function upsertCandidate(a: PlaceRow, b: PlaceRow, scored: ReturnType<typeof scoreDuplicatePair>) {
  const [placeAId, placeBId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await prisma.placeDuplicateCandidate.upsert({
    where: { placeAId_placeBId: { placeAId, placeBId } },
    create: {
      placeAId,
      placeBId,
      confidenceScore: scored.confidence,
      status: 'OPEN',
      signals: scored.signals as object,
    },
    update: {
      confidenceScore: scored.confidence,
      signals: scored.signals as object,
    },
  });
}

function scorePair(a: PlaceRow, b: PlaceRow) {
  return scoreDuplicatePair({
    nameA: a.name,
    nameB: b.name,
    aliasesB: b.aliases.map((x) => x.alias),
    latA: a.latitude,
    lngA: a.longitude,
    latB: b.latitude,
    lngB: b.longitude,
    stateA: a.state,
    stateB: b.state,
    districtA: a.district,
    districtB: b.district,
    categoryA: a.category,
    categoryB: b.category,
  });
}

/** Compare all pairs within a block (typically ≤ few dozen places). */
export async function comparePlacesInBlock(places: PlaceRow[]): Promise<{ evaluated: number; upserted: number }> {
  let evaluated = 0;
  let upserted = 0;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      evaluated++;
      const scored = scorePair(places[i], places[j]);
      if (scored.action === 'DISTINCT') continue;
      await upsertCandidate(places[i], places[j], scored);
      upserted++;
    }
  }
  return { evaluated, upserted };
}

/**
 * Spatially blocked duplicate scan: O(places × local_density) instead of O(n²) over full corpus.
 */
export async function runGeohashBlockedDuplicateScan(
  options: DuplicateScanOptions = {},
): Promise<DuplicateScanStats> {
  const precision = options.precision ?? 6;
  const prefixBatch = options.prefixBatch ?? 200;
  const maxPlacesPerBlock = options.maxPlacesPerBlock ?? 80;

  const prefixRows = await prisma.$queryRaw<{ prefix: string }[]>`
    SELECT DISTINCT LEFT(geohash, ${precision}::int) AS prefix
    FROM places
    WHERE merged_into_id IS NULL
      AND status = 'APPROVED'
      AND geohash IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    ORDER BY prefix
    LIMIT ${prefixBatch}
  `;

  let pairsEvaluated = 0;
  let candidatesUpserted = 0;

  for (const { prefix } of prefixRows) {
    const center = geohashPrefixCenter(prefix);
    const blockPrefixes = geohashBlockingPrefixes(center.lat, center.lng, precision);

    const places = await prisma.place.findMany({
      where: {
        mergedIntoId: null,
        status: 'APPROVED',
        OR: blockPrefixes.map((p) => ({ geohash: { startsWith: p } })),
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        state: true,
        district: true,
        category: true,
        aliases: { select: { alias: true } },
      },
      take: maxPlacesPerBlock,
    });

    const rows = places as PlaceRow[];
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
    const { evaluated, upserted } = await comparePlacesInBlock(unique);
    pairsEvaluated += evaluated;
    candidatesUpserted += upserted;
  }

  return {
    prefixesScanned: prefixRows.length,
    pairsEvaluated,
    candidatesUpserted,
  };
}

/** Backfill geohash for places missing it. */
export async function backfillPlaceGeohashes(limit = 5000): Promise<number> {
  const places = await prisma.place.findMany({
    where: { geohash: null, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, latitude: true, longitude: true },
    take: limit,
  });

  if (!places.length) return 0;

  let updated = 0;
  const batchSize = 500;
  for (let i = 0; i < places.length; i += batchSize) {
    const chunk = places.slice(i, i + batchSize).filter((p) => p.latitude != null && p.longitude != null);
    if (!chunk.length) continue;

    const ids: string[] = [];
    const hashes: string[] = [];
    for (const p of chunk) {
      ids.push(p.id);
      hashes.push(geohashPrefix(p.latitude!, p.longitude!, 12));
    }

    await prisma.$executeRaw`
      UPDATE places AS p
      SET geohash = v.hash, updated_at = NOW()
      FROM (
        SELECT unnest(${ids}::text[]) AS id, unnest(${hashes}::text[]) AS hash
      ) AS v
      WHERE p.id = v.id
    `;
    updated += chunk.length;
  }
  return updated;
}
