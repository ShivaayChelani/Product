import { vendorsApi } from './api/vendors';
import { rewardsApi } from './api/rewards';
import { getNearbyPlaces } from './placesService';
import { haversineDistance, isValidLatLng, parseLatLng } from './location/distance';
import {
  NEARBY_SEARCH_RADIUS_M,
  isWithinCategoryRadius,
} from './location/categoryNearbyFilter';
import { resolveCityFromGps, type ResolvedCity } from './location/reverseGeocode';
import { withRoutedDistanceFields } from './location/routedDistance';
import {
  getHomeCategoryById,
  type HomeCategoryDef,
  placeMatchesHomeCategory,
} from '../components/home/constants';

export type CityCategoryItem = {
  id: string;
  name: string;
  subtitle?: string;
  imageUri?: string | null;
  rating?: number;
  category?: string;
  latitude?: number | null;
  longitude?: number | null;
  distanceLabel?: string;
  distanceMeters?: number;
  straightLineMeters?: number;
  resultType: 'Place' | 'Vendor' | 'Offer' | 'Event';
  vendorId?: string;
  offerId?: string;
  placeId?: string;
};

export type CityCategorySearchResult = {
  category: HomeCategoryDef;
  city: ResolvedCity | null;
  items: CityCategoryItem[];
  unavailable: boolean;
  unavailableMessage?: string;
  usedCoordinates?: { lat: number; lng: number };
  radiusMeters?: number;
};

function sortByDistance<T extends { distanceMeters?: number; straightLineMeters?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (
    a.distanceMeters ?? a.straightLineMeters ?? Infinity
  ) - (
    b.distanceMeters ?? b.straightLineMeters ?? Infinity
  ));
}

export function distanceFields(
  lat: number,
  lng: number,
  itemLat?: number | null,
  itemLng?: number | null,
): { distanceLabel?: string; distanceMeters?: number; straightLineMeters?: number } {
  const pair = parseLatLng(itemLat, itemLng);
  if (!pair) return {};
  const meters = haversineDistance(lat, lng, pair.latitude, pair.longitude);
  if (!Number.isFinite(meters)) return {};
  return { straightLineMeters: meters };
}

function vendorMatchesType(
  businessType: string | undefined,
  vendorType: 'hotel' | 'restaurant',
): boolean {
  const t = String(businessType || '').toLowerCase();
  if (vendorType === 'hotel') {
    return t.includes('hotel') || t.includes('stay') || t.includes('resort') || t.includes('homestay');
  }
  return t.includes('restaurant') || t.includes('food') || t.includes('cafe') || t.includes('dhaba');
}

