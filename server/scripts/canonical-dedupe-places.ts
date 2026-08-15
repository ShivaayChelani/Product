/**
 * Scan for duplicate clusters and optionally merge into the best canonical row.
 * Usage:
 *   ts-node scripts/canonical-dedupe-places.ts --dry-run --limit=100
 *   ts-node scripts/canonical-dedupe-places.ts --merge --limit=50
 */
import { PrismaClient } from '@prisma/client';
import { placesCanonicalService } from '../src/modules/places/services/places.canonical.service';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const merge = process.argv.includes('--merge');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '100', 10) : 100;

  const admin = await prisma.user.findFirst({ where: { permission: 'ADMIN' } });

  const places = await prisma.place.findMany({
    where: { mergedIntoId: null, status: 'APPROVED' as const },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      state: true,
      district: true,
      category: true,
      dataQuality: true,
      reviewCount: true,
      verificationLevel: true,
    },
    orderBy: { verificationLevel: 'desc' },
    take: limit,
  });

  let clusters = 0;
  let merged = 0;
  const seen = new Set<string>();

  for (const p of places) {
    if (seen.has(p.id) || p.latitude == null || p.longitude == null) continue;

    const candidates = await placesCanonicalService.findDuplicateCandidates({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      state: p.state,
      district: p.district,
      category: p.category,
      excludePlaceId: p.id,
    });

    if (!candidates.length) continue;
    clusters++;
    console.log(`\nCanonical candidate: ${p.name} (${p.id})`);
    for (const c of candidates) {
      console.log(`  dup: ${c.name} (${c.placeId}) dist=${c.distanceM}m score=${c.nameScore}`);
      seen.add(c.placeId);

      if (merge && !dryRun && admin) {
        await placesCanonicalService.mergeIntoCanonical({
          canonicalPlaceId: p.id,
          duplicatePlaceIds: [c.placeId],
          mergedById: admin.id,
          reason: 'automated_dedupe_scan',
        });
        merged++;
      }
    }
    seen.add(p.id);
  }

  console.log(`\nClusters found: ${clusters}${merge ? `, merged: ${merged}` : ''}${dryRun ? ' (dry-run)' : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
