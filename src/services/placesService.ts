import { DEV_FLAGS } from '../config/devFlags';
import { TouristSpot } from '../types';
import { placesApi, searchApi, PlaceResponse, MapPlacePin } from './api';
import { syncService } from './syncService';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { isCommercialPlaceCategory } from '../utils/mapMarkerUtils';
import { haversineDistance } from './location/distance';

function boundsAround(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  };
}

function mapPlaceToSpot(p: PlaceResponse, isHiddenGemFlag?: boolean | number): TouristSpot {
  const category = mapCategory(p.category);
  const isHiddenGem = isHiddenGemFlag === true;
  return {
    id: p.id || p.slug,
    name: p.name,
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    latitude: p.latitude,
    longitude: p.longitude,
    category,
    difficulty: 'medium',
    imageUrl: p.thumbnail || p.images?.[0],
    description: p.description,
    tags: p.tags || [],
    mustVisit: false,
    isHiddenGem,
    isLocalFavorite: false,
    verificationStatus: p.status === 'APPROVED' ? 'verified' : 'pending',
    source: 'curated',
    badgeIcon: categoryEmoji(category),
    rating: p.rating || 0,
    reviewCount: p.reviewCount || 0,
    estimatedDuration: 60,
    bestTimeToVisit: (p.bestTimeToVisit?.label?.toLowerCase() as any) || 'any',
    bestTimeVisit: p.bestTimeToVisit ?? undefined,
    bestTimeReason: p.bestTimeReason ?? undefined,
    points: 10,
  };
}

function mapMapPinToSpot(p: MapPlacePin): TouristSpot {
  const category = mapCategory(p.category);
  return {
    id: p.id,
    name: p.name,
    city: p.city || '',
    state: p.state || '',
    country: 'India',
    latitude: p.latitude,
    longitude: p.longitude,
    category,
    difficulty: 'medium',
    imageUrl: p.thumbnail || p.images?.[0],
    tags: p.tags || [],
    mustVisit: false,
    isHiddenGem: false,
    isLocalFavorite: false,
    verificationStatus: p.verified ? 'verified' : 'pending',
    source: 'curated',
    badgeIcon: categoryEmoji(category),
    rating: p.rating || 0,
    reviewCount: p.reviewCount || 0,
    estimatedDuration: 60,
    bestTimeToVisit: 'any',
    points: 10,
  };
}

function dedupeSpotsById(spots: TouristSpot[]): TouristSpot[] {
  const seen = new Set<string>();
  return spots.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function sortByDistanceFrom(spots: TouristSpot[], lat: number, lng: number): TouristSpot[] {
  return [...spots].sort((a, b) => {
    const da = haversineDistance(lat, lng, a.latitude, a.longitude);
    const db = haversineDistance(lat, lng, b.latitude, b.longitude);
    return da - db;
  });
}

function filterTouristPlaces(spots: TouristSpot[]): TouristSpot[] {
  return spots.filter(s => !isCommercialPlaceCategory(s.category));
}

function mapCategory(cat: string): TouristSpot['category'] {
  const key = (cat || '').toLowerCase().trim();
  const map: Record<string, TouristSpot['category']> = {
    temple: 'temple',
    fort: 'fort',
    palace: 'palace',
    monument: 'monument',
    heritage: 'monument',
    history: 'monument',
    lake: 'lake',
    waterfall: 'waterfall',
    park: 'park',
    wildlife: 'park',
    nature: 'park',
    garden: 'park',
    museum: 'museum',
    church: 'church',
    mosque: 'mosque',
    gurudwara: 'gurudwara',
    gurdwara: 'gurudwara',
    adventure: 'adventure',
    cultural: 'cultural',
    spiritual: 'temple',
    religious: 'temple',
    river: 'ghat',
    viewpoint: 'adventure',
    ghat: 'ghat',
    beach: 'beach',
    market: 'market',
    shopping: 'market',
    trek: 'trek',
    trekking: 'trek',
  };
  return map[key] || key;
}

function categoryEmoji(cat: string): string {
  const emojis: Record<string, string> = {
    temple: '\uD83D\uDD5B', fort: '\uD83C\uDFF0', palace: '\uD83D\uDC51',
    monument: '\uD83C\uDFDB', heritage: '\uD83C\uDFDB', lake: '\uD83C\uDF0A',
    waterfall: '\uD83D\uDCA7', park: '\uD83C\uDF33', wildlife: '\uD83D\uDC05',
    nature: '\uD83C\uDF3F', garden: '\uD83C\uDF3A', museum: '\uD83C\uDFDB',
    church: '\u26EA', mosque: '\uD83D\uDD4C', gurudwara: '\uD83D\uDD4C',
    adventure: '\uD83C\uDFAF', cultural: '\uD83C\uDFAD', spiritual: '\uD83D\uDD49',
    river: '\uD83C\uDF0A', viewpoint: '\uD83C\uDF04', ghat: '\uD83D\uDD4C',
    beach: '\uD83C\uDFD6', market: '\uD83D\uDED2', trek: '\uD83E\uDD7E',
  };
  return emojis[cat] || '\uD83D\uDCCD';
}

export async function getPlaces(fetchAll = false): Promise<TouristSpot[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];

  const all: TouristSpot[] = [];
  let page = 1;
  const pageSize = 100;
  let continueFetching = true;

  while (continueFetching) {
    try {
      const res = await retryWithBackoff(
        () => placesApi.list({ status: 'APPROVED', limit: pageSize, page }),
        {
          maxRetries: 3,
          baseDelay: 1500,
        },
      );

      if (res.data) {
        all.push(...res.data.map(mapPlaceToSpot));
      }

      const totalPages = res.pagination?.totalPages ?? 1;
      page += 1;
      continueFetching = Boolean(fetchAll && page <= totalPages && page <= 3);
    } catch (err: any) {
      if (err?.status === 429) {
        break;
      }
      throw err;
    }
  }

  return filterTouristPlaces(all);
}

