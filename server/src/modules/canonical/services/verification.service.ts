import { PlaceDataQuality } from '@prisma/client';
import { prisma } from '../../../config/database';
import { placesQualityService } from '../../places/services/places.quality.service';
import { allocatePublicPlaceId } from './public-place-id.service';
import { boundaryValidationService } from './boundary-validation.service';
import { provenanceService } from './provenance.service';
import { bayesianRating } from './bayesian-rating.service';

export const canonicalVerificationService = {
  async promoteToVerified(placeId: string, verifiedById: string, notes?: string) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: { placeImages: true },
    });
    if (!place || place.mergedIntoId) {
      throw new Error('Place not found or merged');
    }

    const { verified, failures } = placesQualityService.canMarkVerified({
      name: place.name,
      description: place.description,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category,
      state: place.state,
      district: place.district,
      rating: place.rating,
      reviewCount: place.reviewCount,
      images: place.placeImages.map((img) => ({
        url: img.url,
        verificationStatus: img.verificationStatus,
        license: img.license,
      })),
      dataQuality: PlaceDataQuality.VERIFIED,
    });

    if (!verified) {
      return { verified: false, failures };
    }

    if (place.latitude == null || place.longitude == null) {
      throw new Error('Missing coordinates');
    }

    const boundary = await boundaryValidationService.validatePlace(
      placeId,
      place.latitude,
      place.longitude,
      place.state,
      place.district,
    );
    if (!boundary.valid) {
      throw new Error('Coordinates outside India');
    }

    await provenanceService.snapshotVersion(placeId, verifiedById, 'Pre-verification snapshot');

    const publicPlaceId = place.publicPlaceId
      ?? await allocatePublicPlaceId(place.state, place.district, place.city);

    const qualityScore = placesQualityService.computeVerificationScore(failures.length);
    const bayesian = bayesianRating({
      averageRating: place.rating,
      reviewCount: place.reviewCount,
    });

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        dataQuality: PlaceDataQuality.VERIFIED,
        publicPlaceId,
        verificationLevel: 3,
        verificationScore: qualityScore,
        qualityScore,
        confidenceScore: qualityScore,
        bayesianRating: bayesian,
        lastVerifiedAt: new Date(),
        lastVerifiedById: verifiedById,
      },
    });

    await prisma.placeVerificationLog.create({
      data: {
        placeId,
        verifiedById,
        verificationScore: qualityScore,
        qualityScore,
        notes,
      },
    });

    await provenanceService.logChange({
      placeId,
      actorId: verifiedById,
      action: 'VERIFY',
      after: { publicPlaceId, dataQuality: 'VERIFIED' },
    });

    return { verified: true, place: updated, publicPlaceId, boundaryPending: boundary.pendingAuthoritativeBoundaries };
  },

  async bulkPromoteToVerified(placeIds: string[], verifiedById: string, notes?: string) {
    const results: Array<{
      placeId: string;
      verified: boolean;
      publicPlaceId?: string | null;
      failures?: { code: string; message: string }[];
      error?: string;
    }> = [];

    for (const placeId of placeIds) {
      try {
        const result = await this.promoteToVerified(placeId, verifiedById, notes);
        results.push({
          placeId,
          verified: result.verified,
          publicPlaceId: result.verified ? result.publicPlaceId : null,
          failures: result.verified ? undefined : result.failures,
        });
      } catch (err) {
        results.push({
          placeId,
          verified: false,
          error: err instanceof Error ? err.message : 'Verification failed',
        });
      }
    }

    const verified = results.filter((r) => r.verified).length;
    return {
      attempted: placeIds.length,
      verified,
      failed: placeIds.length - verified,
      results,
    };
  },
};
