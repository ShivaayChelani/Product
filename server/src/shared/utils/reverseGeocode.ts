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

/**
 * Canonical city candidates resolved from GPS coordinates.
 *
 * For Indian addresses the district (`district`) is the right grain for a
 * treasure hunt: users physically in a district town (e.g. Panagar) should
 * reach the district hunt (e.g. Jabalpur). The settlement (`settlement`) is
 * the precise locality and MUST win whenever it has its own hunt.
 *
 * Candidates are canonical display names (suffixes stripped, aliases applied)
 * — they are only ever matched against the authoritative ACTIVE TreasureHunt
 * table using `canonicalCityKey`. This does NOT weaken the location gate:
 * the gate still requires an exact canonical key match to one of these two
 * server-derived candidates. The client only ever supplies GPS coordinates.
 */
export interface CityCandidates {
  /** Settlement / locality / town / village (canonical display form). */
  settlement: string | null;
  /** District / state_district (canonical display form). */
  district: string | null;
  /** Provider state / admin_area_level_1. Never used as district. */
  state: string | null;
}

function normalizeAndDisplay(raw: string): string {
  const cleaned = raw.replace(/District|Municipal Corporation|City/gi, '').trim();
  return cityDisplayName(cleaned);
}

/** User-facing display city from candidates (settlement preferred). */
export function primaryCandidateCity(candidates: CityCandidates): string | null {
  return candidates.settlement || candidates.district;
}

/**
 * Resolves GPS coordinates to settlement + district candidates.
 *
 * Provider chain (identical ordering to reverseGeocodeToCity):
 *   1. Google Maps when configured — locality → settlement,
 *      administrative_area_level_2 (then _3) → district; state (level_1) is
 *      NEVER treated as the district.
 *   2. OSM Nominatim (bounded retries) — city/town/village → settlement,
 *      state_district → district; `county` is the finer tehsil and must NOT
 *      become a district candidate (it can never match a stored hunt).
 *   3. BigDataCloud keyless fallback — city/locality → settlement; its
 *      principalSubdivision is the state, so no district is guessed.
 *
 * Returns null only when every provider is exhausted. Fails closed.
 */