export async function getNearbyPlaces(lat: number, lng: number, radius = 100000): Promise<TouristSpot[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];

  const radiusKm = Math.min(radius / 1000, 100);

  try {
    const res = await placesApi.nearby({ lat, lng, radius, limit: 50 });
    const fromNearby = dedupeSpotsById(filterTouristPlaces((res.data || []).map(mapPlaceToSpot)));
    if (fromNearby.length > 0) return sortByDistanceFrom(fromNearby, lat, lng);
  } catch (err) {
  }

  try {
    const bounds = boundsAround(lat, lng, radiusKm);
    const feed = await placesApi.map({ ...bounds, zoom: 13, limit: 50 });
    if (feed.places?.length) {
      const fromMap = filterTouristPlaces(feed.places.map(mapMapPinToSpot));
      const withinRadius = fromMap.filter(
        p => haversineDistance(lat, lng, p.latitude, p.longitude) <= radius,
      );
      if (withinRadius.length > 0) return sortByDistanceFrom(dedupeSpotsById(withinRadius), lat, lng);
    }
  } catch (err) {
  }

  try {
    const bounds = boundsAround(lat, lng, radiusKm);
    const viewportPlaces = await placesApi.viewport({ ...bounds, limit: 50 });
    const fromViewport = filterTouristPlaces((viewportPlaces || []).map(mapPlaceToSpot));
    const withinRadius = fromViewport.filter(
      p => haversineDistance(lat, lng, p.latitude, p.longitude) <= radius,
    );
    if (withinRadius.length > 0) return sortByDistanceFrom(dedupeSpotsById(withinRadius), lat, lng);
  } catch (err) {
  }

  return [];
}


export async function getTrendingPlaces(): Promise<TouristSpot[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];

  try {
    const data = await searchApi.getTrending();
    return filterTouristPlaces((data || []).map(mapPlaceToSpot));
  } catch (err) {
    return [];
  }
}

export async function getHiddenGems(): Promise<TouristSpot[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];

  try {
    const data = await searchApi.getHiddenGems();
    return filterTouristPlaces((data || []).map(p => mapPlaceToSpot(p, true)));
  } catch (err) {
    return [];
  }
}

export async function searchPlaces(query: string): Promise<TouristSpot[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];

  try {
    const res = await searchApi.search({ q: query, limit: 50 });
    return filterTouristPlaces((res.data || []).map(mapPlaceToSpot));
  } catch {
    return [];
  }
}

export async function checkInPlace(id: string): Promise<any> {
  if (!DEV_FLAGS.USE_SERVER_API) return null;
  try {
    return await placesApi.checkIn(id);
  } catch (err: any) {
    if (err.message && err.message.includes('Network request failed')) {
      await syncService.queueAction('CHECK_IN', { placeId: id });
      return { success: true, queued: true };
    }
    throw err;
  }
}

export async function savePlace(id: string): Promise<any> {
  if (!DEV_FLAGS.USE_SERVER_API) return null;
  try {
    return await placesApi.save(id);
  } catch (err: any) {
    if (err.message && err.message.includes('Network request failed')) {
      await syncService.queueAction('SAVE_PLACE', { placeId: id });
      return { success: true, queued: true };
    }
    throw err;
  }
}

export async function unsavePlace(id: string): Promise<any> {
  if (!DEV_FLAGS.USE_SERVER_API) return null;
  try {
    return await placesApi.unsave(id);
  } catch (err: any) {
    if (err.message && err.message.includes('Network request failed')) {
      await syncService.queueAction('UNSAVE_PLACE', { placeId: id });
      return { success: true, queued: true };
    }
    throw err;
  }
}

export async function getPlaceById(id: string): Promise<TouristSpot | null> {
  if (!DEV_FLAGS.USE_SERVER_API) return null;

  try {
    const res = await placesApi.getById(id);
    return mapPlaceToSpot(res);
  } catch (err) {
    return null;
  }
}
