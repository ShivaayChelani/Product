import type { Prisma } from '@prisma/client';

/** Same 1-hour window as creator reel videoUrl retries. */
export const VENDOR_REEL_VIDEO_IDEMPOTENCY_MS = 60 * 60 * 1000;

type VendorReelTx = {
  $queryRaw: Prisma.TransactionClient['$queryRaw'];
  vendorReel: {
    findFirst: Prisma.TransactionClient['vendorReel']['findFirst'];
    create: Prisma.TransactionClient['vendorReel']['create'];
  };
};

/**
 * Lock the vendor row for the duration of the surrounding Prisma transaction,
 * then reuse a recent reel with the same videoUrl or insert one.
 */
export async function createVendorReelIdempotent(
  tx: VendorReelTx,
  vendorId: string,
  input: {
    videoUrl: string;
    thumbnail?: string | null;
    title?: string | null;
    description?: string | null;
  },
  beforeCreate?: () => Promise<unknown>,
) {
  const videoUrl = String(input.videoUrl || '').trim();
  await tx.$queryRaw`SELECT id FROM vendors WHERE id = ${vendorId} FOR UPDATE`;

  const recentDuplicate = await tx.vendorReel.findFirst({
    where: {
      vendorId,
      videoUrl,
      createdAt: { gte: new Date(Date.now() - VENDOR_REEL_VIDEO_IDEMPOTENCY_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recentDuplicate) {
    return recentDuplicate;
  }

  if (beforeCreate) {
    await beforeCreate();
  }

  return tx.vendorReel.create({
    data: {
      vendorId,
      videoUrl,
      thumbnail: input.thumbnail ?? undefined,
      title: input.title ?? undefined,
      description: input.description ?? undefined,
    },
  });
}
