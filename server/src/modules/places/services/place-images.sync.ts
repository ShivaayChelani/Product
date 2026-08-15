import { prisma } from '../../../config/database';
import { cloudinary } from '../../../config/upload';
import { logger } from '../../../config/logger';
import { dedupeImageUrls } from './places.helpers';

/** Extract Cloudinary public_id from a secure_url (e.g. palsasafar/places/abc). */
export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('cloudinary.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx === -1) return null;
    let i = uploadIdx + 1;
    if (/^v\d+$/.test(parts[i] || '')) i += 1;
    const publicIdWithExt = parts.slice(i).join('/');
    if (!publicIdWithExt) return null;
    return publicIdWithExt.replace(/\.[a-zA-Z0-9]+$/, '');
  } catch {
    return null;
  }
}

export function isManagedPlaceImageUrl(url: string): boolean {
  const publicId = extractCloudinaryPublicId(url);
  return !!publicId && publicId.startsWith('palsasafar/places');
}

async function isCloudinaryUrlStillReferenced(url: string, excludePlaceId?: string): Promise<boolean> {
  const [placeRefs, imageRefs] = await Promise.all([
    prisma.place.count({
      where: {
        ...(excludePlaceId ? { id: { not: excludePlaceId } } : {}),
        OR: [{ images: { has: url } }, { thumbnail: url }],
      },
    }),
    prisma.placeImage.count({
      where: {
        url,
        ...(excludePlaceId ? { placeId: { not: excludePlaceId } } : {}),
      },
    }),
  ]);
  return placeRefs > 0 || imageRefs > 0;
}

export async function deleteCloudinaryImageIfOrphan(
  url: string,
  excludePlaceId?: string,
): Promise<void> {
  if (!isManagedPlaceImageUrl(url)) return;
  if (await isCloudinaryUrlStillReferenced(url, excludePlaceId)) return;

  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn({ publicId, url, err }, 'Cloudinary image delete failed');
  }
}

/**
 * Keep place_images rows aligned with the canonical URL list on Place.images.
 * Removes orphaned rows, creates missing rows, updates order/primary, optionally cleans Cloudinary.
 */
export async function syncPlaceImageRecords(
  placeId: string,
  urls: string[],
  options?: { previousUrls?: string[]; cleanupCloudinary?: boolean },
): Promise<void> {
  const images = dedupeImageUrls(urls);
  const previousUrls = options?.previousUrls ?? [];
  const cleanup = options?.cleanupCloudinary !== false;

  const existingRows = await prisma.placeImage.findMany({
    where: { placeId },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, url: true },
  });

  const desiredSet = new Set(images);
  const removeIds = existingRows.filter((r) => !desiredSet.has(r.url)).map((r) => r.id);
  const removedUrls = existingRows.filter((r) => !desiredSet.has(r.url)).map((r) => r.url);

  if (removeIds.length) {
    await prisma.placeImage.deleteMany({ where: { id: { in: removeIds } } });
  }

  const existingUrlSet = new Set(existingRows.map((r) => r.url));
  for (let i = 0; i < images.length; i++) {
    const url = images[i];
    if (!existingUrlSet.has(url)) {
      await prisma.placeImage.create({
        data: {
          placeId,
          url,
          isPrimary: i === 0,
          order: i,
        },
      });
    } else {
      await prisma.placeImage.updateMany({
        where: { placeId, url },
        data: { isPrimary: i === 0, order: i },
      });
    }
  }

  if (cleanup) {
    const urlsToCleanup = new Set<string>([
      ...removedUrls,
      ...previousUrls.filter((u) => !desiredSet.has(u)),
    ]);
    for (const url of urlsToCleanup) {
      await deleteCloudinaryImageIfOrphan(url, placeId);
    }
  }
}
