import { PlaceDataQuality, ImageVerificationStatus, PlaceSource } from '@prisma/client';
import { isCoordinateInIndia } from '../../../shared/utils/indiaGeo';

export type PlaceQualityInput = {
  name: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
  state: string;
  district?: string;
  source?: PlaceSource;
  rating?: number | null;
  reviewCount?: number;
  images?: { url: string; verificationStatus?: ImageVerificationStatus; license?: string | null }[];
  dataQuality?: PlaceDataQuality;
};

export type QualityCheck = { ok: boolean; code: string; message: string };

export const placesQualityService = {
  validate(input: PlaceQualityInput): QualityCheck[] {
    const checks: QualityCheck[] = [];

    if (!input.name?.trim()) {
      checks.push({ ok: false, code: 'NAME_REQUIRED', message: 'Canonical name is required.' });
    }

    if (input.latitude == null || input.longitude == null) {
      checks.push({ ok: false, code: 'COORDS_REQUIRED', message: 'Latitude and longitude are required.' });
    } else if (!isCoordinateInIndia(input.latitude, input.longitude)) {
      checks.push({ ok: false, code: 'COORDS_OUTSIDE_INDIA', message: 'Coordinates must lie within India.' });
    }

    if (!input.category?.trim()) {
      checks.push({ ok: false, code: 'CATEGORY_REQUIRED', message: 'Category is required.' });
    }

    if (!input.state?.trim()) {
      checks.push({ ok: false, code: 'STATE_REQUIRED', message: 'State is required.' });
    }

    if (!input.description?.trim() || input.description.trim().length < 40) {
      checks.push({
        ok: false,
        code: 'DESCRIPTION_INSUFFICIENT',
        message: 'Description must be factual and at least 40 characters.',
      });
    }

    if (input.rating != null && (input.reviewCount ?? 0) === 0) {
      checks.push({
        ok: false,
        code: 'RATING_WITHOUT_REVIEWS',
        message: 'Average rating requires at least one verified review.',
      });
    }

    const imgs = input.images ?? [];
    for (const img of imgs) {
      if (img.verificationStatus !== ImageVerificationStatus.LICENSE_VERIFIED) {
        checks.push({
          ok: false,
          code: 'IMAGE_NOT_LICENSE_VERIFIED',
          message: `Image not license-verified: ${img.url}`,
        });
        break;
      }
      if (!img.license?.trim()) {
        checks.push({
          ok: false,
          code: 'IMAGE_LICENSE_MISSING',
          message: 'Licensed images must include license metadata.',
        });
        break;
      }
    }

    // Block obvious placeholder / stock-only sources for VERIFIED tier
    if (input.source === PlaceSource.OSM && input.dataQuality === PlaceDataQuality.VERIFIED) {
      checks.push({
        ok: false,
        code: 'OSM_NOT_VERIFIED_TIER',
        message: 'OSM-sourced rows must pass human review before VERIFIED.',
      });
    }

    return checks;
  },

  canMarkVerified(input: PlaceQualityInput): { verified: boolean; failures: QualityCheck[] } {
    const failures = this.validate(input);
    return { verified: failures.length === 0, failures };
  },

  computeVerificationScore(failureCount: number, totalChecks = 8): number {
    return Math.round(((totalChecks - failureCount) / totalChecks) * 100);
  },
};
