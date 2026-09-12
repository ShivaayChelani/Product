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
 * Extracts a usable city from an OSM Nominatim `address` object.
 *
 * For Indian addresses the district name is the right grain for a city hunt:
 * - `city`/`town`/`village` are the settlement asked for,
 * - `state_district` is the district ("Jabalpur"),
 * - `county` is often the finer tehsil/sub-district ("Ranjhi Tahsil") that
 *   would never match a stored hunt and must NOT shadow the district.
 * So `state_district` is preferred over `county`.
 */
function cityFromOsmAddress(address: any): string | null {
  if (!address || typeof address !== 'object') return null;
  const resolved =
    address.city || address.town || address.village || address.state_district || address.county;
  if (!resolved || typeof resolved !== 'string' || !resolved.trim()) return null;
  return resolved;
}

/**
 * Keyless last-resort reverse geocoder (BigDataCloud reverse-geocode-client).
 * Used ONLY when Google and every OSM attempt failed. Fails closed: any
 * uncertain/unusable result returns null, never a guessed city.
 */
async function reverseGeocodeWithFallback(lat: number, lng: number): Promise<string | null> {
  const attempts = 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res = await axios.get(url, {
        timeout: 5000,
        headers: { 'User-Agent': 'PalSafarApp/1.0 (info@palsafar.com)', Accept: 'application/json' },
      });

      const body = res.data;
      if (body && typeof body === 'object') {
        const resolved = body.city || body.locality || body.principalSubdivision;
        if (resolved && typeof resolved === 'string' && resolved.trim()) {
          const canonical = cityDisplayName(resolved.trim());
          logger.info({ canonical, source: 'bigdatacloud' }, '[TH-CITY-RESOLUTION] Final city resolved');
          return canonical;
        }
      }
      logger.warn(
        { attempt: attempt + 1, httpStatus: res.status },
        '[TH-REVERSE-GEOCODE] Fallback geocoder response had no usable city',
      );
    } catch (err: any) {
      logger.warn(
        { err: err.message, lat, lng, attempt: attempt + 1 },
        '[TH-REVERSE-GEOCODE] Fallback geocoder failed',
      );
    }
  }
  return null;
}

/**
 * Resolves GPS coordinates to a canonical city name.
 * Tries Google Maps Geocoding API when configured, then OSM Nominatim
 * (with bounded retries), then a keyless fallback. Returns null only when
 * every provider is exhausted — callers never receive a guessed city.
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
        apiStatus: res.data?.status,
      }, '[TH-REVERSE-GEOCODE] API Response received');

      if (res.data?.status === 'OK' && res.data.results?.length > 0) {
        let resolvedCity = null;

        for (const result of res.data.results as GoogleGeocodeResult[]) {
          const locality = result.address_components.find((c) => c.types.includes('locality'));
          if (locality) {
            resolvedCity = locality.long_name;
            break;
          }
          const subAdmin = result.address_components.find(
            (c) => c.types.includes('administrative_area_level_3') || c.types.includes('administrative_area_level_2'),
          );
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

  // 2. Fallback to OpenStreetMap (Nominatim). Bounded retries with >=1s backoff
  //    (complies with Nominatim's ~1 request/s usage policy). A 2xx response that
  //    carries no usable `address` object (e.g. an HTTP-200 challenge page) counts
  //    as a failed attempt so the retry loop is actually exercised.
  const osmAttempts = 3;
  for (let attempt = 0; attempt < osmAttempts; attempt++) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
      const res = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'PalSafarApp/1.0 (info@palsafar.com)',
          'Accept-Language': 'en',
          Accept: 'application/json',
        },
      });

      logger.info({ provider: 'OSM/Nominatim', httpStatus: res.status, attempt: attempt + 1 }, '[TH-REVERSE-GEOCODE] API Response received');

      const address = res.data?.address;
      const resolvedCity = cityFromOsmAddress(address);

      if (resolvedCity) {
        // Drop terms like "District" or "Municipal Corporation" before normalizing
        const cleaned = resolvedCity.replace(/District|Municipal Corporation|City/gi, '').trim();
        const canonical = cityDisplayName(cleaned);
        logger.info({ canonical, source: 'osm' }, '[TH-CITY-RESOLUTION] Final city resolved');
        return canonical;
      }

      // 2xx but unparseable (challenge page, empty address). Not a success.
      logger.warn(
        { attempt: attempt + 1, httpStatus: res.status },
        '[TH-REVERSE-GEOCODE] OSM response had no usable address, retrying',
      );
    } catch (err: any) {
      const last = attempt === osmAttempts - 1;
      logger.warn({ err: err.message, lat, lng, attempt: attempt + 1 }, last
        ? '[TH-REVERSE-GEOCODE] OSM reverse geocoding exhausted retries'
        : '[TH-REVERSE-GEOCODE] OSM reverse geocoding failed, retrying');
      if (last) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  // 3. Keyless last-resort provider (only reached after Google + OSM exhausted).
  const fallback = await reverseGeocodeWithFallback(lat, lng);
  if (fallback) return fallback;

  // Deliberately NO radius-based "known city" fallback: guessing a city from
  // a nearby location table can tag the wrong city (e.g. a suburb of Gurugram
  // as "Delhi"). Fail closed → callers surface CITY_RESOLUTION_FAILED.
  logger.warn('[TH-CITY-RESOLUTION] Exhausted all resolution methods, no city found');
  return null;
}