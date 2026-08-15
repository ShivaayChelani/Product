import { describe, expect, it } from 'vitest';
import { normalizeForMatch, nameSimilarityScore } from '../shared/utils/canonicalText';
import { isCoordinateInIndia } from '../shared/utils/indiaGeo';
import { bayesianRating, detectRatingAnomaly } from '../modules/canonical/services/bayesian-rating.service';
import { scoreDuplicatePair } from '../modules/canonical/services/duplicate-scoring.service';
import { imageRightsService } from '../modules/canonical/services/image-rights.service';
import { ImageVerificationStatus } from '@prisma/client';

describe('canonicalText', () => {
  it('normalizes Hindi and Latin for alias lookup', () => {
    expect(normalizeForMatch('  Bheda Ghat ')).toBe('bheda ghat');
    expect(normalizeForMatch('भेड़ाघाट')).toBe('भेड़ाघाट');
  });

  it('scores unrelated names low without shared alias', () => {
    const score = nameSimilarityScore('Bhedaghat', 'Marble Rocks');
    expect(score).toBe(0);
  });

  it('scores alias match via duplicate engine', () => {
    const r = scoreDuplicatePair({
      nameA: 'Marble Rocks',
      nameB: 'Bhedaghat',
      aliasesB: ['Marble Rocks', 'Dhuandhar Falls'],
      latA: 23.1324,
      lngA: 79.8043,
      latB: 23.1324,
      lngB: 79.8043,
      stateA: 'Madhya Pradesh',
      stateB: 'Madhya Pradesh',
    });
    expect(r.confidence).toBeGreaterThan(0.85);
    expect(r.action).toBe('MERGE');
  });
});

describe('indiaGeo', () => {
  it('accepts Jabalpur area coordinates', () => {
    expect(isCoordinateInIndia(23.1324, 79.8043)).toBe(true);
  });

  it('rejects coordinates outside India', () => {
    expect(isCoordinateInIndia(51.5, -0.12)).toBe(false);
  });
});

describe('bayesianRating', () => {
  it('returns null without reviews', () => {
    expect(bayesianRating({ averageRating: 4.8, reviewCount: 0 })).toBeNull();
  });

  it('pulls extreme low-sample ratings toward prior', () => {
    const b = bayesianRating({ averageRating: 5, reviewCount: 1, globalMean: 4, minimumReviews: 10 });
    expect(b).not.toBeNull();
    expect(b!).toBeLessThan(5);
  });

  it('flags suspicious perfect ratings with few reviews', () => {
    expect(detectRatingAnomaly(5, 2)).toBe(true);
    expect(detectRatingAnomaly(4.2, 50)).toBe(false);
  });
});

describe('duplicateScoring', () => {
  it('suggests review for similar names at same location', () => {
    const r = scoreDuplicatePair({
      nameA: 'Bhedaghat',
      nameB: 'Bheda Ghat',
      latA: 23.1324,
      lngA: 79.8043,
      latB: 23.1325,
      lngB: 79.8044,
      stateA: 'Madhya Pradesh',
      stateB: 'Madhya Pradesh',
      categoryA: 'ghat',
      categoryB: 'ghat',
    });
    expect(r.confidence).toBeGreaterThan(0.12);
    expect(['MERGE', 'REVIEW', 'DISTINCT']).toContain(r.action);
  });
});

describe('imageRights', () => {
  it('rejects unlicensed images', () => {
    const v = imageRightsService.validate({
      url: 'https://example.com/a.jpg',
      verificationStatus: ImageVerificationStatus.UNVERIFIED,
    });
    expect(v.accepted).toBe(false);
    expect(v.reasons).toContain('LICENSE_NOT_VERIFIED');
  });
});

describe('placesSearchEngine', () => {
  it('defaults to lexical mode when hybrid disabled', async () => {
    const { placesSearchEngine } = await import('../modules/canonical/services/places-search-engine.service');
    expect(placesSearchEngine.mode()).toBe('lexical');
  });

  it('returns empty inspect payload for blank query', async () => {
    const { placesSearchEngine } = await import('../modules/canonical/services/places-search-engine.service');
    const result = await placesSearchEngine.inspect('   ');
    expect(result.query).toBe('');
    expect(result.hits).toEqual([]);
  });
});
