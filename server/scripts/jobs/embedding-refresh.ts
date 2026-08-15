import { embeddingService } from '../../src/modules/canonical/services/embedding.service';
import { prisma } from '../../src/config/database';

async function main() {
  if (!embeddingService.isConfigured()) {
    console.log('Embedding refresh skipped: set HYBRID_SEARCH_ENABLED=true and OPENAI_API_KEY');
    return;
  }

  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '100', 10) : 100;

  const places = await prisma.place.findMany({
    where: { mergedIntoId: null, status: 'APPROVED', dataQuality: 'VERIFIED' },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });

  let ok = 0;
  for (const p of places) {
    if (await embeddingService.upsertPlaceEmbedding(p.id)) ok++;
  }
  console.log(JSON.stringify({ attempted: places.length, indexed: ok }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
