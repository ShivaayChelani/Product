import { prisma } from '../../config/database';
import { getPublicVendorMapWhere } from '../vendors/vendor-public-visibility';
import { vendorBusinessTypeToPlaceCategory, vendorPlaceExternalId } from './vendorItineraryPlace.helpers';

export { vendorBusinessTypeToPlaceCategory, vendorPlaceExternalId };

const QUICK_ADD_PLACE_SELECT = {
  id: true,
  city: true,
  state: true,
  name: true,
  estimatedDurationMinutes: true,
  recommendedDuration: true,
  category: true,
  ticketPrice: true,
} as const;

export type QuickAddPlaceRow = {
  id: string;
  city: string;
  state: string;
  name: string;
  estimatedDurationMinutes: number | null;
  recommendedDuration: string | null;
  category: string;
  ticketPrice: unknown;
};

type VendorForPlace = {
  id: string;
  businessName: string;
  businessType: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  imageUrl: string | null;
  images: string[];
  address: string;
};

export async function ensureVendorItineraryPlace(vendor: VendorForPlace): Promise<QuickAddPlaceRow> {
  const externalId = vendorPlaceExternalId(vendor.id);
  const existing = await prisma.place.findFirst({
    where: { OR: [{ id: vendor.id }, { externalId }] },
    select: QUICK_ADD_PLACE_SELECT,
  });
  if (existing) return existing;

  const images = vendor.images?.length
    ? vendor.images
    : vendor.imageUrl
      ? [vendor.imageUrl]
      : [];
  const description = (vendor.description || vendor.address || vendor.businessName).slice(0, 4000);

  try {
    return await prisma.place.create({
      data: {
        id: vendor.id,
        name: vendor.businessName,
        slug: `vendor-${vendor.id}`,
        description,
        shortDescription: vendor.businessType || 'Local business',
        latitude: vendor.latitude,
        longitude: vendor.longitude,
        category: vendorBusinessTypeToPlaceCategory(vendor.businessType),
        city: vendor.city || '',
        state: vendor.state || '',
        images,
        thumbnail: vendor.imageUrl,
        fullAddress: vendor.address,
        status: 'APPROVED',
        source: 'VENDOR',
        externalId,
        dataQuality: 'VERIFIED',
      },
      select: QUICK_ADD_PLACE_SELECT,
    });
  } catch {
    const raced = await prisma.place.findFirst({
      where: { OR: [{ id: vendor.id }, { externalId }] },
      select: QUICK_ADD_PLACE_SELECT,
    });
    if (raced) return raced;
    throw new Error('Could not add this business to your itinerary.');
  }
}

export async function resolvePlaceForQuickAdd(placeIdOrSlug: string): Promise<QuickAddPlaceRow | null> {
  const place = await prisma.place.findFirst({
    where: { OR: [{ id: placeIdOrSlug }, { slug: placeIdOrSlug }] },
    select: QUICK_ADD_PLACE_SELECT,
  });
  if (place) return place;

  const vendor = await prisma.vendor.findFirst({
    where: { id: placeIdOrSlug, ...getPublicVendorMapWhere() },
    select: {
      id: true,
      businessName: true,
      businessType: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      description: true,
      imageUrl: true,
      images: true,
      address: true,
    },
  });
  if (!vendor) return null;
  return ensureVendorItineraryPlace(vendor);
}
