import { env } from '../../config/env';
import { cityDisplayName } from './cityIdentity';
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
          const canonical = cityDisplayName(resolvedCity);
          logger.info({ canonical, source: 'google' }, '[TH-CITY-RESOLUTION] Final city resolved');
          return canonical;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message, lat, lng }, '[TH-REVERSE-GEOCODE] Google Maps reverse geocoding failed, falling back to OSM');
    }
  }

  // 2. Fallback to OpenStreetMap (Nominatim) — with retry/backoff, since it is
  //    the only resolution provider in environments without a Google Maps key.
  const osmAttempts = 3;
  for (let attempt = 0; attempt < osmAttempts; attempt++) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const res = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'PalSafarApp/1.0 (info@palsafar.com)' },
      });

      logger.info({ provider: 'OSM/Nominatim', httpStatus: res.status, attempt: attempt + 1 }, '[TH-REVERSE-GEOCODE] API Response received');

      const address = res.data?.address;
      if (address) {
        const resolvedCity = address.city || address.town || address.county || address.state_district;
        logger.info({ resolvedCity }, '[TH-REVERSE-GEOCODE] Component extraction (OSM)');

        if (resolvedCity) {
          // Drop terms like "District" or "Municipal Corporation" before normalizing
          const cleaned = resolvedCity.replace(/District|Municipal Corporation|City/gi, '').trim();
          const canonical = cityDisplayName(cleaned);
          logger.info({ canonical, source: 'osm' }, '[TH-CITY-RESOLUTION] Final city resolved');
          return canonical;
        }
      }
      return null; // API responded but no usable city component
    } catch (err: any) {
      const last = attempt === osmAttempts - 1;
      logger.warn({ err: err.message, lat, lng, attempt: attempt + 1 }, last
        ? '[TH-REVERSE-GEOCODE] OSM reverse geocoding exhausted retries'
        : '[TH-REVERSE-GEOCODE] OSM reverse geocoding failed, retrying');
      if (last) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }

  // Deliberately NO radius-based "known city" fallback: guessing a city from
  // a nearby location table can tag the wrong city (e.g. a suburb of Gurugram
  // as "Delhi"). Fail closed → callers surface CITY_RESOLUTION_FAILED.
  logger.warn('[TH-CITY-RESOLUTION] Exhausted all resolution methods, no city found');
  return null;
}