async function loadNearbyPlacesForCategory(
  lat: number,
  lng: number,
  category: HomeCategoryDef,
): Promise<CityCategoryItem[]> {
  const nearby = await getNearbyPlaces(lat, lng, NEARBY_SEARCH_RADIUS_M);
  const seen = new Set<string>();
  const items: CityCategoryItem[] = [];

  for (const p of nearby) {
    if (!isWithinCategoryRadius(lat, lng, p.latitude, p.longitude)) continue;
    if (!placeMatchesHomeCategory({ category: String(p.category), tags: p.tags, name: p.name }, category)) {
      continue;
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({
      id: p.id,
      name: p.name,
      subtitle: p.city ? `${p.city}${p.state ? `, ${p.state}` : ''}` : 'Near you',
      imageUri: p.imageUrl || null,
      rating: p.rating ?? undefined,
      category: String(p.category),
      latitude: p.latitude,
      longitude: p.longitude,
      resultType: category.id === 'events' ? 'Event' : 'Place',
      placeId: p.id,
      ...distanceFields(lat, lng, p.latitude, p.longitude),
    });
  }

  return sortByDistance(items);
}

async function unwrapVendorList(res: unknown): Promise<any[]> {
  if (Array.isArray(res)) return res;
  const data = (res as { data?: unknown })?.data;
  if (Array.isArray(data)) return data;
  return [];
}

async function loadNearbyVendorsForCategory(
  lat: number,
  lng: number,
  category: HomeCategoryDef,
): Promise<CityCategoryItem[]> {
  if (!category.vendorType) return [];

  const res = await vendorsApi.getNearbyVendors({
    lat,
    lng,
    radiusKm: NEARBY_SEARCH_RADIUS_M / 1000,
  });
  const vendors = await unwrapVendorList(res);
  const seen = new Set<string>();
  const items: CityCategoryItem[] = [];

  for (const v of vendors) {
    if (!vendorMatchesType(v.businessType || v.category, category.vendorType)) continue;
    if (!isWithinCategoryRadius(lat, lng, v.latitude, v.longitude)) continue;
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    items.push({
      id: v.id,
      name: v.businessName,
      subtitle: v.city ? `${v.city}${v.state ? `, ${v.state}` : ''}` : 'Near you',
      imageUri: v.imageUrl || v.images?.[0] || null,
      category: v.businessType,
      latitude: v.latitude,
      longitude: v.longitude,
      resultType: 'Vendor',
      vendorId: v.id,
      ...distanceFields(lat, lng, v.latitude, v.longitude),
    });
  }

  return sortByDistance(items);
}

async function loadNearbyOffers(
  lat: number,
  lng: number,
): Promise<CityCategoryItem[]> {
  const vendorRes = await vendorsApi.getNearbyVendors({
    lat,
    lng,
    radiusKm: NEARBY_SEARCH_RADIUS_M / 1000,
  });
  const nearbyVendors = await unwrapVendorList(vendorRes);
  const nearbyIds = new Set(
    nearbyVendors
      .filter((v: any) => isWithinCategoryRadius(lat, lng, v.latitude, v.longitude))
      .map((v: any) => v.id),
  );
  const vendorById = new Map(nearbyVendors.map((v: any) => [v.id, v]));

  const res = await rewardsApi.listOffers({ limit: 50, lat, lng });
  const offers = res.data || [];
  const seen = new Set<string>();
  const items: CityCategoryItem[] = [];

  for (const o of offers) {
    const vendor = o.vendor || vendorById.get(o.vendorId);
    const vLat = vendor?.latitude ?? o.vendor?.latitude;
    const vLng = vendor?.longitude ?? o.vendor?.longitude;
    const inRadius =
      (o.vendorId && nearbyIds.has(o.vendorId)) ||
      isWithinCategoryRadius(lat, lng, vLat, vLng);
    if (!inRadius) continue;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    items.push({
      id: o.id,
      name: o.title,
      subtitle: vendor?.businessName || o.vendor?.businessName || 'Near you',
      imageUri: o.imageUrl || vendor?.imageUrl || o.vendor?.imageUrl || null,
      category: o.category || 'Offer',
      latitude: vLat,
      longitude: vLng,
      resultType: 'Offer',
      offerId: o.id,
      vendorId: o.vendorId,
      ...distanceFields(lat, lng, vLat, vLng),
    });
  }

  return sortByDistance(items);
}

export async function searchHomeCategory(
  categoryId: string,
  lat: number,
  lng: number,
): Promise<CityCategorySearchResult> {
  const category = getHomeCategoryById(categoryId);
  if (!category || category.mode === 'universal') {
    return {
      category: category || { id: 'unknown', name: 'Search', query: '', icon: 'navigate-outline', mode: 'universal' },
      city: null,
      items: [],
      unavailable: true,
      unavailableMessage: 'Category not supported.',
    };
  }

  if (!isValidLatLng(lat, lng)) {
    return {
      category,
      city: null,
      items: [],
      unavailable: true,
      unavailableMessage: 'Location is required to show nearby places. Enable location and try again.',
    };
  }

  if (category.mode === 'gps_nearby') {
    return {
      category,
      city: null,
      items: [],
      unavailable: true,
      unavailableMessage: 'Category not supported.',
    };
  }

  const city = await resolveCityFromGps(lat, lng);

  let items: CityCategoryItem[] = [];
  if (category.mode === 'city_vendors') {
    items = await loadNearbyVendorsForCategory(lat, lng, category);
  } else if (category.mode === 'city_places') {
    items = await loadNearbyPlacesForCategory(lat, lng, category);
  } else if (category.mode === 'city_offers') {
    items = await loadNearbyOffers(lat, lng);
  }

  const unavailable = items.length === 0;
  let unavailableMessage: string | undefined;
  if (unavailable) {
    const where = city?.city ? ` near ${city.city}` : ' near you';
    if (category.id === 'food' || category.id === 'stay') {
      unavailableMessage = `${category.name} partners are not available${where} yet.`;
    } else {
      unavailableMessage = `No ${category.name.toLowerCase()} listings${where} within 30 km.`;
    }
  }

  const candidates = sortByDistance(items).slice(0, 20);
  const routedItems = await withRoutedDistanceFields(
    { latitude: lat, longitude: lng },
    candidates,
    item => ({ latitude: item.latitude, longitude: item.longitude }),
  );

  return {
    category,
    city,
    items: sortByDistance(routedItems),
    unavailable,
    unavailableMessage,
    usedCoordinates: { lat, lng },
    radiusMeters: NEARBY_SEARCH_RADIUS_M,
  };
}
