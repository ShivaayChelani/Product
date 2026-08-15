import { prisma } from '../../../config/database';
import { boundaryDatasetProvider } from './boundary-dataset.provider';
import { embeddingService } from './embedding.service';
import { env } from '../../../config/env';
import { INDIA_BOUNDS } from '../../../shared/utils/indiaGeo';

async function countDuplicateImageHashes(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM place_images pi
    WHERE pi.perceptual_hash IS NOT NULL
      AND pi.perceptual_hash IN (
        SELECT perceptual_hash FROM place_images
        WHERE perceptual_hash IS NOT NULL
        GROUP BY perceptual_hash HAVING COUNT(*) > 1
      )
  `.catch(() => [{ count: BigInt(0) }]);
  return Number(rows[0]?.count ?? 0);
}

async function countInvalidCoordinates(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM places p
    WHERE p.merged_into_id IS NULL
      AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      AND (
        p.latitude < -90 OR p.latitude > 90
        OR p.longitude < -180 OR p.longitude > 180
        OR p.latitude < ${INDIA_BOUNDS.minLat} OR p.latitude > ${INDIA_BOUNDS.maxLat}
        OR p.longitude < ${INDIA_BOUNDS.minLng} OR p.longitude > ${INDIA_BOUNDS.maxLng}
      )
  `.catch(() => [{ count: BigInt(0) }]);
  return Number(rows[0]?.count ?? 0);
}

export const canonicalMonitoringService = {
  async dashboardMetrics() {
    const [
      placeTotal,
      verified,
      draft,
      pendingReview,
      dupOpen,
      dupMerged,
      dupDismissed,
      mergeLogCount,
      boundaryFailures,
      boundaryTotal,
      imagesTotal,
      imagesRejected,
      imagesLicenseVerified,
      imagesUnverified,
      placesMissingThumbnail,
      duplicateImageRows,
      embeddingCount,
      embeddingIndexed,
      embeddingPending,
      embeddingFailed,
      embeddingSkipped,
      searchLogs7d,
      missingCoords,
    ] = await Promise.all([
      prisma.place.count({ where: { mergedIntoId: null } }),
      prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } }),
      prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'DRAFT' } }),
      prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'PENDING_REVIEW' } }),
      prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
      prisma.placeDuplicateCandidate.count({ where: { status: 'MERGED' } }),
      prisma.placeDuplicateCandidate.count({ where: { status: 'DISMISSED' } }),
      prisma.placeMergeLog.count(),
      prisma.placeBoundaryValidation.count({
        where: { OR: [{ stateValid: false }, { districtValid: false }, { withinIndia: false }] },
      }),
      prisma.placeBoundaryValidation.count(),
      prisma.placeImage.count(),
      prisma.placeImage.count({ where: { verificationStatus: 'REJECTED' } }),
      prisma.placeImage.count({ where: { verificationStatus: 'LICENSE_VERIFIED' } }),
      prisma.placeImage.count({ where: { verificationStatus: 'UNVERIFIED' } }),
      prisma.place.count({
        where: {
          mergedIntoId: null,
          OR: [{ thumbnail: null }, { thumbnail: '' }],
        },
      }),
      countDuplicateImageHashes(),
      prisma.placeSearchEmbedding.count(),
      prisma.place.count({ where: { mergedIntoId: null, embeddingStatus: 'INDEXED' } }),
      prisma.place.count({ where: { mergedIntoId: null, embeddingStatus: 'PENDING' } }),
      prisma.place.count({ where: { mergedIntoId: null, embeddingStatus: 'FAILED' } }),
      prisma.place.count({ where: { mergedIntoId: null, embeddingStatus: 'SKIPPED' } }),
      prisma.searchQueryLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      prisma.place.count({
        where: {
          mergedIntoId: null,
          OR: [{ latitude: null }, { longitude: null }],
        },
      }),
    ]);

    const invalidCoordinates = await countInvalidCoordinates();

    const verificationCoverage = placeTotal > 0 ? verified / placeTotal : 0;
    const imageComplianceRate = imagesTotal > 0 ? imagesLicenseVerified / imagesTotal : 0;
    const boundaryFailureRate = boundaryTotal > 0 ? boundaryFailures / boundaryTotal : 0;
    const embeddingCoverage = placeTotal > 0 ? embeddingIndexed / placeTotal : 0;

    return {
      duplicates: {
        openCandidates: dupOpen,
        mergedCandidates: dupMerged,
        dismissedCandidates: dupDismissed,
        mergeOperations: mergeLogCount,
      },
      verification: {
        total: placeTotal,
        verified,
        draft,
        pendingReview,
        coveragePercent: Math.round(verificationCoverage * 1000) / 10,
      },
      images: {
        total: imagesTotal,
        rejected: imagesRejected,
        licenseVerified: imagesLicenseVerified,
        unverified: imagesUnverified,
        brokenUrls: imagesRejected,
        duplicateHashes: duplicateImageRows,
        placesMissingThumbnail,
        compliancePercent: Math.round(imageComplianceRate * 1000) / 10,
      },
      search: {
        queriesLast7Days: searchLogs7d,
        hybridSearchEnabled: env.hybridSearchEnabled,
        mode: env.hybridSearchEnabled ? 'hybrid' : 'lexical',
        embeddingsIndexed: embeddingCount,
        embeddingProviderConfigured: embeddingService.isConfigured(),
        embeddingCoveragePercent: Math.round(embeddingCoverage * 1000) / 10,
        embeddingStatus: {
          indexed: embeddingIndexed,
          pending: embeddingPending,
          failed: embeddingFailed,
          skipped: embeddingSkipped,
        },
      },
      boundaries: {
        dataset: boundaryDatasetProvider.getStatus(),
        validationsTotal: boundaryTotal,
        failureRatePercent: Math.round(boundaryFailureRate * 1000) / 10,
        invalidCoordinates,
        missingCoordinates: missingCoords,
      },
    };
  },
};
