/**
 * Ingest Wikidata-sourced coverage JSON as DRAFT canonical candidates (never auto-VERIFIED).
 *
 * Usage: ts-node scripts/wikidata-coverage-ingest.ts prisma/seed-data/wikidata-coverage-pending.json --limit=200
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient, PlaceAliasType } from '@prisma/client';
import { placesCanonicalService } from '../src/modules/places/services/places.canonical.service';
import { isCoordinateInIndia } from '../src/shared/utils/indiaGeo';

const prisma = new PrismaClient();

type Row = {
  wikidataId: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  category: string;
  tags: string[];
  sourceUri: string;
};

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass JSON from wikidata-coverage-fetch.ts');

  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '100', 10) : 100;

  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as { rows: Row[] };
  const admin = await prisma.user.findFirst({ where: { permission: 'ADMIN' } });
  if (!admin) throw new Error('ADMIN user required');

  let created = 0;
  let skippedDup = 0;
  let skippedInvalid = 0;
  let skippedExisting = 0;

  for (const row of payload.rows.slice(0, limit)) {
    if (!isCoordinateInIndia(row.latitude, row.longitude)) {
      skippedInvalid++;
      continue;
    }

    const externalId = `wikidata:${row.wikidataId}`;
    const exists = await prisma.place.findFirst({ where: { externalId, mergedIntoId: null } });
    if (exists) {
      skippedExisting++;
      continue;
    }

    const description =
      row.description ??
      `${row.name}. Sourced from Wikidata (${row.wikidataId}); editorial description pending verification.`;

    try {
      await placesCanonicalService.upsertCanonical(
        {
          name: row.name,
          description,
          shortDescription: description.slice(0, 200),
          latitude: row.latitude,
          longitude: row.longitude,
          category: row.category,
          state: '',
          district: '',
          city: '',
          tags: row.tags,
          externalId,
          aliases: [
            {
              alias: row.wikidataId,
              aliasType: PlaceAliasType.SEARCH_KEYWORD,
              source: 'wikidata',
            },
          ],
          markVerified: false,
        },
        admin.id,
      );
      created++;
    } catch (err: any) {
      if (err?.statusCode === 409 || err?.message?.includes('duplicate')) {
        skippedDup++;
        continue;
      }
      throw err;
    }
  }

  console.log(
    JSON.stringify({ created, skippedDup, skippedExisting, skippedInvalid, attempted: Math.min(limit, payload.rows.length) }, null, 2),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
