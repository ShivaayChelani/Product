import { prisma } from '../../src/config/database';
import { ImageVerificationStatus } from '@prisma/client';

/**
 * HEAD-check place image URLs; mark broken links for admin review.
 * Usage: ts-node scripts/jobs/image-url-scan.ts --limit=200
 */
async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '200', 10) : 200;

  const images = await prisma.placeImage.findMany({
    where: { verificationStatus: { not: ImageVerificationStatus.REJECTED } },
    select: { id: true, url: true, placeId: true },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  let broken = 0;
  for (const img of images) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(img.url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        await prisma.placeImage.update({
          where: { id: img.id },
          data: { verificationStatus: ImageVerificationStatus.REJECTED },
        });
        broken++;
      }
    } catch {
      await prisma.placeImage.update({
        where: { id: img.id },
        data: { verificationStatus: ImageVerificationStatus.REJECTED },
      });
      broken++;
    }
  }

  console.log(`Image URL scan: checked ${images.length}, rejected ${broken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
