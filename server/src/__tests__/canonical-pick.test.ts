import { describe, expect, it } from 'vitest';
import { PlaceDataQuality, PlaceSource, PlaceStatus } from '@prisma/client';
import { pickCanonicalPlace } from '../modules/canonical/services/canonical-pick.service';

function place(partial: Partial<any>) {
  return {
    id: '1',
    name: 'A',
    createdAt: new Date('2020-01-01'),
    dataQuality: PlaceDataQuality.DRAFT,
    verificationLevel: 0,
    reviewCount: 0,
    publicPlaceId: null,
    source: PlaceSource.OSM,
    description: '',
    externalId: null,
    status: PlaceStatus.APPROVED,
    ...partial,
  } as any;
}

describe('pickCanonicalPlace', () => {
  it('prefers VERIFIED over DRAFT', () => {
    const a = place({ id: 'a', dataQuality: PlaceDataQuality.VERIFIED, publicPlaceId: 'IN-MP-001' });
    const b = place({ id: 'b', dataQuality: PlaceDataQuality.DRAFT, reviewCount: 100 });
    expect(pickCanonicalPlace(a, b).id).toBe('a');
  });

  it('prefers higher review count when quality equal', () => {
    const a = place({ id: 'a', reviewCount: 2 });
    const b = place({ id: 'b', reviewCount: 40 });
    expect(pickCanonicalPlace(a, b).id).toBe('b');
  });
});
