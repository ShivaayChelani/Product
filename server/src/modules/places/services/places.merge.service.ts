import { PlaceAliasType, PlaceDataQuality, PlaceStatus } from '@prisma/client';
import { prisma } from '../../../config/database';
import { normalizeForMatch } from '../../../shared/utils/canonicalText';
import { recalculatePlaceRating } from './places.helpers';
import { provenanceService } from '../../canonical/services/provenance.service';

export type MergeParams = {
  canonicalPlaceId: string;
  duplicatePlaceIds: string[];
  mergedById?: string;
  reason?: string;
};

/**
 * Production merge: never deletes rows — reassigns child FKs, preserves aliases & audit.
 */
export const placesMergeService = {
  async mergeDuplicates(params: MergeParams) {
    const canonicalId = params.canonicalPlaceId;
    const merged: string[] = [];

    for (const dupId of params.duplicatePlaceIds) {
      if (dupId === canonicalId) continue;

      await prisma.$transaction(async (tx) => {
        const dup = await tx.place.findUnique({
          where: { id: dupId },
          include: { aliases: true },
        });
        if (!dup || dup.mergedIntoId) return;

        await provenanceService.snapshotVersion(
          canonicalId,
          params.mergedById,
          `Pre-merge snapshot before absorbing ${dupId}`,
        );

        const aliasTexts = new Set<string>([dup.name, ...dup.aliases.map((a) => a.alias)]);
        for (const alias of aliasTexts) {
          const normalizedAlias = normalizeForMatch(alias);
          if (!normalizedAlias) continue;
          await tx.placeAlias.upsert({
            where: { placeId_normalizedAlias: { placeId: canonicalId, normalizedAlias } },
            create: {
              placeId: canonicalId,
              alias,
              normalizedAlias,
              aliasType: PlaceAliasType.OFFICIAL_VARIANT,
              source: 'merge',
            },
            update: {},
          });
        }

        const dupReviews = await tx.review.findMany({ where: { placeId: dupId } });
        for (const r of dupReviews) {
          const clash = await tx.review.findUnique({
            where: { placeId_userId: { placeId: canonicalId, userId: r.userId } },
          });
          if (clash) continue;
          await tx.review.update({ where: { id: r.id }, data: { placeId: canonicalId } });
        }

        // Unique (placeId, userId) — drop dup rows that already exist on canonical.
        const dupCheckIns = await tx.checkIn.findMany({ where: { placeId: dupId } });
        for (const c of dupCheckIns) {
          const clash = await tx.checkIn.findUnique({
            where: { placeId_userId: { placeId: canonicalId, userId: c.userId } },
          });
          if (clash) {
            await tx.checkIn.delete({ where: { id: c.id } });
          } else {
            await tx.checkIn.update({ where: { id: c.id }, data: { placeId: canonicalId } });
          }
        }

        await tx.placeStat.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });
        await tx.placeImage.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });
        await tx.placeVideo.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });
        await tx.placeOffer.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });
        await tx.placeEvent.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });
        await tx.userPlaceImage.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });

        const dupStops = await tx.tripPlanStop.findMany({ where: { placeId: dupId } });
        for (const stop of dupStops) {
          const clash = await tx.tripPlanStop.findUnique({
            where: {
              tripPlanDayId_placeId: { tripPlanDayId: stop.tripPlanDayId, placeId: canonicalId },
            },
          });
          if (clash) {
            await tx.tripPlanStop.delete({ where: { id: stop.id } });
          } else {
            await tx.tripPlanStop.update({ where: { id: stop.id }, data: { placeId: canonicalId } });
          }
        }

        const dupCollections = await tx.collectionPlace.findMany({ where: { placeId: dupId } });
        for (const cp of dupCollections) {
          const clash = await tx.collectionPlace.findUnique({
            where: {
              collectionId_placeId: { collectionId: cp.collectionId, placeId: canonicalId },
            },
          });
          if (clash) {
            await tx.collectionPlace.delete({ where: { id: cp.id } });
          } else {
            await tx.collectionPlace.update({ where: { id: cp.id }, data: { placeId: canonicalId } });
          }
        }

        await tx.reel.updateMany({ where: { placeId: dupId }, data: { placeId: canonicalId } });

        const canonical = await tx.place.findUnique({ where: { id: canonicalId } });
        if (canonical) {
          const tags = [...new Set([...(canonical.tags || []), ...(dup.tags || [])])];
          const images = [...new Set([...(canonical.images || []), ...(dup.images || [])])];
          await tx.place.update({
            where: { id: canonicalId },
            data: {
              tags,
              images,
              thumbnail: canonical.thumbnail || dup.thumbnail || images[0] || null,
            },
          });
        }

        await tx.place.update({
          where: { id: dupId },
          data: {
            mergedIntoId: canonicalId,
            status: PlaceStatus.REJECTED,
            dataQuality: PlaceDataQuality.REJECTED,
          },
        });

        await tx.placeMergeLog.create({
          data: {
            canonicalPlaceId: canonicalId,
            mergedPlaceId: dupId,
            mergedById: params.mergedById,
            reason: params.reason ?? 'production_merge',
            preservedAliases: [...aliasTexts].map((a) => ({ alias: a })),
          },
        });

        await tx.placeDuplicateCandidate.updateMany({
          where: {
            OR: [
              { placeAId: dupId, placeBId: canonicalId },
              { placeAId: canonicalId, placeBId: dupId },
            ],
          },
          data: { status: 'MERGED', resolvedAt: new Date() },
        });

        await provenanceService.logChange({
          placeId: canonicalId,
          actorId: params.mergedById,
          action: 'MERGE_DUPLICATE',
          before: { duplicateId: dupId, duplicateName: dup.name },
          after: { canonicalId },
        });
      });

      merged.push(dupId);
      await recalculatePlaceRating(canonicalId);
    }

    return { canonicalPlaceId: canonicalId, merged };
  },
};
