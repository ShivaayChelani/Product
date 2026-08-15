/**
 * Ingest one canonical place JSON (human-curated, no synthetic ratings).
 * Usage: ts-node scripts/ingest-canonical-place.ts prisma/seed-data/canonical/bhedaghat.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, PlaceAliasType } from '@prisma/client';
import { placesCanonicalService } from '../src/modules/places/services/places.canonical.service';

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass path to canonical JSON file');

  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const admin = await prisma.user.findFirst({ where: { permission: 'ADMIN' } });
  if (!admin) throw new Error('ADMIN user required');

  const aliases = (raw.aliases || []).map((a: any) => ({
    alias: a.alias,
    locale: a.locale,
    aliasType: (a.aliasType as PlaceAliasType) || PlaceAliasType.SEARCH_KEYWORD,
    source: 'canonical_seed',
  }));

  try {
    const place = await placesCanonicalService.upsertCanonical(
      {
        name: raw.name,
        description: raw.description,
        shortDescription: raw.shortDescription,
        latitude: raw.latitude,
        longitude: raw.longitude,
        category: raw.category,
        subcategory: raw.subcategory,
        state: raw.state,
        district: raw.district,
        city: raw.city,
        village: raw.village,
        fullAddress: raw.fullAddress,
        history: raw.history,
        tags: raw.tags,
        searchKeywords: raw.searchKeywords,
        aliases,
        externalId: raw.externalId,
        website: raw.website,
        googleMapsUrl: raw.googleMapsUrl,
        markVerified: raw.markVerified === true,
      },
      admin.id,
    );
    console.log('Created canonical place:', place.id, place.name);
  } catch (err: any) {
    if (err?.code === 'DUPLICATE_CANDIDATES') {
      console.error('Duplicate candidates — merge instead of creating a new row:');
      console.error(JSON.stringify(err.details?.candidates, null, 2));
      process.exit(2);
    }
    throw err;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
