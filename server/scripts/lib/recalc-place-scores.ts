import { prisma } from '../../src/config/database';
import { computeCompletenessScore } from './place-completeness';

export async function recalculateCompletenessForPlaces(placeIds: string[]): Promise<number> {
  if (!placeIds.length) return 0;

  const places = await prisma.place.findMany({
    where: { id: { in: placeIds }, mergedIntoId: null },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      state: true,
      district: true,
      city: true,
      village: true,
      fullAddress: true,
      description: true,
      history: true,
      category: true,
      subcategory: true,
      website: true,
      openingHours: true,
      ticketPrice: true,
      heritageStatus: true,
      unescoStatus: true,
      religiousType: true,
      naturalCultural: true,
      searchKeywords: true,
      tags: true,
      hasParking: true,
      parkingDetails: true,
      isAccessible: true,
      accessibilityDetails: true,
      hasWashroom: true,
      elevationMeters: true,
      postalCode: true,
      highlights: true,
      _count: {
        select: {
          aliases: true,
          translations: true,
          fieldProvenance: true,
          relationshipsFrom: true,
        },
      },
      placeImages: {
        where: { verificationStatus: 'LICENSE_VERIFIED' },
        take: 1,
        select: { id: true },
      },
      boundaryValidations: {
        where: { withinIndia: true },
        take: 1,
        select: { id: true },
      },
      relationshipsFrom: {
        where: { relationshipType: 'NEARBY' },
        take: 1,
        select: { id: true },
      },
    },
  });

  for (const p of places) {
    const hl = p.highlights && typeof p.highlights === 'object' && !Array.isArray(p.highlights)
      ? p.highlights as Record<string, unknown>
      : {};
    const hasVisitorInfo = hl.visitorInfo != null && typeof hl.visitorInfo === 'object';
    const hasTourismContent = hl.tourismContent != null;
    const hasTravelAccess = hl.travelAccess != null;
    const hasActivities = Array.isArray(hl.officialActivities) && hl.officialActivities.length > 0;

    let score = computeCompletenessScore({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      state: p.state,
      district: p.district,
      city: p.city,
      village: p.village,
      fullAddress: p.fullAddress,
      description: p.description,
      history: p.history,
      category: p.category,
      subcategory: p.subcategory,
      website: p.website,
      openingHours: p.openingHours,
      ticketPrice: p.ticketPrice,
      heritageStatus: p.heritageStatus,
      unescoStatus: p.unescoStatus,
      religiousType: p.religiousType,
      naturalCultural: p.naturalCultural,
      searchKeywords: p.searchKeywords,
      tags: p.tags,
      aliasCount: p._count.aliases,
      translationCount: p._count.translations,
      nearbyCount: p.relationshipsFrom.length,
      provenanceCount: p._count.fieldProvenance,
      hasVerifiedImage: p.placeImages.length > 0,
      boundaryValidated: p.boundaryValidations.length > 0,
      hasParking: p.hasParking,
      parkingDetails: p.parkingDetails,
      isAccessible: p.isAccessible,
      accessibilityDetails: p.accessibilityDetails,
      hasWashroom: p.hasWashroom,
      elevationMeters: p.elevationMeters,
      postalCode: p.postalCode,
      hasVisitorInfo,
      hasTourismContent,
      hasTravelAccess,
      hasActivities,
    });
    score = Math.min(100, score);
    await prisma.place.update({ where: { id: p.id }, data: { qualityScore: score } });
  }

  return places.length;
}