export async function reverseGeocodeCandidates(lat: number, lng: number): Promise<CityCandidates | null> {
  logger.info({ lat, lng }, '[TH-LOCATION] reverseGeocodeCandidates started');

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
      }, '[TH-REVERSE-GEOCODE] API Response received (candidates)');

      if (res.data?.status === 'OK' && res.data.results?.length > 0) {
        let settlement: string | null = null;
        let district: string | null = null;
        let state: string | null = null;

        for (const result of res.data.results as GoogleGeocodeResult[]) {
          // Settlement: locality preferred, then admin level 3/2 as fallback.
          if (!settlement) {
            const locality = result.address_components.find((c) => c.types.includes('locality'));
            if (locality) {
              settlement = normalizeAndDisplay(locality.long_name);
            } else {
              const subAdmin = result.address_components.find(
                (c) => c.types.includes('administrative_area_level_3') || c.types.includes('administrative_area_level_2'),
              );
              if (subAdmin) settlement = normalizeAndDisplay(subAdmin.long_name);
            }
          }

          // District: admin_area_level_2 (district in India), then level_3 as
          // fallback. Level_1 is the state — never the district.
          if (!district) {
            const districtComp = result.address_components.find((c) => c.types.includes('administrative_area_level_2'));
            if (districtComp) {
              district = normalizeAndDisplay(districtComp.long_name);
            } else {
              const l3 = result.address_components.find((c) => c.types.includes('administrative_area_level_3'));
              if (l3) district = normalizeAndDisplay(l3.long_name);
            }
          }

          if (!state) {
            const stateComp = result.address_components.find((c) => c.types.includes('administrative_area_level_1'));
            const longName = stateComp?.long_name?.trim();
            const shortName = stateComp?.short_name?.trim();
            if (longName) state = longName;
            else if (shortName) state = shortName;
          }

          if (settlement && district && state) break;
        }

        logger.info({ settlement, district, state }, '[TH-REVERSE-GEOCODE] Candidate extraction (Google)');
        if (settlement || district) return { settlement, district, state };
      }
    } catch (err: any) {
      logger.warn({ err: err.message, lat, lng }, '[TH-REVERSE-GEOCODE] Google Maps failed (candidates), falling back to OSM');
    }
  }

  // 2. Fallback to OpenStreetMap (Nominatim) with bounded retries.
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

      logger.info({ provider: 'OSM/Nominatim', httpStatus: res.status, attempt: attempt + 1 }, '[TH-REVERSE-GEOCODE] API Response received (candidates)');

      const address = res.data?.address;
      if (!address || typeof address !== 'object') {
        logger.warn(
          { attempt: attempt + 1, httpStatus: res.status },
          '[TH-REVERSE-GEOCODE] OSM response had no usable address (candidates), retrying',
        );
        continue;
      }

      // Settlement: city/town/village. District: state_district (the admin
      // district). `county` is the tehsil/sub-district — NOT a district.
      const settlement = address.city || address.town || address.village || null;
      const district = address.state_district || null;
      const stateRaw = typeof address.state === 'string' ? address.state.trim() : '';

      if (settlement || district) {
        const displaySettlement = settlement ? normalizeAndDisplay(settlement) : null;
        const displayDistrict = district ? normalizeAndDisplay(district) : null;
        const state = stateRaw || null;
        logger.info(
          { settlement: displaySettlement, district: displayDistrict, state, source: 'osm' },
          '[TH-CITY-RESOLUTION] Candidates resolved',
        );
        return { settlement: displaySettlement, district: displayDistrict, state };
      }

      logger.warn(
        { attempt: attempt + 1, httpStatus: res.status },
        '[TH-REVERSE-GEOCODE] OSM had no settlement or district candidate, retrying',
      );
    } catch (err: any) {
      const last = attempt === osmAttempts - 1;
      logger.warn({ err: err.message, lat, lng, attempt: attempt + 1 }, last
        ? '[TH-REVERSE-GEOCODE] OSM candidate resolution exhausted retries'
        : '[TH-REVERSE-GEOCODE] OSM candidate resolution failed, retrying');
      if (last) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  // 3. Keyless last-resort provider (BigDataCloud). Settlement = city/locality.
  //    principalSubdivision is the STATE (e.g. "Madhya Pradesh") — not a
  //    district, so it is never used as a district candidate here.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res = await axios.get(url, {
        timeout: 5000,
        headers: { 'User-Agent': 'PalSafarApp/1.0 (info@palsafar.com)', Accept: 'application/json' },
      });

      const body = res.data;
      if (body && typeof body === 'object') {
        const settlementRaw = body.city || body.locality;
        if (settlementRaw && typeof settlementRaw === 'string' && settlementRaw.trim()) {
          const displaySettlement = normalizeAndDisplay(settlementRaw);
          const stateRaw = typeof body.principalSubdivision === 'string' ? body.principalSubdivision.trim() : '';
          logger.info(
            { settlement: displaySettlement, state: stateRaw || null, source: 'bigdatacloud' },
            '[TH-CITY-RESOLUTION] Candidates resolved',
          );
          return { settlement: displaySettlement, district: null, state: stateRaw || null };
        }
      }
      logger.warn(
        { attempt: attempt + 1, httpStatus: res.status },
        '[TH-REVERSE-GEOCODE] BigDataCloud had no usable city (candidates)',
      );
    } catch (err: any) {
      logger.warn(
        { err: err.message, lat, lng, attempt: attempt + 1 },
        '[TH-REVERSE-GEOCODE] BigDataCloud candidate resolution failed',
      );
    }
  }

  logger.warn('[TH-CITY-RESOLUTION] Exhausted all providers, no candidates found');
  return null;
}