import { imagePipelineService } from '../../src/modules/canonical/services/image-pipeline.service';
import { prisma } from '../../src/config/database';

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '50', 10) : 50;

  const images = await prisma.placeImage.findMany({
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  let processed = 0;
  let rejected = 0;
  for (const img of images) {
    const result = await imagePipelineService.processPlaceImage(img.id);
    processed++;
    if (!result.accepted) rejected++;
  }

  console.log(JSON.stringify({ processed, rejected }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
