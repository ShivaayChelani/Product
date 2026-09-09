import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Account-deletion media purge for Cloudinary.
 *
 * PalSafar does NOT store Cloudinary public_ids in the database — every media
 * reference is a secure URL (User.avatar, Reel.videoUrl, Vendor.images, …).
 * This service:
 *   1. collects every user-owned media URL from rows that cascade away with the
 *      user (ownership proven by the DB row itself),
 *   2. derives { publicId, resourceType } deterministically from each URL,
 *   3. verifies Cloudinary's `context.owner` metadata when present
 *      (defense-in-depth against stale/corrupted URL rows),
 *   4. destroys each asset AFTER the DB transaction has committed, and
 *   5. persists any failure to MediaCleanupTask so a retry job can finish.
 *
 * Credentials never leave the server: all calls use the env-configured SDK in
 * config/upload.ts; clients only ever receive aggregate counts.
 */

const ALLOWED_PUBLIC_ID_PREFIX = 'palsasafar/';
const MAX_CLEANUP_ATTEMPTS = 8;
/** Skip tasks retried within this window to avoid racing an inline attempt. */
const RETRY_BACKOFF_MS = 60_000;

export type MediaResourceType = 'image' | 'video' | 'raw';

export interface CloudinaryAssetRef {
  publicId: string;
  resourceType: MediaResourceType;
}

export interface MediaPurgeSummary {
  found: number;
  deleted: number;
  notFound: number;
  skippedOwnership: number;
  failed: number;
  queuedForRetry: number;
}

interface CloudinaryResourceLike {
  public_id?: string;
  context?: {
    custom?: Record<string, unknown> | string;
    owner?: unknown;
  };
}

// res.cloudinary.com/<cloud>/<type>/upload/[v<version>/]<public_id>.<ext>
const CLOUDINARY_URL_PATTERN =
  /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(.+)$/i;

/**
 * Extract { publicId, resourceType } from a Cloudinary delivery URL.
 * Returns null for anything that is not a PalSafar-owned Cloudinary asset,
 * so external URLs (YouTube, Instagram, partner CDNs…) are ignored safely.
 */
export function extractCloudinaryAsset(rawUrl: unknown): CloudinaryAssetRef | null {
  if (typeof rawUrl !== 'string') return null;
  const match = rawUrl.trim().match(CLOUDINARY_URL_PATTERN);
  if (!match) return null;

  const resourceType = match[1].toLowerCase() as MediaResourceType;
  let segments = match[2].split('/').filter(Boolean);
  // Drop an explicit version segment (v1712345678). Transformation segments are
  // not expected on stored secure_urls; anything unparsable fails the prefix
  // check below rather than deleting a guessed id.
  if (segments.length > 1 && /^v\d+$/.test(segments[0])) {
    segments = segments.slice(1);
  }
  if (segments.length === 0) return null;

  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf('.');
  segments[segments.length - 1] = dot > 0 ? last.slice(0, dot) : last;

  let publicId: string;
  try {
    publicId = decodeURIComponent(segments.join('/'));
  } catch {
    return null;
  }

  if (!publicId.startsWith(ALLOWED_PUBLIC_ID_PREFIX)) return null;
  return { publicId, resourceType };
}

function readContextOwner(resource: CloudinaryResourceLike): string | undefined {
  const context = resource?.context;
  if (!context) return undefined;
  if (typeof context.custom === 'string') {
    try {
      const parsed = JSON.parse(context.custom) as Record<string, unknown>;
      const owner = parsed?.owner;
      return typeof owner === 'string' ? owner : undefined;
    } catch {
      return undefined;
    }
  }
  const owner = context.custom?.owner ?? context.owner;
  return typeof owner === 'string' ? owner : undefined;
}

function isNotFound(err: unknown): boolean {
  const e = err as { http_code?: number; message?: string };
  return e?.http_code === 404 || /not\s*found|doesn'?t\s*exist/i.test(String(e?.message ?? ''));
}

