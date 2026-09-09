import { env } from '../../config/env';
import { KNOWN_LOCATIONS } from './geocode';
import { haversineDistance } from './geo';
import axios from 'axios';
import { logger } from '../../config/logger';

interface GoogleGeocodeResult {
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

/**
 * Normalizes a city name for robust comparison.
 */
export function normalizeCityName(city: string): string {
  if (!city) return '';
  const trimmed = city.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolves GPS coordinates to a canonical city name.
 * Uses Google Maps Geocoding API if available, falling back to OSM Nominatim.
 */
export async function reverseGeocodeToCity(lat: number, lng: number): Promise<string | null> {
  logger.info({ lat, lng }, '[TH-LOCATION] reverseGeocodeToCity started');
  
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    logger.warn('[TH-LOCATION] Invalid coordinates provided');
    return null;
  }

  // 1. Try Google Maps API if configured
  if (env.googleMapsApiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${env.googleMapsApiKey}`;
      const res = await axios.get(url, { timeout: 3000 });
      
      logger.info({ 
        provider: 'Google Maps',
        httpStatus: res.status,
        apiStatus: res.data?.status
      }, '[TH-REVERSE-GEOCODE] API Response received');

      if (res.data?.status === 'OK' && res.data.results?.length > 0) {
        let resolvedCity = null;

        for (const result of res.data.results as GoogleGeocodeResult[]) {
          const locality = result.address_components.find((c) => c.types.includes('locality'));
          if (locality) {
            resolvedCity = locality.long_name;
            break;
          }
          const subAdmin = result.address_components.find((c) => c.types.includes('administrative_area_level_3') || c.types.includes('administrative_area_level_2'));
          if (subAdmin) {
            resolvedCity = subAdmin.long_name;
            break;
          }
        }
        
        logger.info({ resolvedCity }, '[TH-REVERSE-GEOCODE] Component extraction (Google)');
        
        if (resolvedCity) {
          const canonical = normalizeCityName(resolvedCity);
          logger.info({ canonical, source: 'google' }, '[TH-CITY-RESOLUTION] Final city resolved');
          return canonical;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message, lat, lng }, '[TH-REVERSE-GEOCODE] Google Maps reverse geocoding failed, falling back to OSM');
    }
  }

  // 2. Fallback to OpenStreetMap (Nominatim)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await axios.get(url, { 
      timeout: 3000,
      headers: { 'User-Agent': 'PalSafarApp/1.0 (info@palsafar.com)' }
    });
    
    logger.info({ provider: 'OSM/Nominatim', httpStatus: res.status }, '[TH-REVERSE-GEOCODE] API Response received');

    const address = res.data?.address;
    if (address) {
      const resolvedCity = address.city || address.town || address.county || address.state_district;
      logger.info({ resolvedCity }, '[TH-REVERSE-GEOCODE] Component extraction (OSM)');
      
      if (resolvedCity) {
        // Drop terms like "District" or "Municipal Corporation" before normalizing
        const cleaned = resolvedCity.replace(/District|Municipal Corporation|City/gi, '').trim();
        const canonical = normalizeCityName(cleaned);
        logger.info({ canonical, source: 'osm' }, '[TH-CITY-RESOLUTION] Final city resolved');
        return canonical;
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message, lat, lng }, '[TH-REVERSE-GEOCODE] OSM reverse geocoding failed');
  }

  // 3. Optional emergency fallback to local known locations (if all network APIs fail)
  let nearestCity: string | null = null;
  let minDistance = 15 * 1000;

  for (const [cityName, coords] of Object.entries(KNOWN_LOCATIONS)) {
    const d = haversineDistance(lat, lng, coords.lat, coords.lng);
    if (d < minDistance) {
      minDistance = d;
      nearestCity = cityName;
    }
  }

  if (nearestCity) {
    const canonical = normalizeCityName(nearestCity);
    logger.info({ fallbackUsed: true, canonical, distance: minDistance }, '[TH-CITY-RESOLUTION] Emergency fallback successful');
    return canonical;
  }

  logger.warn('[TH-CITY-RESOLUTION] Exhausted all resolution methods, no city found');
  return null;
}
