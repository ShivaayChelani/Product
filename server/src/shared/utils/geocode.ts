import { prisma } from '../../config/database';
import { canonicalizeDestination, normalizeDestinationKey, destinationMatchesInText } from './destination';

/**
 * Destination resolution for itinerary generation.
 *
 * Resolution order:
 *   1. Offline table of major Indian destinations (fast, no DB hit).
 *   2. Database-driven: median coordinates of APPROVED places whose city
 *      matches the destination — works for ANY city we have data for.
 *   3. Unresolved: callers receive `resolved: false` and must NOT fall back
 *      to a default city's places (that produced wrong-city itineraries).
 */
const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  // Madhya Pradesh
  bhopal: { lat: 23.2599, lng: 77.4126 },
  indore: { lat: 22.7196, lng: 75.8577 },
  ujjain: { lat: 23.1793, lng: 75.7849 },
  gwalior: { lat: 26.2183, lng: 78.1828 },
  jabalpur: { lat: 23.1815, lng: 79.9864 },
  khajuraho: { lat: 24.8318, lng: 79.9199 },
  orchha: { lat: 25.3507, lng: 78.6422 },
  sanchi: { lat: 23.4795, lng: 77.7398 },
  mandu: { lat: 22.3365, lng: 75.3963 },
  pachmarhi: { lat: 22.4679, lng: 78.4328 },
  kanha: { lat: 22.3342, lng: 80.6116 },
  bandhavgarh: { lat: 23.7005, lng: 81.0320 },
  pench: { lat: 21.6667, lng: 79.3000 },
  amarkantak: { lat: 22.6748, lng: 81.7538 },
  burhanpur: { lat: 21.3105, lng: 76.2289 },
  maheshwar: { lat: 22.1794, lng: 75.5850 },
  chitrakoot: { lat: 25.2001, lng: 80.8400 },
  datia: { lat: 25.6691, lng: 78.4589 },
  shivpuri: { lat: 25.4257, lng: 77.6470 },
  // Metros
  delhi: { lat: 28.7041, lng: 77.1025 },
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  hyderabad: { lat: 17.3850, lng: 78.4867 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  // Uttarakhand
  nainital: { lat: 29.3919, lng: 79.4542 },
  mussoorie: { lat: 30.4598, lng: 78.0644 },
  dehradun: { lat: 30.3165, lng: 78.0322 },
  haridwar: { lat: 29.9457, lng: 78.1642 },
  rishikesh: { lat: 30.0869, lng: 78.2676 },
  auli: { lat: 30.5286, lng: 79.5652 },
  'jim corbett': { lat: 29.5300, lng: 78.7747 },
  kedarnath: { lat: 30.7346, lng: 79.0669 },
  badrinath: { lat: 30.7433, lng: 79.4938 },
  // Himachal / J&K / Ladakh
  shimla: { lat: 31.1048, lng: 77.1734 },
  manali: { lat: 32.2432, lng: 77.1892 },
  dharamshala: { lat: 32.2190, lng: 76.3234 },
  mcleodganj: { lat: 32.2427, lng: 76.3234 },
  dalhousie: { lat: 32.5387, lng: 75.9701 },
  kasauli: { lat: 30.8988, lng: 76.9650 },
  kasol: { lat: 32.0100, lng: 77.3152 },
  spiti: { lat: 32.2464, lng: 78.0349 },
  leh: { lat: 34.1526, lng: 77.5771 },
  ladakh: { lat: 34.1526, lng: 77.5771 },
  srinagar: { lat: 34.0837, lng: 74.7973 },
  gulmarg: { lat: 34.0484, lng: 74.3805 },
  // Rajasthan
  jaipur: { lat: 26.9124, lng: 75.7873 },
  udaipur: { lat: 24.5854, lng: 73.7125 },
  jodhpur: { lat: 26.2389, lng: 73.0243 },
  jaisalmer: { lat: 26.9157, lng: 70.9083 },
  pushkar: { lat: 26.4897, lng: 74.5511 },
  'mount abu': { lat: 24.5926, lng: 72.7156 },
  bikaner: { lat: 28.0229, lng: 73.3119 },
  ranthambore: { lat: 26.0173, lng: 76.5026 },
  // UP / Bihar
  agra: { lat: 27.1767, lng: 78.0081 },
  varanasi: { lat: 25.3176, lng: 82.9739 },
  kashi: { lat: 25.3176, lng: 82.9739 },
  banaras: { lat: 25.3176, lng: 82.9739 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  mathura: { lat: 27.4924, lng: 77.6737 },
  vrindavan: { lat: 27.5820, lng: 77.7006 },
  ayodhya: { lat: 26.7922, lng: 82.1998 },
  prayagraj: { lat: 25.4358, lng: 81.8463 },
  allahabad: { lat: 25.4358, lng: 81.8463 },
  'bodh gaya': { lat: 24.6951, lng: 84.9916 },
  sarnath: { lat: 25.3763, lng: 83.0229 },
  // West / South
  goa: { lat: 15.4909, lng: 73.8278 },
  mahabaleshwar: { lat: 17.9307, lng: 73.6477 },
  lonavala: { lat: 18.7546, lng: 73.4062 },
  matheran: { lat: 18.9866, lng: 73.2707 },
  aurangabad: { lat: 19.8762, lng: 75.3433 },
  ajanta: { lat: 20.5519, lng: 75.7033 },
  ellora: { lat: 20.0268, lng: 75.1779 },
  mysore: { lat: 12.2958, lng: 76.6394 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  hampi: { lat: 15.3350, lng: 76.4600 },
  coorg: { lat: 12.3375, lng: 75.8069 },
  chikmagalur: { lat: 13.3161, lng: 75.7720 },
  gokarna: { lat: 14.5479, lng: 74.3188 },
  badami: { lat: 15.9149, lng: 75.6768 },
  ooty: { lat: 11.4102, lng: 76.6950 },
  kodaikanal: { lat: 10.2381, lng: 77.4892 },
  madurai: { lat: 9.9252, lng: 78.1198 },
  rameswaram: { lat: 9.2876, lng: 79.3129 },
  kanyakumari: { lat: 8.0883, lng: 77.5385 },
  pondicherry: { lat: 11.9416, lng: 79.8083 },
  puducherry: { lat: 11.9416, lng: 79.8083 },
  mahabalipuram: { lat: 12.6269, lng: 80.1928 },
  tirupati: { lat: 13.6288, lng: 79.4192 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  munnar: { lat: 10.0889, lng: 77.0595 },
  alleppey: { lat: 9.4981, lng: 76.3388 },
  alappuzha: { lat: 9.4981, lng: 76.3388 },
  wayanad: { lat: 11.6854, lng: 76.1320 },
  thekkady: { lat: 9.6034, lng: 77.1567 },
  varkala: { lat: 8.7379, lng: 76.7163 },
  kovalam: { lat: 8.4004, lng: 76.9787 },
  // East / North-East
  darjeeling: { lat: 27.0360, lng: 88.2627 },
  gangtok: { lat: 27.3389, lng: 88.6065 },
  shillong: { lat: 25.5788, lng: 91.8933 },
  kaziranga: { lat: 26.5775, lng: 93.1711 },
  guwahati: { lat: 26.1445, lng: 91.7362 },
  tawang: { lat: 27.5859, lng: 91.8594 },
  puri: { lat: 19.8135, lng: 85.8312 },
  konark: { lat: 19.8876, lng: 86.0945 },
  bhubaneswar: { lat: 20.2961, lng: 85.8245 },
  // Punjab / Gujarat / Andaman
  amritsar: { lat: 31.6340, lng: 74.8723 },
  'rann of kutch': { lat: 23.7337, lng: 70.8007 },
  kutch: { lat: 23.7337, lng: 70.8007 },
  dwarka: { lat: 22.2442, lng: 68.9685 },
  somnath: { lat: 20.8880, lng: 70.4013 },
  'port blair': { lat: 11.6234, lng: 92.7265 },
  andaman: { lat: 11.7401, lng: 92.6586 },
};

/** Historic default centroid (Bhopal). Kept only for legacy callers that need SOME coordinate. */
export const DEFAULT_GEO = { lat: 23.2599, lng: 77.4126 };

export interface DestinationResolution {
  lat: number;
  lng: number;
  /** false means the destination could not be located — callers must not treat the coordinates as the destination. */
  resolved: boolean;
  source: 'known' | 'database' | 'default';
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Resolves a destination string to a centroid, with an explicit `resolved` flag.
 * Database matching means any city with seeded places resolves correctly, even
 * when it's missing from the offline table.
 */
export async function resolveDestinationCentroid(location: string): Promise<DestinationResolution> {
  const key = canonicalizeDestination(location) || normalizeDestinationKey(location);
  if (!key) return { ...DEFAULT_GEO, resolved: false, source: 'default' };

  if (KNOWN_LOCATIONS[key]) return { ...KNOWN_LOCATIONS[key], resolved: true, source: 'known' };

  // Longest-name-first so "new delhi" wins over "delhi", "jim corbett" over shorter hits.
  const knownNames = Object.keys(KNOWN_LOCATIONS).sort((a, b) => b.length - a.length);
  for (const name of knownNames) {
    if (name.length < 3) continue;
    if (
      key === name
      || destinationMatchesInText(key, name)
      || (name.length >= 5 && destinationMatchesInText(name, key))
    ) {
      return { ...KNOWN_LOCATIONS[name], resolved: true, source: 'known' };
    }
  }

  try {
    const matches = await prisma.place.findMany({
      where: {
        status: 'APPROVED',
        latitude: { not: null },
        longitude: { not: null },
        OR: [
          { city: { equals: key, mode: 'insensitive' } },
          { city: { contains: key, mode: 'insensitive' } },
          { state: { equals: key, mode: 'insensitive' } },
          { state: { contains: key, mode: 'insensitive' } },
        ],
      },
      select: { latitude: true, longitude: true, city: true },
      take: 80,
    });

    if (matches.length > 0) {
      // Prefer exact city matches when available so a state-wide query doesn't skew the centroid.
      const exactCity = matches.filter((m) => normalizeDestinationKey(m.city || '') === key);
      const pool = exactCity.length > 0 ? exactCity : matches;
      const lats = pool.map((m) => m.latitude as number).sort((a, b) => a - b);
      const lngs = pool.map((m) => m.longitude as number).sort((a, b) => a - b);
      return { lat: median(lats), lng: median(lngs), resolved: true, source: 'database' };
    }
  } catch {
    // DB unavailable — fall through to unresolved rather than failing generation outright.
  }

  // Unresolved: coordinates are placeholders only. Callers MUST NOT radius-search them.
  return { ...DEFAULT_GEO, resolved: false, source: 'default' };
}

/** Legacy signature: returns coordinates only (default centroid when unresolved). */
export async function geocodeLocation(location: string): Promise<{ lat: number; lng: number }> {
  const resolution = await resolveDestinationCentroid(location);
  return { lat: resolution.lat, lng: resolution.lng };
}
