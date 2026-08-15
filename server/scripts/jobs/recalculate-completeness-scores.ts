/**
 * Recalculate qualityScore (completeness %) for canonical places in batches.
 *
 * Usage:
 *   npx ts-node scripts/jobs/recalculate-completeness-scores.ts --limit=5000
 *   npx ts-node scripts/jobs/recalculate-completeness-scores.ts --all
 */
import { prisma } from '../../src/config/database';
import { computeCompletenessScore } from '../lib/place-completeness';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function scoreBatch(offset: number, limit: number): Promise<number> {
  const places = await prisma.place.findMany({
    where: { mergedIntoId: null },
    orderBy: { id: 'asc' },
    skip: offset,
    take: limit,
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      state: true,
      district: true,
      city: true,
      village: true,
      fullAddress: true,
      description: true,
      history: true,
      category: true,
      subcategory: true,
      website: true,
      openingHours: true,
      ticketPrice: true,
      heritageStatus: true,
      unescoStatus: true,
      religiousType: true,
      naturalCultural: true,
      searchKeywords: true,
      tags: true,
      hasParking: true,
      parkingDetails: true,
      isAccessible: true,
      accessibilityDetails: true,
      hasWashroom: true,
      elevationMeters: true,
      postalCode: true,
      highlights: true,
      _count: {
        select: {
          aliases: true,
          translations: true,
          fieldProvenance: true,
          relationshipsFrom: true,
          placeImages: true,
          boundaryValidations: true,
        },
      },
      placeImages: {
        where: { verificationStatus: 'LICENSE_VERIFIED' },
        take: 1,
        select: { id: true },
      },
      boundaryValidations: {
        where: { withinIndia: true },
        take: 1,
        select: { id: true },
      },
      relationshipsFrom: {
        where: { relationshipType: 'NEARBY' },
        take: 1,
        select: { id: true },
      },
    },
  });

  for (const p of places) {
    const hl = p.highlights && typeof p.highlights === 'object' && !Array.isArray(p.highlights)
      ? (p.highlights as Record<string, unknown>)
      : {};
    const score = computeCompletenessScore({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      state: p.state,
      district: p.district,
      city: p.city,
      village: p.village,
      fullAddress: p.fullAddress,
      description: p.description,
      history: p.history,
      category: p.category,
      subcategory: p.subcategory,
      website: p.website,
      openingHours: p.openingHours,
      ticketPrice: p.ticketPrice,
      heritageStatus: p.heritageStatus,
      unescoStatus: p.unescoStatus,
      religiousType: p.religiousType,
      naturalCultural: p.naturalCultural,
      searchKeywords: p.searchKeywords,
      tags: p.tags,
      aliasCount: p._count.aliases,
      translationCount: p._count.translations,
      nearbyCount: p.relationshipsFrom.length,
      provenanceCount: p._count.fieldProvenance,
      hasVerifiedImage: p.placeImages.length > 0,
      boundaryValidated: p.boundaryValidations.length > 0,
      hasParking: p.hasParking,
      parkingDetails: p.parkingDetails,
      isAccessible: p.isAccessible,
      accessibilityDetails: p.accessibilityDetails,
      hasWashroom: p.hasWashroom,
      elevationMeters: p.elevationMeters,
      postalCode: p.postalCode,
      hasVisitorInfo: hl.visitorInfo != null,
      hasTourismContent: hl.tourismContent != null,
      hasTravelAccess: hl.travelAccess != null,
      hasActivities: Array.isArray(hl.officialActivities) && hl.officialActivities.length > 0,
    });
    await prisma.place.update({
      where: { id: p.id },
      data: { qualityScore: score },
    });
  }
  return places.length;
}

async function main() {
  const batchSize = parseInt(arg('limit', '2000'), 10);
  const runAll = process.argv.includes('--all');
  const total = await prisma.place.count({ where: { mergedIntoId: null } });
  let offset = parseInt(arg('offset', '0'), 10);
  let processed = 0;

  do {
    const n = await scoreBatch(offset, batchSize);
    processed += n;
    offset += n;
    console.log(`Completeness scores: ${processed}/${total}`);
    if (n === 0) break;
  } while (runAll && offset < total);

  console.log(JSON.stringify({ processed, total }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
