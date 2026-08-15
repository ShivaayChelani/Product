import { Place, PlaceDataQuality } from '@prisma/client';

const qualityRank: Record<PlaceDataQuality, number> = {
  VERIFIED: 4,
  PENDING_REVIEW: 3,
  DRAFT: 2,
  REJECTED: 0,
};

/** Pick the surviving canonical row when merging duplicates. */
export function pickCanonicalPlace(a: Place, b: Place): Place {
  const score = (p: Place) => {
    let s = 0;
    s += (qualityRank[p.dataQuality] ?? 0) * 1000;
    s += (p.verificationLevel ?? 0) * 100;
    s += Math.min(p.reviewCount ?? 0, 500);
    if (p.publicPlaceId) s += 50;
    if (p.source === 'ADMIN') s += 30;
    if (p.description && p.description.length >= 120) s += 20;
    if (p.externalId?.startsWith('wikidata:')) s += 10;
    return s;
  };
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa > sb ? a : b;
  return a.createdAt <= b.createdAt ? a : b;
}

export function pickDuplicateSide(
  canonical: Place,
  a: Place,
  b: Place,
): { canonicalPlaceId: string; duplicatePlaceId: string } {
  const dup = canonical.id === a.id ? b : a;
  return { canonicalPlaceId: canonical.id, duplicatePlaceId: dup.id };
}
