import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { prisma } from '../../config/database';
import { canonicalVerificationService } from './services/verification.service';
import { placesCanonicalService } from '../places/services/places.canonical.service';
import { placesMergeService } from '../places/services/places.merge.service';
import { scoreDuplicatePair } from './services/duplicate-scoring.service';
import { canonicalMonitoringService } from './services/canonical-monitoring.service';
import { placesSearchEngine } from './services/places-search-engine.service';
import { boundaryValidationService } from './services/boundary-validation.service';
import { provenanceService } from './services/provenance.service';
import { imagePipelineService } from './services/image-pipeline.service';

export const canonicalController = {
  resolvePlace: catchAsync(async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const hits = await placesCanonicalService.searchByAliasOrName(q, 20);
    sendSuccess(res, hits);
  }),

  duplicateCandidates: catchAsync(async (req: Request, res: Response) => {
    const status = (req.query.status as string) || 'OPEN';
    const rows = await prisma.placeDuplicateCandidate.findMany({
      where: { status: status as any },
      orderBy: { confidenceScore: 'desc' },
      take: 100,
      include: {
        placeA: { select: { id: true, name: true, state: true, city: true, publicPlaceId: true, dataQuality: true } },
        placeB: { select: { id: true, name: true, state: true, city: true, publicPlaceId: true, dataQuality: true } },
      },
    });
    sendSuccess(res, rows);
  }),

  mergePlaces: catchAsync(async (req: any, res: Response) => {
    const { canonicalPlaceId, reason, autoPickCanonical } = req.body;
    let { duplicatePlaceIds } = req.body as { duplicatePlaceIds: string[] };
    let canonicalId = canonicalPlaceId;
    if (autoPickCanonical && duplicatePlaceIds?.length === 1) {
      const [a, b] = await Promise.all([
        prisma.place.findUnique({ where: { id: canonicalPlaceId } }),
        prisma.place.findUnique({ where: { id: duplicatePlaceIds[0] } }),
      ]);
      if (a && b) {
        const { pickCanonicalPlace, pickDuplicateSide } = await import('./services/canonical-pick.service');
        const winner = pickCanonicalPlace(a, b);
        canonicalId = pickDuplicateSide(winner, a, b).canonicalPlaceId;
        duplicatePlaceIds = [pickDuplicateSide(winner, a, b).duplicatePlaceId];
      }
    }
    const result = await placesMergeService.mergeDuplicates({
      canonicalPlaceId: canonicalId,
      duplicatePlaceIds,
      mergedById: req.user.id,
      reason,
    });
    sendSuccess(res, result, { message: 'Places merged' });
  }),

  dismissDuplicate: catchAsync(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const row = await prisma.placeDuplicateCandidate.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedAt: new Date() },
    });
    sendSuccess(res, row);
  }),

  verificationQueue: catchAsync(async (_req: Request, res: Response) => {
    const rows = await prisma.place.findMany({
      where: { mergedIntoId: null, dataQuality: { in: ['DRAFT', 'PENDING_REVIEW'] }, status: 'APPROVED' },
      select: {
        id: true,
        name: true,
        state: true,
        city: true,
        dataQuality: true,
        publicPlaceId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    sendSuccess(res, rows);
  }),

  mergeLogs: catchAsync(async (req: Request, res: Response) => {
    const placeId = req.query.placeId as string | undefined;
    const rows = await prisma.placeMergeLog.findMany({
      where: placeId ? { canonicalPlaceId: placeId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    sendSuccess(res, rows);
  }),

  scorePair: catchAsync(async (req: Request, res: Response) => {
    const result = scoreDuplicatePair(req.body);
    sendSuccess(res, result);
  }),

  verifyPlace: catchAsync(async (req: any, res: Response) => {
    const result = await canonicalVerificationService.promoteToVerified(
      req.params.id,
      req.user.id,
      req.body?.notes,
    );
    sendSuccess(res, result, { message: result.verified ? 'Place verified' : 'Verification failed' });
  }),

  bulkVerifyPlaces: catchAsync(async (req: any, res: Response) => {
    const placeIds = Array.isArray(req.body?.placeIds) ? req.body.placeIds.map(String) : [];
    if (!placeIds.length) {
      sendSuccess(res, { attempted: 0, verified: 0, failed: 0, results: [] });
      return;
    }
    const result = await canonicalVerificationService.bulkPromoteToVerified(
      placeIds.slice(0, 100),
      req.user.id,
      req.body?.notes,
    );
    sendSuccess(res, result, { message: `Verified ${result.verified} of ${result.attempted} places` });
  }),

  rollbackPlaceVersion: catchAsync(async (req: any, res: Response) => {
    const versionNumber = parseInt(String(req.body?.versionNumber ?? req.params.versionNumber), 10);
    const result = await provenanceService.rollbackToVersion(
      String(req.params.id),
      versionNumber,
      req.user.id,
    );
    sendSuccess(res, result, { message: `Restored version ${versionNumber}` });
  }),

  listPlaceVersions: catchAsync(async (req: Request, res: Response) => {
    const rows = await prisma.placeVersion.findMany({
      where: { placeId: String(req.params.id) },
      orderBy: { versionNumber: 'desc' },
      take: 50,
      select: {
        id: true,
        versionNumber: true,
        changeSummary: true,
        createdById: true,
        createdAt: true,
      },
    });
    sendSuccess(res, rows);
  }),

  platformStatus: catchAsync(async (_req: Request, res: Response) => {
    const metrics = await canonicalMonitoringService.dashboardMetrics();
    const withPublicId = await prisma.place.count({ where: { publicPlaceId: { not: null } } });
    sendSuccess(res, {
      places: {
        total: metrics.verification.total,
        verified: metrics.verification.verified,
        draft: metrics.verification.draft,
        withPublicId,
      },
      duplicateCandidatesOpen: metrics.duplicates.openCandidates,
      boundaryValidation: metrics.boundaries.dataset.loaded ? 'licensed_geojson' : 'bbox_only',
      semanticSearch: metrics.search.embeddingProviderConfigured ? 'hybrid_enabled' : 'lexical_only',
    });
  }),

  dashboardMetrics: catchAsync(async (_req: Request, res: Response) => {
    sendSuccess(res, await canonicalMonitoringService.dashboardMetrics());
  }),

  hybridSearch: catchAsync(async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10), 50);
    const inspect = req.query.inspect === 'true' || req.query.inspect === '1';
    if (inspect) {
      sendSuccess(res, await placesSearchEngine.inspect(q, limit));
      return;
    }
    sendSuccess(res, await placesSearchEngine.search(q, limit));
  }),

  validateBoundariesBatch: catchAsync(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.body?.limit ?? 500), 10), 2000);
    sendSuccess(res, await boundaryValidationService.validateBatch(limit));
  }),

  runImagePipeline: catchAsync(async (req: Request, res: Response) => {
    sendSuccess(res, await imagePipelineService.processPlaceImage(String(req.params.id)));
  }),

  verifyImageLicense: catchAsync(async (req: any, res: Response) => {
    sendSuccess(res, await imagePipelineService.verifyLicense(String(req.params.id), req.user.id, req.body));
  }),

  runDuplicateScan: catchAsync(async (req: Request, res: Response) => {
    const precision = parseInt(String(req.body?.precision ?? 6), 10);
    const prefixBatch = parseInt(String(req.body?.prefixBatch ?? 100), 10);
    const prefixOffset = parseInt(String(req.body?.prefixOffset ?? 0), 10);
    const { runGeohashBlockedDuplicateScanPage } = await import('./services/corpus-dedupe.service');
    sendSuccess(res, await runGeohashBlockedDuplicateScanPage({ precision, prefixBatch, prefixOffset }));
  }),

  autoMergeCandidates: catchAsync(async (req: any, res: Response) => {
    const minConfidence = parseFloat(String(req.body?.minConfidence ?? 0.86));
    const limit = parseInt(String(req.body?.limit ?? 50), 10);
    const { autoMergeHighConfidenceCandidates } = await import('./services/corpus-dedupe.service');
    sendSuccess(
      res,
      await autoMergeHighConfidenceCandidates({
        minConfidence,
        limit,
        mergedById: req.user.id,
      }),
    );
  }),

  qualityReport: catchAsync(async (_req: Request, res: Response) => {
    const { buildDatabaseQualityReport } = await import('./services/database-quality-report.service');
    sendSuccess(res, await buildDatabaseQualityReport());
  }),
};