async function destroyVerified(ref: CloudinaryAssetRef, userId: string): Promise<'deleted' | 'not_found' | 'skipped_ownership'> {
  // Defense-in-depth: confirm existence + owner context before destroying.
  // Ownership is primarily proven by the cascaded DB row this URL came from;
  // the context check only guards against stale or corrupted URL columns.
  try {
    const resource = (await cloudinary.api.resource(ref.publicId, {
      resource_type: ref.resourceType,
    })) as CloudinaryResourceLike;
    const owner = readContextOwner(resource);
    if (owner && owner !== userId) {
      logger.warn(
        { publicId: ref.publicId, contextOwner: owner, deletedUserId: userId },
        '[MediaCleanup] Skipped asset: Cloudinary context owner does not match deleted user',
      );
      return 'skipped_ownership';
    }
  } catch (err) {
    if (!isNotFound(err)) throw err;
    // Asset already gone (or never existed) — treat as success.
    return 'not_found';
  }

  const result = await cloudinary.uploader.destroy(ref.publicId, {
    resource_type: ref.resourceType,
    invalidate: true,
  });
  if (result?.result && result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Cloudinary destroy returned "${result.result}"`);
  }
  return result?.result === 'not found' ? 'not_found' : 'deleted';
}

async function enqueueCleanupTask(
  ref: CloudinaryAssetRef,
  userId: string,
  err: unknown,
): Promise<void> {
  const message = String((err as Error)?.message ?? err).slice(0, 500);
  try {
    await prisma.mediaCleanupTask.upsert({
      where: { publicId_resourceType: { publicId: ref.publicId, resourceType: ref.resourceType } },
      create: {
        userId,
        publicId: ref.publicId,
        resourceType: ref.resourceType,
        status: 'PENDING',
        attempts: 1,
        lastError: message,
      },
      update: {
        status: 'PENDING',
        attempts: { increment: 1 },
        lastError: message,
      },
    });
  } catch (enqueueErr) {
    // Last resort: the queue write itself failed. Log loudly so ops can act —
    // the account deletion itself is still complete and consistent.
    logger.error(
      { enqueueErr, originalError: message, userId, publicId: ref.publicId, resourceType: ref.resourceType },
      '[MediaCleanup] FAILED TO PERSIST cleanup retry task',
    );
  }
}

/**
 * Collect every media URL owned by the user from rows that are about to be
 * removed by the deletion transaction (cascade or explicit delete).
 * MUST be called BEFORE the user row is deleted.
 */
export async function collectUserOwnedMediaAssets(userId: string): Promise<CloudinaryAssetRef[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatar: true,
      creatorProfile: {
        select: {
          sampleReelUrl: true,
          reels: { select: { videoUrl: true, thumbnail: true } },
        },
      },
      vendor: {
        select: {
          imageUrl: true,
          images: true,
          documents: true,
          vendorDocuments: { select: { fileUrl: true } },
          reels: { select: { videoUrl: true, thumbnail: true } },
        },
      },
      userPlaceImages: { select: { url: true } },
    },
  });
  if (!user) return [];

  const urls: unknown[] = [
    user.avatar,
    user.creatorProfile?.sampleReelUrl,
    ...(user.creatorProfile?.reels.flatMap((r) => [r.videoUrl, r.thumbnail]) ?? []),
    user.vendor?.imageUrl,
    ...(user.vendor?.images ?? []),
    ...(user.vendor?.documents ?? []),
    ...(user.vendor?.vendorDocuments.map((d) => d.fileUrl) ?? []),
    ...(user.vendor?.reels.flatMap((r) => [r.videoUrl, r.thumbnail]) ?? []),
    ...user.userPlaceImages.map((i) => i.url),
  ];

  const refs = new Map<string, CloudinaryAssetRef>();
  for (const url of urls) {
    const asset = extractCloudinaryAsset(url);
    if (asset) refs.set(`${asset.publicId}|${asset.resourceType}`, asset);
  }

  logger.info({ userId, assets: refs.size }, '[MediaCleanup] Collected user-owned Cloudinary assets');
  return [...refs.values()];
}

/**
 * Best-effort CDN purge. Never throws into the caller: per-asset failures are
 * persisted to MediaCleanupTask for the retry job. Run AFTER the deletion
 * transaction commits so the database is consistent regardless of outcome.
 */
export async function purgeUserMediaAssets(
  refs: CloudinaryAssetRef[],
  userId: string,
): Promise<MediaPurgeSummary> {
  const summary: MediaPurgeSummary = {
    found: refs.length,
    deleted: 0,
    notFound: 0,
    skippedOwnership: 0,
    failed: 0,
    queuedForRetry: 0,
  };

  for (const ref of refs) {
    try {
      const outcome = await destroyVerified(ref, userId);
      if (outcome === 'deleted') summary.deleted += 1;
      else if (outcome === 'not_found') summary.notFound += 1;
      else summary.skippedOwnership += 1;
    } catch (err) {
      summary.failed += 1;
      await enqueueCleanupTask(ref, userId, err);
      logger.error(
        { err, userId, publicId: ref.publicId, resourceType: ref.resourceType },
        '[MediaCleanup] Cloudinary destroy failed — task queued for retry',
      );
    }
  }

  summary.queuedForRetry = summary.failed;
  logger.info({ userId, ...summary }, '[MediaCleanup] Purge finished');
  return summary;
}

/**
 * Retry pending cleanup tasks (retry job entry point).
 * Tasks exceeding maxAttempts are marked FAILED and left for manual review.
 */
export async function processPendingMediaCleanup(opts?: {
  limit?: number;
  maxAttempts?: number;
}): Promise<{ processed: number; deleted: number; notFound: number; failed: number; exhausted: number }> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 200));
  const maxAttempts = opts?.maxAttempts ?? MAX_CLEANUP_ATTEMPTS;
  const stats = { processed: 0, deleted: 0, notFound: 0, failed: 0, exhausted: 0 };

  const tasks = await prisma.mediaCleanupTask.findMany({
    where: {
      status: 'PENDING',
      updatedAt: { lt: new Date(Date.now() - RETRY_BACKOFF_MS) },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  for (const task of tasks) {
    if (task.attempts >= maxAttempts) {
      await prisma.mediaCleanupTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', lastError: 'Exceeded maximum retry attempts' },
      });
      stats.exhausted += 1;
      logger.warn(
        { taskId: task.id, publicId: task.publicId, attempts: task.attempts },
        '[MediaCleanup] Task marked FAILED after exhausting retries',
      );
      continue;
    }

    stats.processed += 1;
    try {
      const outcome = await destroyVerified(
        { publicId: task.publicId, resourceType: task.resourceType as MediaResourceType },
        task.userId,
      );
      await prisma.mediaCleanupTask.update({
        where: { id: task.id },
        data: { status: outcome === 'skipped_ownership' ? 'SKIPPED' : 'DELETED', lastError: null },
      });
      if (outcome === 'not_found') stats.notFound += 1;
      else stats.deleted += 1;
    } catch (err) {
      stats.failed += 1;
      const message = String((err as Error)?.message ?? err).slice(0, 500);
      await prisma.mediaCleanupTask
        .update({
          where: { id: task.id },
          data: { attempts: { increment: 1 }, lastError: message },
        })
        .catch(() => {});
      logger.error(
        { err, taskId: task.id, publicId: task.publicId },
        '[MediaCleanup] Retry attempt failed',
      );
    }
  }

  logger.info(stats, '[MediaCleanup] Retry pass complete');
  return stats;
}
